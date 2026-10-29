// HTTPSで公式配布レジストリのメタデータだけを取得する。URLは呼出側から受け取らない。
const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const versions = require("./app/src/image-versions");
const MAX_BYTES = 2 * 1024 * 1024;
function requestJSON(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "hub.docker.com" || u.port || u.username || u.password || !u.pathname.startsWith("/v2/namespaces/")) return Promise.reject(new Error("許可されていない配信元です。"));
  return new Promise((resolve, reject) => {
    const req = https.get(u, { rejectUnauthorized: true, headers: { Accept: "application/json", "Accept-Encoding": "identity" } }, res => {
      // redirect先を無条件に信用しない。TLS証明書検証はNodeの既定を維持する。
      if (res.statusCode !== 200 || !/^application\/json\b/i.test(res.headers["content-type"] || "") ||
        (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
        res.resume(); reject(new Error(`公式レジストリの応答が不正です（HTTP ${res.statusCode}）。`)); return;
      }
      let size = 0; const chunks = [];
      res.on("data", chunk => { size += chunk.length; if (size > MAX_BYTES) req.destroy(new Error("更新データが大きすぎます。")); else chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("更新データのJSONが不正です。")); } });
    });
    const timer = setTimeout(() => req.destroy(new Error("更新がタイムアウトしました。")), 15000);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject);
  });
}
function endpoint(slot, tag) {
  const [namespace, repository] = slot.repository.split("/");
  return `https://hub.docker.com/v2/namespaces/${namespace}/repositories/${repository}/tags${tag ? "/" + encodeURIComponent(tag) : "?page_size=100&ordering=last_updated&name=" + encodeURIComponent(slot.query)}`;
}
function entryFromTag(slot, data, checkedAt) {
  if (!data || typeof data.name !== "string" || !new RegExp(slot.pattern).test(data.name) || !versions.digestPattern.test(data.digest) || !Array.isArray(data.images) || data.images.length > 100) throw new Error("公式タグの形式が不正です。");
  const platforms = [];
  for (const image of data.images) {
    if (image.os !== "linux" || !["amd64", "arm64", "arm", "386", "ppc64le", "s390x", "riscv64"].includes(image.architecture)) continue;
    if (!versions.digestPattern.test(image.digest)) throw new Error("公式タグのdigestが不正です。");
    if (!platforms.some(p => p.architecture === image.architecture)) platforms.push({ architecture: image.architecture, digest: image.digest });
  }
  if (!platforms.some(p => p.architecture === "amd64")) throw new Error("Linux amd64のイメージを確認できません。");
  return { slotId: slot.id, tag: data.name, digest: data.digest, platforms, checkedAt,
    scan: { state: "unscanned", checkedAt: null, digest: null, findings: [] } };
}
async function collect(previous, fetchJSON = requestJSON, now = new Date().toISOString(), progress = () => {}) {
  versions.validate(previous);
  const entries = [];
  // 全件成功時だけ反映する。途中失敗で既存カタログを失わない。
  for (const slot of versions.slots) {
    const list = await fetchJSON(endpoint(slot));
    if (!list || !Array.isArray(list.results) || list.results.length > 100) throw new Error("タグ一覧が不正です。");
    const tags = list.results.filter(t => typeof t.name === "string" && new RegExp(slot.pattern).test(t.name))
      .sort((a, b) => b.name.localeCompare(a.name, "en", { numeric: true }));
    // 検索ページに候補がなければ既存の完全タグを直接確認する。文字列合成はしない。
    const old = previous.entries.find(e => e.slotId === slot.id);
    if (!tags.length && !old) { progress(`${slot.id}: 候補なし`); continue; }
    const tag = tags[0]?.name || old.tag;
    const detail = await fetchJSON(endpoint(slot, tag));
    if (detail?.name !== tag) throw new Error("要求したタグと応答が一致しません。");
    const fresh = entryFromTag(slot, detail, now);
    // 同じdigestの既知CVEをタグ更新だけで消さない。内容が変われば未検査へ戻す。
    if (old?.digest === fresh.digest && old.scan.state === "scanned") fresh.scan = structuredClone(old.scan);
    entries.push(fresh);
    progress(`${slot.id}: ${tag}`);
  }
  const result = versions.validate({ schemaVersion: 1, checkedAt: now, entries });
  // 更新で既存サービスの候補が消失したデータは適用しない。
  for (const id of new Set(previous.entries.map(e => versions.slots.find(s => s.id === e.slotId).moduleId))) {
    if (!versions.candidates(result, id).length) throw new Error("更新で既存候補が失われました。");
  }
  return result;
}
function createStore(directory, bundled) {
  versions.validate(bundled);
  const filename = path.join(directory, "image-catalog-v1.json");
  let current = bundled, loaded = false, pending;
  async function read() {
    if (!loaded) {
      try {
        const stat = await fs.lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("Invalid cache");
        const envelope = JSON.parse(await fs.readFile(filename, "utf8"));
        const data = JSON.stringify(envelope.catalog);
        // ローカル破損の検出用。これを配信物の署名とは扱わない。
        if (crypto.createHash("sha256").update(data).digest("hex") !== envelope.sha256) throw new Error("Invalid cache checksum");
        const candidate = versions.validate(envelope.catalog);
        if (Date.parse(candidate.checkedAt) >= Date.parse(bundled.checkedAt)) current = candidate;
      } catch { /* 破損・未作成は同梱データへフォールバックする。 */ }
      loaded = true;
    }
    return structuredClone(current);
  }
  async function update(fetchJSON = requestJSON, now) {
    if (pending) return pending;
    pending = (async () => {
      const previous = await read();
      const next = await collect(previous, fetchJSON, now);
      if (Date.parse(next.checkedAt) < Date.parse(previous.checkedAt)) throw new Error("古い更新日時を拒否しました。");
      await fs.mkdir(directory, { recursive: true });
      const data = JSON.stringify(next);
      const temp = filename + "." + crypto.randomUUID() + ".tmp";
      try {
        await fs.writeFile(temp, JSON.stringify({ catalog: next, sha256: crypto.createHash("sha256").update(data).digest("hex") }), { flag: "wx", mode: 0o600 });
        await fs.rename(temp, filename);
      } finally { await fs.rm(temp, { force: true }); }
      current = next;
      return structuredClone(current);
    })().finally(() => { pending = null; });
    return pending;
  }
  return { read, update };
}
module.exports = { requestJSON, endpoint, entryFromTag, collect, createStore };

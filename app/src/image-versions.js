/* 共通の候補・検証・判定。mainとrendererで同じポリシーを使用する。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ImageVersions = api;
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const CHECKED = "2026-10-26T00:00:00.000Z";
  const slots = [];
  function add(moduleId, repository, series, variant, pattern, query, support, eol, source, warning = "") {
    slots.push({ id: `${moduleId}/${series}/${variant}`, moduleId, repository, series, variant,
      pattern, query, support, eol, source, warning });
  }
  for (const series of ["24", "22", "20"]) for (const variant of ["bookworm-slim", "alpine"]) {
    add("nodejs", "library/node", series, variant, `^${series}\\.\\d+\\.\\d+-${variant === "alpine" ? "alpine\\d+\\.\\d+" : "bookworm-slim"}$`, `${series}.`,
      series === "20" ? "eol" : "supported", { "24": "2028-04-30", "22": "2027-04-30", "20": "2026-04-30" }[series],
      "https://nodejs.org/en/about/previous-releases");
  }
  for (const series of ["3.14", "3.13", "3.12"]) for (const variant of ["slim-bookworm", "alpine3.22"]) {
    add("python-web", "library/python", series, variant, `^${series.replace(".", "\\.")}\\.\\d+-${variant.replaceAll(".", "\\.")}$`, `${series}.`, "supported",
      { "3.14": "2030-10", "3.13": "2029-10", "3.12": "2028-10" }[series], "https://devguide.python.org/versions/");
  }
  for (const variant of ["debian", "alpine"]) add("nginx", "library/nginx", "1.30", variant,
    `^1\\.30\\.\\d+-${variant === "debian" ? "(?:bookworm|trixie)" : "alpine"}$`, "1.30.", "supported", null, "https://nginx.org/en/download.html");
  add("apache", "library/httpd", "2.4", "alpine", "^2\\.4\\.\\d+-alpine$", "2.4.", "supported", null, "https://httpd.apache.org/");
  for (const series of ["8.4", "8.3", "8.2"]) add("laravel", "library/php", series, "cli-bookworm",
    `^${series.replace(".", "\\.")}\\.\\d+-cli-bookworm$`, `${series}.`, "supported",
    { "8.4": "2028-12-31", "8.3": "2027-12-31", "8.2": "2026-12-31" }[series], "https://www.php.net/supported-versions.php");
  add("composer", "library/composer", "2", "default", "^2\\.\\d+\\.\\d+$", "2.", "unknown", null, "https://getcomposer.org/download/");
  add("mysql", "library/mysql", "8.4", "default", "^8\\.4\\.\\d+$", "8.4.", "supported", null, "https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html");
  add("mysql", "library/mysql", "8.0", "default", "^8\\.0\\.\\d+$", "8.0.", "eol", "2026-04", "https://dev.mysql.com/doc/relnotes/mysql/8.0/en/");
  add("mariadb", "library/mariadb", "11.4", "default", "^11\\.4\\.\\d+$", "11.4.", "supported", "2029-05-29", "https://mariadb.org/about/#maintenance-policy");
  add("mariadb", "library/mariadb", "10.11", "default", "^10\\.11\\.\\d+$", "10.11.", "supported", "2028-02-16", "https://mariadb.org/about/#maintenance-policy");
  add("postgres", "library/postgres", "16", "bookworm", "^16\\.\\d+-bookworm$", "16.", "supported", "2028-11-09", "https://www.postgresql.org/support/versioning/");
  add("postgres", "library/postgres", "16", "alpine", "^16\\.\\d+-alpine$", "16.", "supported", "2028-11-09", "https://www.postgresql.org/support/versioning/");
  add("redis", "library/redis", "7.4", "alpine", "^7\\.4\\.\\d+-alpine$", "7.4.", "supported", "2029-12-01", "https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/");
  add("memcached", "library/memcached", "1.6", "alpine", "^1\\.6\\.\\d+-alpine$", "1.6.", "supported", null, "https://memcached.org/downloads");
  add("rabbitmq", "library/rabbitmq", "4.3", "management", "^4\\.3\\.\\d+-management$", "4.3.", "supported", "2027-01-31", "https://www.rabbitmq.com/release-information");
  add("rabbitmq", "library/rabbitmq", "3.13", "management", "^3\\.13\\.\\d+-management$", "3.13.", "eol", "2024-09-30", "https://www.rabbitmq.com/release-information");
  add("wordpress", "library/wordpress", "stable", "php8.4-apache", "^\\d+\\.\\d+\\.\\d+-php8\\.4-apache$", "php8.4-apache", "unknown", null, "https://wordpress.org/about/requirements/", "WordPress本体・内包OSの保守状態は未確認です。");
  add("redmine", "library/redmine", "stable", "bookworm", "^\\d+\\.\\d+\\.\\d+-bookworm$", "bookworm", "unknown", null, "https://www.redmine.org/projects/redmine/wiki/RedmineInstall");
  add("phpmyadmin", "phpmyadmin/phpmyadmin", "5.2", "apache", "^5\\.2\\.\\d+$", "5.2.", "unknown", null, "https://www.phpmyadmin.net/");
  add("jenkins", "jenkins/jenkins", "LTS", "jdk21", "^2\\.\\d+\\.[1-9]\\d*-jdk21$", "jdk21", "unknown", null, "https://www.jenkins.io/doc/book/platform-information/support-policy-java/", "Java21対応。Jenkins本体・プラグインの保守/互換性は別途確認してください。");
  add("portainer", "portainer/portainer-ce", "2.45", "LTS", "^2\\.45\\.\\d+$", "2.45.", "unknown", null, "https://portainer.io/blog/portainer-2-45-lts-release");
  add("ollama", "ollama/ollama", "stable", "default", "^\\d+\\.\\d+\\.\\d+$", "", "unknown", null, "https://github.com/ollama/ollama");
  add("certbot", "certbot/certbot", "stable", "default", "^v?\\d+\\.\\d+\\.\\d+$", "", "unknown", null, "https://certbot.eff.org/");
  add("steamcmd", "steamcmd/steamcmd", "ubuntu", "24", "^ubuntu-24(?:\\.04)?(?:-[\\d.-]+)?$", "ubuntu-24", "unknown", null, "https://hub.docker.com/r/steamcmd/steamcmd", "コミュニティ配布です。Valve公式のDockerイメージではありません。ゲームごとの要件確認が必要です。");

  const digestPattern = /^sha256:[a-f0-9]{64}$/;
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  function keys(value, allowed) {
    if (!plain(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error("不正なカタログ形式です。");
  }
  function date(value, now) {
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value || Date.parse(value) > now + 300000) throw new Error("不正な確認日時です。");
  }
  function validate(catalog, now = Date.now()) {
    if (JSON.stringify(catalog)?.length > 500000) throw new Error("カタログが大きすぎます。");
    keys(catalog, ["schemaVersion", "checkedAt", "entries"]);
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries) || catalog.entries.length > 200) throw new Error("未対応のカタログです。");
    date(catalog.checkedAt, now);
    const ids = new Set();
    for (const e of catalog.entries) {
      keys(e, ["slotId", "tag", "digest", "platforms", "checkedAt", "scan"]);
      const slot = slots.find(s => s.id === e.slotId);
      if (!slot || ids.has(e.slotId) || typeof e.tag !== "string" || e.tag.length > 128 || !new RegExp(slot.pattern).test(e.tag) || !digestPattern.test(e.digest)) throw new Error("許可されていないイメージ候補です。");
      ids.add(e.slotId); date(e.checkedAt, now);
      if (Date.parse(e.checkedAt) > Date.parse(catalog.checkedAt)) throw new Error("確認日時が一致しません。");
      if (!Array.isArray(e.platforms) || !e.platforms.length || e.platforms.length > 20) throw new Error("プラットフォームが不正です。");
      const arches = new Set();
      for (const p of e.platforms) {
        keys(p, ["architecture", "digest"]);
        if (!["amd64", "arm64", "arm", "386", "ppc64le", "s390x", "riscv64"].includes(p.architecture) || arches.has(p.architecture) || !digestPattern.test(p.digest)) throw new Error("プラットフォームが不正です。");
        arches.add(p.architecture);
      }
      keys(e.scan, ["state", "checkedAt", "digest", "findings"]);
      if (!["unscanned", "scanned"].includes(e.scan.state) || !Array.isArray(e.scan.findings) || e.scan.findings.length > 200) throw new Error("検査情報が不正です。");
      if (e.scan.state === "scanned") {
        date(e.scan.checkedAt, now);
        if (e.scan.digest !== e.digest) throw new Error("検査対象digestが一致しません。");
      } else if (e.scan.findings.length || e.scan.checkedAt !== null || e.scan.digest !== null) throw new Error("未検査情報が不正です。");
      for (const finding of e.scan.findings) {
        keys(finding, ["id", "severity", "package", "fixedVersion"]);
        if (!["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"].includes(finding.severity) ||
          [finding.id, finding.package, finding.fixedVersion].some(v => typeof v !== "string" || v.length > 256 || /[\u0000-\u001f]/.test(v))) throw new Error("脆弱性詳細が不正です。");
      }
    }
    return catalog;
  }
  function candidates(catalog, moduleId) {
    return slots.filter(s => s.moduleId === moduleId).flatMap(slot => {
      const entry = catalog?.entries.find(e => e.slotId === slot.id);
      return entry ? [{ ...slot, ...entry, image: `${slot.repository.replace(/^library\//, "")}:${entry.tag}@${entry.digest}`, supportCheckedAt: CHECKED }] : [];
    });
  }
  function assess(entry, now = Date.now()) {
    if (!entry) return { blocked: true, exceptionAllowed: false, messages: ["タグ存在未確認：確認済み候補がありません。更新してください。"] };
    const messages = [];
    // 月だけ公表されるEOLは、その月の末日までと解釈し、日付精度も表示する。
    const eol = entry.eol && Date.parse(entry.eol.length === 7 ? new Date(Date.UTC(Number(entry.eol.slice(0, 4)), Number(entry.eol.slice(5)), 0)).toISOString().slice(0, 10) + "T23:59:59.999Z" : entry.eol + "T23:59:59.999Z");
    const ended = entry.support === "eol" || (eol && now > eol);
    messages.push(ended ? "EOL：通常生成を制限します。" : entry.support === "supported" ? "サポート中（ランタイム系列）" : "サポート状態未確認");
    if (entry.eol) messages.push(`EOL予定/終了：${entry.eol}`);
    messages.push(`保守情報確認：${CHECKED.slice(0, 10)}（内包OS・追加依存は別途確認）`);
    if (now - Date.parse(CHECKED) > 30 * 86400000) messages.push("保守情報が古いため公式情報を再確認してください。");
    const serious = entry.scan.findings.filter(f => ["HIGH", "CRITICAL"].includes(f.severity));
    if (entry.scan.state === "unscanned") messages.push("脆弱性未検査：安全性は確認されていません。");
    else {
      messages.push(`脆弱性検査済み：${entry.scan.checkedAt}`);
      if (now - Date.parse(entry.scan.checkedAt) > 7 * 86400000) messages.push("検査情報が古い状態です。");
      serious.forEach(f => messages.push(`${f.severity} ${f.id} ${f.package} 修正版：${f.fixedVersion || "未提供"}`));
    }
    messages.push(`タグ確認：${entry.checkedAt}`);
    if (now - Date.parse(entry.checkedAt) > 30 * 86400000) messages.push("タグ情報が古い状態です。オンライン更新を推奨します。");
    if (entry.warning) messages.push(entry.warning);
    return { blocked: !!(ended || serious.length), exceptionAllowed: true, messages };
  }
  return { slots, validate, candidates, assess, digestPattern, supportCheckedAt: CHECKED };
});

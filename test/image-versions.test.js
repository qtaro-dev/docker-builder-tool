const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const versions = require("../app/src/image-versions");
const bundled = require("../app/data/image-catalog.json");
const generation = require("../app/src/project-generation");
const guideModel = require("../app/src/generation-guide");
const { collect, createStore, endpoint, requestJSON, entryFromTag } = require("../image-catalog");
const now = Date.parse(bundled.checkedAt) + 60000;
const clone = x => structuredClone(x);
function modules() {
  const result = [];
  const context = vm.createContext({ window: { ProjectGeneration: generation }, registerModule: mod => result.push(mod) });
  for (const name of fs.readdirSync(path.join(__dirname, "../app/src/modules"))) if (name.endsWith(".js")) vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/src/modules", name), "utf8"), context);
  return result;
}
const all = modules();
function make(ids, overrides = {}, selections = new Map(), catalog = bundled, allowUnsafe = false) {
  const mods = all.filter(m => ids.includes(m.id));
  const configs = new Map(mods.map(m => [m.id, { ...Object.fromEntries((m.fields || []).map(f => [f.name, f.default ?? ""])), ...(overrides[m.id] || {}) }]));
  return generation.build({ modules: mods, configs, catalog, selections, projectName: "test", now, allowUnsafe });
}
function fakeHub(catalog = bundled) {
  return async url => {
    const u = new URL(url), match = u.pathname.match(/^\/v2\/namespaces\/([^/]+)\/repositories\/([^/]+)\/tags(?:\/(.+))?$/);
    assert.ok(match); assert.equal(u.origin, "https://hub.docker.com");
    const repo = match[1] + "/" + match[2];
    const entries = catalog.entries.filter(e => versions.slots.find(s => s.id === e.slotId).repository === repo);
    const detail = e => ({ name: e.tag, digest: e.digest, images: e.platforms.map(p => ({ ...p, os: "linux" })) });
    if (match[3]) { const e = entries.find(e => e.tag === decodeURIComponent(match[3])); assert.ok(e); return detail(e); }
    return { results: entries.map(detail) };
  };
}

test("bundled catalog covers all 19 modules, exact tags, digest and supported defaults where verified", () => {
  versions.validate(bundled, now);
  assert.equal(all.length, 19);
  for (const mod of all) {
    const choices = versions.candidates(bundled, mod.id);
    assert.ok(choices.length, mod.id);
    assert.doesNotMatch(choices[0].image, /:latest/);
    assert.match(choices[0].image, /@sha256:[a-f0-9]{64}$/);
    assert.equal(versions.assess(choices[0], now).blocked, false, mod.id);
    assert.equal(choices[0].scan.state, "unscanned");
  }
});

test("all module defaults produce models or explain required DB/domain; complete prerequisites generate", () => {
  for (const mod of all) {
    const initial = make([mod.id]);
    if (["wordpress", "redmine", "phpmyadmin", "laravel", "certbot"].includes(mod.id)) assert.ok(initial.errors.length, mod.id);
    else assert.deepEqual(initial.errors, [], mod.id);
    const ids = [mod.id];
    if (["wordpress", "redmine", "phpmyadmin", "laravel"].includes(mod.id)) ids.push("mysql");
    const output = make(ids, { certbot: { domain: "example.invalid" } });
    assert.deepEqual(output.errors, [], mod.id);
    assert.ok(output.services.length, mod.id);
    assert.ok(output.warnings.some(s => s.includes("未検査")), mod.id);
  }
});

test("every candidate reaches Compose image or matching service FROM/build without concatenation", () => {
  for (const mod of all) for (const choice of versions.candidates(bundled, mod.id)) {
    const ids = [mod.id]; if (["wordpress", "redmine", "phpmyadmin", "laravel"].includes(mod.id)) ids.push("mysql");
    const output = make(ids, { certbot: { domain: "example.invalid" } }, new Map([[mod.id, choice]]), bundled, true);
    assert.deepEqual(output.errors, [], choice.image);
    const svc = output.services.find(s => s.name.includes(mod.id === "python-web" ? "django" : mod.id));
    assert.ok(svc, mod.id);
    if (generation.buildModules.includes(mod.id)) {
      assert.equal(svc.image, undefined);
      assert.equal(svc.build.context, `./${mod.id}`);
      const file = output.files.find(f => f.filename === svc.build.dockerfile);
      assert.ok(file.content.includes(`FROM ${choice.image}`), mod.id);
      assert.equal(file.relativePath, `${mod.id}/${svc.build.dockerfile}`);
      assert.equal((file.content.match(/^FROM /gm) || []).length, 1);
    } else assert.equal(svc.image, choice.image);
  }
  const multiple = make(["nginx", "nodejs", "python-web"]);
  assert.equal(multiple.files.filter(f => f.filename.endsWith(".dockerignore")).length, 2);
  assert.equal(new Set(multiple.files.map(f => f.relativePath)).size, 4);
});

test("Laravel uses PHP CLI HTTP8000, locked Composer, extensions, runtime env and ignore file", () => {
  const output = make(["laravel", "postgres"]);
  assert.deepEqual(output.errors, []);
  const laravel = output.services.find(s => s.name === "test-laravel");
  assert.deepEqual([...laravel.command], ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]);
  assert.ok(laravel.ports.includes("8000:8000"));
  assert.equal(laravel.environment.DB_CONNECTION, "pgsql");
  assert.equal(laravel.environment.DB_PORT, "5432");
  assert.equal(laravel.env_file[0], "./laravel/.env");
  const file = output.files.find(f => f.filename === "Dockerfile.laravel");
  assert.match(file.content, /FROM php:8\.4\.\d+-cli-bookworm@sha256:/);
  assert.match(file.content, /COPY --from=composer:2\.\d+\.\d+@sha256:/);
  assert.match(file.content, /pdo_mysql pdo_pgsql intl mbstring zip bcmath/);
  assert.match(file.content, /composer install/);
  assert.doesNotMatch(file.content, /php-fpm|bitnami|9000/);
  assert.match(output.files.find(f => f.filename.endsWith(".dockerignore")).content, /^\.env$/m);
});

test("DB product, host and custom credentials are checked across supported combinations", () => {
  for (const app of ["wordpress", "phpmyadmin", "redmine", "laravel"]) for (const db of ["mysql", "mariadb"]) {
    const output = make([app, db]); assert.deepEqual(output.errors, []);
    const svc = output.services.find(s => s.name === `test-${app}`);
    assert.equal(svc.depends_on[0], `test-${db}`);
    assert.ok(Object.values(svc.environment).includes("appuser"));
  }
  assert.ok(make(["wordpress", "postgres"]).errors.length);
  assert.ok(make(["phpmyadmin", "postgres"]).errors.length);
  assert.ok(make(["laravel", "mysql", "mariadb"]).errors.length);
  assert.deepEqual(make(["laravel", "mysql", "mariadb"], { laravel: { dbHost: "test-mysql" } }).errors, []);
  assert.ok(make(["laravel", "mysql"], { laravel: { dbPassword: "different" } }).errors.length);
  for (const web of ["nginx", "apache"]) assert.ok(make([web, "laravel", "mysql"]).notes.some(s => s.includes("リバースプロキシ")));
});

test("EOL and High/Critical block normally; explicit testing exception never permits unknown tag", () => {
  const node20 = versions.candidates(bundled, "nodejs").find(e => e.series === "20");
  assert.ok(make(["nodejs"], {}, new Map([["nodejs", node20]])).errors.length);
  assert.deepEqual(make(["nodejs"], {}, new Map([["nodejs", node20]]), bundled, true).errors, []);
  const high = clone(versions.candidates(bundled, "nginx")[0]);
  high.scan = { state: "scanned", checkedAt: bundled.checkedAt, digest: high.digest, findings: [{ id: "CVE-TEST", severity: "HIGH", package: "fixture", fixedVersion: "" }] };
  const scanned = clone(bundled);
  scanned.entries.find(e => e.slotId === high.slotId).scan = high.scan;
  assert.ok(make(["nginx"], {}, new Map([["nginx", high]]), scanned).errors.length);
  assert.deepEqual(make(["nginx"], {}, new Map([["nginx", high]]), scanned, true).errors, []);
  const fakeValidTag = { ...versions.candidates(bundled, "nodejs")[0], tag: "24.999.999-bookworm-slim" };
  assert.ok(make(["nodejs"], {}, new Map([["nodejs", fakeValidTag]]), bundled, true).errors.length);
  high.tag = "nonexistent:injected";
  assert.ok(make(["nginx"], {}, new Map([["nginx", high]]), bundled, true).errors.length);
  const status = versions.assess(node20, now + 40 * 86400000);
  assert.ok(status.messages.some(m => m.includes("情報が古い")));
  assert.ok(status.messages.some(m => m.includes("未検査")));
  const python = versions.candidates(bundled, "python-web").find(e => e.series === "3.12");
  assert.equal(versions.assess(python, Date.parse("2028-10-31T12:00:00.000Z")).blocked, false);
  assert.equal(versions.assess(python, Date.parse("2028-11-01T00:00:00.000Z")).blocked, true);
  const badDigest = clone(bundled); badDigest.entries[0].scan = { state: "scanned", checkedAt: bundled.checkedAt, digest: "sha256:" + "0".repeat(64), findings: [] };
  assert.throws(() => versions.validate(badDigest, now));
});

test("catalog rejects tampered schema, payloads, duplicate slots, future times and repositories", () => {
  const changes = [
    c => c.schemaVersion++, c => c.url = "https://evil.invalid", c => c.entries.push(c.entries[0]),
    c => c.checkedAt = "2099-01-01T00:00:00.000Z", c => c.entries[0].tag = "latest",
    c => c.entries[0].digest = "wrong", c => c.entries[0].repository = "evil/image",
    c => c.entries[0].slotId = "unknown", c => c.entries[0].platforms = [],
    c => c.entries[0].platforms[0].digest = "x", c => c.entries[0].scan.findings = [{ severity: "HIGH" }],
    c => c.entries = Array(201).fill(c.entries[0]),
  ];
  for (const change of changes) { const c = clone(bundled); change(c); assert.throws(() => versions.validate(c, now)); }
});

test("tag refresh retains known findings only for the same image digest", async () => {
  const previous = clone(bundled);
  previous.entries[0].scan = { state: "scanned", checkedAt: bundled.checkedAt, digest: previous.entries[0].digest,
    findings: [{ id: "CVE-TEST", severity: "CRITICAL", package: "fixture", fixedVersion: "" }] };
  const same = await collect(previous, fakeHub(), new Date(now).toISOString());
  assert.equal(same.entries[0].scan.findings[0].severity, "CRITICAL");
  const changed = clone(bundled); changed.entries[0].digest = "sha256:" + "1".repeat(64);
  const fresh = await collect(previous, fakeHub(changed), new Date(now).toISOString());
  assert.equal(fresh.entries[0].scan.state, "unscanned");
});

test("online official metadata refresh verifies details and resets scan; failed refresh retains cache/offline data", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "image-catalog-test-"));
  try {
    const store = createStore(dir, bundled);
    assert.deepEqual(await store.read(), bundled);
    const next = await store.update(fakeHub(), new Date(now).toISOString());
    assert.ok(next.entries.length);
    assert.equal(next.checkedAt, new Date(now).toISOString());
    assert.deepEqual(await createStore(dir, bundled).read(), next);
    const bytes = await fsp.readFile(path.join(dir, "image-catalog-v1.json"));
    await assert.rejects(store.update(async () => { throw new Error("offline"); }));
    assert.deepEqual(await store.read(), next);
    assert.deepEqual(await fsp.readFile(path.join(dir, "image-catalog-v1.json")), bytes);
    await assert.rejects(store.update(fakeHub(), new Date(Date.parse(bundled.checkedAt) - 1000).toISOString()));
    assert.deepEqual(await store.read(), next);
    const rename = fsp.rename;
    try {
      fsp.rename = async () => { throw new Error("simulated disk failure"); };
      await assert.rejects(store.update(fakeHub(), new Date(now + 1000).toISOString()));
      assert.deepEqual(await store.read(), next);
      assert.deepEqual(await fsp.readFile(path.join(dir, "image-catalog-v1.json")), bytes);
    } finally { fsp.rename = rename; }
    await assert.rejects(store.update(async () => ({ results: [{ name: "latest", digest: "bad" }] })));
    await fsp.writeFile(path.join(dir, "image-catalog-v1.json"), "broken");
    assert.deepEqual(await createStore(dir, bundled).read(), bundled);
    await assert.rejects(collect(bundled, async url => url.includes("?" ) ? fakeHub()(url) : { name: "other", digest: "sha256:" + "0".repeat(64) }));
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});

test("network boundary rejects arbitrary endpoints, redirects, oversized bodies and wrong content types", async () => {
  for (const url of ["http://hub.docker.com/v2/namespaces/library", "https://evil.invalid/", "https://hub.docker.com:444/v2/namespaces/a", "https://user@hub.docker.com/v2/namespaces/a"]) await assert.rejects(requestJSON(url));
  const original = https.get;
  try {
    for (const scenario of ["redirect", "content", "size", "encoding"]) {
      https.get = (_url, _opts, callback) => {
        const req = new EventEmitter();
        req.destroy = error => { req.emit("error", error); req.emit("close"); };
        process.nextTick(() => {
          const res = new EventEmitter(); res.resume = () => req.emit("close");
          res.statusCode = scenario === "redirect" ? 302 : 200;
          res.headers = { "content-type": scenario === "content" ? "text/html" : "application/json", "content-encoding": scenario === "encoding" ? "gzip" : "identity" };
          callback(res);
          if (scenario === "size") res.emit("data", Buffer.alloc(2 * 1024 * 1024 + 1));
        });
        return req;
      };
      await assert.rejects(requestJSON(endpoint(versions.slots[0])));
    }
  } finally { https.get = original; }
  assert.throws(() => entryFromTag(versions.slots[0], { name: "24.0.0-bookworm-slim", digest: "sha256:" + "0".repeat(64), images: [] }, bundled.checkedAt));
});

test("Node default embeds app without /app volume and installs only at build time", () => {
  const node = all.find(m => m.id === "nodejs");
  assert.equal(node.fields.find(f => f.name === "startCmd").default, "npm run dev");
  assert.equal(node.fields.find(f => f.name === "dataStoreType").default, "image");
  const output = make(["nginx", "nodejs"], { nodejs: { hostPort: 4567 } });
  assert.deepEqual(output.errors, []);
  const service = output.services.find(s => s.name === "test-nodejs");
  assert.equal(service.volumes.length, 0);
  assert.equal([...output.volumes].some(v => v.includes("node-app")), false);
  assert.equal(service.ports[0], "4567:3000");
  assert.deepEqual([...service.command], ["sh", "-c", "npm run dev"]);
  const file = output.files.find(f => f.filename === "Dockerfile.nodejs");
  assert.match(file.content, /COPY package.json package-lock.json/);
  assert.equal((file.content.match(/RUN npm ci/g) || []).length, 1);
  const cmd = JSON.parse(file.content.split("\n").find(line => line.startsWith("CMD ")).slice(4));
  assert.deepEqual(cmd, [...service.command]);
  assert.doesNotMatch(cmd.join(" "), /npm (install|ci)/);
  assert.equal(service.build.context, "./nodejs");
  assert.equal(service.build.dockerfile, file.filename);
  assert.match(output.files.find(f => f.filename === "Dockerfile.nodejs.dockerignore").content, /\.npmrc/);
});

test("Node custom commands and legacy named volume remain explicit with warnings; bind dependencies are isolated", () => {
  for (const command of ["npm install && npm run dev", "npm ci && npm run custom", 'node server.js --label "two words"']) {
    const output = make(["nodejs"], { nodejs: { startCmd: command, dataStoreType: "named", dataStoreName: "old-source" } });
    const svc = output.services[0];
    assert.equal(svc.command[2], command);
    assert.ok(svc.volumes.includes("test-old-source:/app"));
    const cmd = JSON.parse(output.files[0].content.split("\n").find(l => l.startsWith("CMD ")).slice(4));
    assert.deepEqual(cmd, [...svc.command]);
    assert.ok(output.warnings.some(w => w.includes("互換モード")));
    if (command.startsWith("npm")) assert.ok(output.warnings.some(w => w.includes("二重実行")));
  }
  const bind = make(["nodejs"], { nodejs: { dataStoreType: "bind", dataStorePath: "C:/my source" } });
  assert.ok(bind.services[0].volumes.includes("C:/my source:/app"));
  assert.ok(bind.services[0].volumes.includes("/app/node_modules"));
  assert.equal(bind.volumes.size, 0);
  const guide = guideModel.build(bind, "test");
  assert.ok(guide.startup.some(step => step.command?.includes("--renew-anon-volumes test-nodejs")));
});

test("guide matches generated files, context, versions and modes without claiming sources or proxy are generated", () => {
  const output = make(["nginx", "nodejs"]);
  const guide = guideModel.build(output, "test");
  for (const file of output.files) assert.ok(guide.tree.includes(file.filename));
  assert.ok(guide.tree.includes("package-lock.json（利用者が準備）"));
  assert.ok(guide.placement.some(p => p.includes("build.context = ./nodejs")));
  assert.ok(guide.startup.some(step => step.command === "docker compose config -q"));
  assert.ok(guide.startup.some(step => step.command === "docker compose up --build -d"));
  assert.ok(guide.security.some(p => p.includes("リバースプロキシ設定は自動生成しません")));
  assert.ok(guide.security.some(p => p.includes(output.images.find(e => e.moduleId === "nodejs").image)));
  assert.ok(guide.security.some(p => p.includes("未検査")));
  assert.ok(guide.security.some(p => p.includes("3000:3000")));
  assert.ok(guide.startup.some(step => step.command === "docker compose stop"));
  const next = guideModel.build(make(["nginx"]), "next");
  assert.doesNotMatch(next.tree, /nodejs|package-lock/);
  assert.ok(next.startup.some(step => step.command === "docker compose up -d"));
  assert.equal(next.startup.some(step => step.command?.includes("--build")), false);
  const certbot = guideModel.build(make(["certbot"], { certbot: { domain: "example.invalid" } }), "test");
  assert.ok(certbot.startup.some(step => step.command === "docker compose run --rm test-certbot"));
});

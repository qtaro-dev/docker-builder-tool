const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const window = {ProjectGeneration:require('../app/src/project-generation')};
  const modules = [];
  const context = vm.createContext({ window, registerModule: m => modules.push(m) });
  for (const file of fs.readdirSync(path.join(__dirname, "../app/src/modules"))) {
    if (file.endsWith(".js")) vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/src/modules", file), "utf8"), context, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/src/compose-serialization.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/src/renderer/generate.js"), "utf8"), context);
  return { modules, render: window.renderComposeYaml };
}

test("all 19 modules generate Compose and Dockerfile fragments with defaults", () => {
  const { modules, render } = load();
  assert.equal(modules.length, 19);
  for (const mod of modules) {
    const cfg = Object.fromEntries((mod.fields || []).map(f => [f.name, f.default ?? ""]));
    cfg.projectName = "regression";
    const partial = mod.buildCompose(cfg, { projectName: "regression", config: cfg });
    assert.ok(partial.services.length > 0, mod.id);
    assert.match(render({ services: partial.services, volumes: new Set(partial.volumes || []) }), /services:/);
    if (mod.buildDockerfile) assert.equal(typeof mod.buildDockerfile(cfg, { projectName: "regression", config: cfg }), "string");
    if ((mod.fields || []).some(f => f.name === "dataStoreType")) {
      cfg.dataStoreType = "bind";
      cfg.dataStorePath = "C:/project-data";
      const bind = mod.buildCompose(cfg, { projectName: "regression", config: cfg });
      assert.ok(bind.services.some(service => service.volumes?.some(volume => volume.includes("C:/project-data"))), mod.id);
    }
  }
});

test("Compose quotes untrusted YAML scalars and preserves command arguments", () => {
  const { render } = load();
  const injected = 'path # comment\n    privileged: true\n"quoted"\\path';
  const yaml = render({ services: [{ name: "test", image: "nginx:latest",
    volumes: [injected], environment: { PASSWORD: injected }, command: ["sh", "-c", injected] }], volumes: new Set() });
  assert.equal(yaml.includes("\n    privileged:"), false);
  const lines = yaml.split("\n");
  assert.equal(JSON.parse(lines.find(l => l.includes("path #")).trim().slice(2)), injected);
  assert.deepEqual(JSON.parse(lines.find(l => l.trim().startsWith("command:")).trim().slice(8)), ["sh", "-c", injected]);
});

test("Ollama model names cannot inject shell commands or CLI options", () => {
  const { modules } = load();
  const ollama = modules.find(m => m.id === "ollama");
  const model = "llama'; touch /tmp/injected; echo '";
  const output = ollama.buildCompose({ models: model }, { projectName: "test" });
  assert.ok(output.services[0].command[2].includes("ollama pull 'llama'\\''; touch /tmp/injected; echo '\\'''"));
  assert.throws(() => ollama.buildCompose({ models: "--insecure" }, { projectName: "test" }));
});

test("Compose build paths, runtime env/entrypoint and dollar literals survive YAML serialization", () => {
  const { render } = load();
  const yaml = render({ services: [{ name: "app", build: { context: "./laravel", dockerfile: "Dockerfile.laravel" },
    working_dir: "/app", env_file: ["./laravel/.env"], entrypoint: [], command: ["sh", "-c", 'echo "${APP_ID}"'],
    environment: { PASSWORD: "$literal" } }], volumes: new Set() });
  assert.doesNotMatch(yaml, /image:/);
  assert.match(yaml, /context: "\.\/laravel"/);
  assert.match(yaml, /dockerfile: "Dockerfile.laravel"/);
  assert.match(yaml, /entrypoint: \[\]/);
  assert.match(yaml, /\$\$\{APP_ID\}/);
  assert.match(yaml, /PASSWORD=\$\$literal/);
  const parsed = require("js-yaml").load(yaml);
  assert.equal(parsed.services.app.working_dir, "/app");
  assert.equal(parsed.services.app.env_file[0], "./laravel/.env");
});

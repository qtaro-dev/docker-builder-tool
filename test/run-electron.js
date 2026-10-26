// Run the real application in a disposable copy so tests cannot change the
// user's settings, logs, downloads or Electron profile.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electron = require("electron");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "docker-builder-test-"));
try {
  for (const name of ["main.js", "preload.js", "security.js", "image-catalog.js", "package.json", "app"]) {
    fs.cpSync(path.join(root, name), path.join(temporary, name), { recursive: true });
  }
  fs.copyFileSync(path.join(__dirname, "electron-smoke.js"), path.join(temporary, "smoke.js"));
  fs.copyFileSync(path.join(__dirname, "theme-settings-smoke.cjs"), path.join(temporary, "theme-settings-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "theme-restart-smoke.cjs"), path.join(temporary, "theme-restart-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "image-electron-smoke.cjs"), path.join(temporary, "image-electron-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "guide-electron-smoke.cjs"), path.join(temporary, "guide-electron-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "manual-generation-smoke.cjs"), path.join(temporary, "manual-generation-smoke.cjs"));
  const manifest = JSON.parse(fs.readFileSync(path.join(temporary, "package.json"), "utf8"));
  manifest.main = "smoke.js";
  fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify(manifest));
  const env = { ...process.env, DOCKER_BUILDER_SOURCE_ROOT: root, DOCKER_BUILDER_SCREENSHOT_DIR: path.join(root, "release/theme-previews") };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [temporary], {
    env, stdio: "inherit", timeout: 90000,
  });
  if (result.error) console.error(result.error);
  if (result.status !== 0) console.error(`Electron exited: status=${result.status}, signal=${result.signal}`);
  process.exitCode = result.status === 0 ? 0 : 1;
  if (result.status === 0) {
    // 別プロセスでmainから起動し直し、メモリ上のキャッシュに頼らず永続化を確認する。
    manifest.main = "theme-restart-smoke.cjs";
    fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify(manifest));
    const restarted = spawnSync(electron, [temporary], { env, stdio: "inherit", timeout: 30000 });
    if (restarted.error) console.error(restarted.error);
    process.exitCode = restarted.status === 0 ? 0 : 1;
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

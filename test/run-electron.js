// Run the real application in a disposable copy so tests cannot change the
// user's settings, logs, downloads or Electron profile.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electron = require("electron");
const root = path.resolve(__dirname, "..");
// Windows runnerのTEMPは8.3短縮名を含む。Chromiumと同じ実パスから起動し、
// アプリの厳密なIPC URL照合を変えずにテストする。
const temporary = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "docker-builder-test-")));
try {
  for (const name of ["main.js", "preload.js", "security.js", "image-catalog.js", "app-info.js", "app-paths.js", "user-manual.js", "package.json", "app"]) {
    fs.cpSync(path.join(root, name), path.join(temporary, name), { recursive: true });
  }
  // 同梱物を開くメニューも本物のパス解決で検査する。利用者のZIP等はコピーしない。
  for (const name of ['index.html','recipes.html','manual.css','manual.js','art','images','icons','examples']) fs.cpSync(path.join(root,'docs/manual',name),path.join(temporary,'docs/manual',name),{recursive:true});
  fs.copyFileSync(path.join(__dirname,'manual-menu-smoke.cjs'),path.join(temporary,'manual-menu-smoke.cjs'));
  fs.copyFileSync(path.join(__dirname, "electron-smoke.js"), path.join(temporary, "smoke.js"));
  fs.copyFileSync(path.join(__dirname, "theme-settings-smoke.cjs"), path.join(temporary, "theme-settings-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "theme-restart-smoke.cjs"), path.join(temporary, "theme-restart-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "image-electron-smoke.cjs"), path.join(temporary, "image-electron-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "guide-electron-smoke.cjs"), path.join(temporary, "guide-electron-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "manual-generation-smoke.cjs"), path.join(temporary, "manual-generation-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "configuration-ui-smoke.cjs"), path.join(temporary, "configuration-ui-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "module-selection-smoke.cjs"), path.join(temporary, "module-selection-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "web-support-smoke.cjs"), path.join(temporary, "web-support-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "output-layout-smoke.cjs"), path.join(temporary, "output-layout-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "bundle-folder-smoke.cjs"), path.join(temporary, "bundle-folder-smoke.cjs"));
  fs.copyFileSync(path.join(__dirname, "about-electron-smoke.cjs"), path.join(temporary, "about-electron-smoke.cjs"));
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

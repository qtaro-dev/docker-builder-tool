const { app, BrowserWindow, Menu, dialog, clipboard } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

app.setPath("userData", path.join(__dirname, "profile"));
app.setPath("sessionData", path.join(__dirname, "session"));
const errors = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (details) => {
    if (details.level === "error") errors.push(details.message);
  });
  contents.on("preload-error", (_event, _file, error) => errors.push(String(error)));
});
require("./main");

(async () => {
  await app.whenReady();
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;
  const run = (code) => wc.executeJavaScript(code, true);
  const until = async (code) => {
    for (let i = 0; i < 100; i++) {
      if (await run(code)) return;
      await delay(50);
    }
    throw new Error(`Timed out: ${code}`);
  };
  await until('document.querySelectorAll(".module-row").length === 19');
  const preferences = wc.getLastWebPreferences();
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.webSecurity, true);
  assert.deepEqual(await run('[typeof require, typeof process, typeof window.electronAPI.invoke]'),
    ["undefined", "undefined", "undefined"]);
  const version = require("./package.json").version;
  await until(`document.getElementById("aboutVersion").textContent === ${JSON.stringify(version)}`);
  console.log("PASS startup, 19 modules, isolation and version IPC");

  await run(`document.querySelector('[data-module-id="nginx"]').click();
    document.querySelector('[data-tab="config"]').click();
    document.getElementById('projectNameInput').value = 'security-test';
    document.querySelector('input[data-field-name="hostPort"]').value = '9090';
    document.getElementById('generateButton').click();`);
  await until('document.getElementById("composeOutput").value.includes("9090:80")');
  const compose = await run('document.getElementById("composeOutput").value');
  assert.match(compose, /security-test-nginx/);
  assert.match(compose, /nginx:latest/);
  console.log("PASS module selection, config inputs and Nginx Compose generation");

  // Stub only destination selection; the real save IPC and filesystem run.
  const download = async (button, filename) => {
    const destination = path.join(__dirname, filename);
    let selected = false;
    dialog.showSaveDialog = async (_parent, options) => {
      assert.equal(options.defaultPath, filename);
      selected = true;
      return { canceled: false, filePath: destination };
    };
    await run(`document.getElementById(${JSON.stringify(button)}).click()`);
    for (let i = 0; i < 100; i++) {
      if (selected && fs.existsSync(destination) && fs.statSync(destination).size > 0) {
        return fs.readFileSync(destination, "utf8");
      }
      await delay(50);
    }
    throw new Error("Save timed out");
  };
  await run('document.querySelector(\'[data-tab="output"]\').click()');
  assert.equal(await download("composeDownloadBtn", "docker-compose.yml"), compose);
  const previousClipboard = await clipboard.readText();
  try {
    await run('document.getElementById("composeCopyBtn").click()');
    for (let i = 0; i < 50 && (await clipboard.readText()).replace(/\r\n/g, "\n") !== compose; i++) await delay(50);
    assert.equal((await clipboard.readText()).replace(/\r\n/g, "\n"), compose);
  } finally { await clipboard.writeText(previousClipboard); }
  console.log("PASS Compose file download and clipboard copy");

  // Native dialogs are stubbed only at the OS boundary; the real preload/IPC runs.
  let options;
  dialog.showOpenDialog = async (_parent, value) => {
    options = value;
    return { canceled: false, filePaths: [__dirname] };
  };
  await run(`document.querySelector('[data-tab="config"]').click();
    const store = document.querySelector('select[data-field-name="dataStoreType"]');
    store.value = 'bind'; store.dispatchEvent(new Event('change'));
    document.querySelector('.btn-browse').click();`);
  await until(`document.querySelector('input[data-field-name="dataStorePath"]').value === ${JSON.stringify(__dirname.replace(/\\/g, "/"))}`);
  assert.deepEqual(options.properties, ["openDirectory"]);
  assert.equal(await run(`window.electronAPI.isDirectory(${JSON.stringify(__dirname)})`), true);
  assert.equal(await run('window.electronAPI.isDirectory("missing-folder")'), false);

  const menu = Menu.getApplicationMenu();
  menu.items[3].submenu.items[0].click();
  await until('document.getElementById("settingsDialog").open');
  await run('document.getElementById("settingsProjectRootBrowse").click()');
  await until(`document.getElementById('settingsProjectRootPath').value === ${JSON.stringify(__dirname)}`);
  await run(`document.getElementById('settingsTheme').value = 'dark';
    document.getElementById('settingsSaveButton').click();`);
  await until('!document.getElementById("settingsDialog").open');
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, "settings.json"))).theme, "dark");
  assert.equal(await run('document.documentElement.dataset.theme'), "dark");
  console.log("PASS folder selection, directory checks, settings dialog and persistence");

  // Saving cancellation must not write anything; arbitrary windows cannot use IPC.
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.deepEqual(await run('window.electronAPI.saveGeneratedFile("Dockerfile", "canceled")'), { canceled: true });
  assert.equal(fs.existsSync(path.join(__dirname, "Dockerfile")), false);
  const foreign = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false,
  } });
  await foreign.loadURL("data:text/html,<title>Untrusted IPC test</title>");
  assert.equal(await foreign.webContents.executeJavaScript('(async()=>{try{await window.electronAPI.getSettings();return false;}catch{return true;}})()'), true);
  foreign.destroy();
  console.log("PASS save cancellation and rejection of IPC from another window");

  for (const code of [
    'window.electronAPI.saveSettings({theme:"invalid"})',
    'window.electronAPI.saveSettings({unexpected:true})',
    'window.electronAPI.isDirectory(42)',
    'window.electronAPI.pickDirectory({bad:true})',
    'window.electronAPI.writeLog("x".repeat(16385))',
    'window.electronAPI.saveGeneratedFile("../bad.js", "test")',
    'window.electronAPI.saveGeneratedFile("Dockerfile", 42)',
  ]) assert.equal(await run(`(async()=>{try{await ${code};return false;}catch{return true;}})()`), true);
  await run('window.electronAPI.writeLog("test\\nforged-entry")');
  assert.match(fs.readFileSync(path.join(__dirname, "docker-builder.log"), "utf8"), /test forged-entry/);
  console.log("PASS invalid IPC payload rejection and log newline protection");

  await run('document.querySelector(\'[data-module-id="nodejs"]\').click()');
  await run('window.__rendererGenerate.generateConfigs()');
  const dockerfile = await run('document.getElementById("dockerfileOutput").value');
  assert.match(dockerfile, /FROM node:/);
  await run('document.querySelector(\'[data-tab="output"]\').click()');
  assert.equal(await download("dockerfileDownloadBtn", "Dockerfile"), dockerfile);
  menu.items[0].submenu.items[2].click();
  await until('document.getElementById("composeOutput").value === ""');
  menu.items[0].submenu.items[1].click();
  await until('document.getElementById("composeOutput").value.includes("services:")');
  menu.items[0].submenu.items[0].click();
  await until('document.querySelectorAll(".is-selected").length === 0');
  console.log("PASS Dockerfile generation/download and new/generate/clear menu actions");

  menu.items[5].submenu.items[0].click();
  await until('document.getElementById("aboutDialog").open');
  await run('document.getElementById("aboutCloseButton").click()');
  assert.equal(await run('document.getElementById("aboutDialog").open'), false);

  await run(`window.__rendererModulesUI.registerModule({id:'test-xss',label:'<img src=x onerror=alert(1)>', requires:['db']});
    window.__rendererModulesUI.renderModuleList();
    document.querySelector('[data-module-id="test-xss"]').click();
    window.__rendererGenerate.generateConfigs();`);
  assert.match(await run('document.getElementById("portMessage").textContent'), /<img/);
  assert.equal(await run('document.querySelector("#portMessage img") === null'), true);
  // Inline script and network requests must be rejected by CSP.
  await run(`const script = document.createElement('script');
    script.textContent = 'window.inlineExecuted = true'; document.head.appendChild(script);`);
  assert.equal(await run('window.inlineExecuted === undefined'), true);
  assert.equal(await run('(async()=>{try{await fetch("https://example.invalid");return false;}catch{return true;}})()'), true);
  const count = BrowserWindow.getAllWindows().length;
  await run('window.open("about:blank")');
  await delay(100);
  assert.equal(BrowserWindow.getAllWindows().length, count);
  await run('location.href = "https://example.invalid"');
  await delay(100);
  assert.match(wc.getURL(), /index\.html$/);
  console.log("PASS safe error rendering, CSP, popup and navigation restrictions");

  await wc.reload();
  await until('document.querySelectorAll(".module-row").length === 19');
  assert.equal(await run('document.documentElement.dataset.theme'), "dark");
  assert.equal(await run('window.electronAPI.getSettings().then(s=>s.paths.projectRoot)'), __dirname);
  const unexpected = errors.filter(message => !/Content Security Policy|violates|Refused to|Connecting to/i.test(message));
  assert.deepEqual(unexpected, []);
  console.log("PASS settings reload; no unexpected renderer/preload errors");
  app.exit(0);
})().catch(error => {
  console.error(error);
  console.error("Renderer errors:", errors);
  app.exit(1);
});

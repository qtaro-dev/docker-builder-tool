const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ run, until, wc, win, errors }) => {
  const settingsPath = await run('window.electronAPI.getSettingsPath()');
  const persisted = () => fs.readFileSync(settingsPath, 'utf8');
  const original = await run('window.electronAPI.getSettings()');
  const fixture = { ...original, defaultProjectName: 'preserved-project', paths: {
    projectRoot: __dirname, composeDir: __dirname, dockerfileDir: __dirname, logDir: __dirname,
  } };
  await run(`window.electronAPI.saveSettings(${JSON.stringify(fixture)})`);
  const reload = async () => {
    wc.reload();
    await until('document.querySelectorAll(".module-row").length === 19');
  };
  await reload();
  const open = async () => {
    await run('window.__rendererUI.openSettingsDialog(); document.querySelector(\'[data-section="appearance"]\').click()');
    await until('document.getElementById("settingsDialog").open');
  };
  const choose = id => run(`document.querySelector('.settings-theme-card[data-theme-id="${id}"]').click()`);
  const apply = async id => {
    await choose(id);
    await run('document.getElementById("settingsApplyThemeButton").click()');
    assert.equal(await run('window.__rendererCore.getTheme()'), id);
    // capturePageは直前の合成フレームを返すことがあるため、描画完了を待つ。
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  };
  const save = async () => {
    await run('document.getElementById("settingsSaveButton").click()');
    await until('!document.getElementById("settingsDialog").open');
  };
  const close = async expected => {
    await run('new Promise(resolve => { document.getElementById("settingsDialog").addEventListener("close", () => resolve(), { once: true }); document.getElementById("settingsCloseButton").click(); })');
    await until(`!document.getElementById('settingsDialog').open && window.__rendererCore.getTheme() === ${JSON.stringify(expected)}`);
  };
  const cancel = async (expected, keepOpen = false) => {
    const beforeCancel = persisted();
    await run('document.getElementById("settingsCancelButton").click()');
    assert.equal(await run('document.getElementById("settingsDialog").open'), true);
    assert.equal(await run('window.__rendererCore.getTheme()'), expected);
    assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), expected);
    assert.equal(persisted(), beforeCancel, 'Cancel must not write settings');
    if (!keepOpen) await close(expected);
  };
  await open();
  assert.deepEqual(await run('Array.from(document.querySelectorAll(".settings-theme-card"), e => e.dataset.themeId)'),
    ['system', 'light', 'dark', 'blue', 'green', 'yellow', 'orange', 'red', 'pink']);
  const before = persisted();
  await choose('pink');
  assert.equal(await run('window.__rendererCore.getTheme()'), 'dark');
  assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), 'pink');
  assert.equal(persisted(), before);

  const screenshotDir = process.env.DOCKER_BUILDER_SCREENSHOT_DIR;
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
  // Real Chromium rendering: inspect the light, dark, color and narrow layouts.
  for (const theme of ['light', 'dark', 'blue', 'green', 'yellow', 'orange', 'red', 'pink']) {
    await apply(theme);
    assert.equal(await run('document.getElementById("settingsDialog").open'), true);
    assert.equal(persisted(), before, 'Temporary application must not write settings');
    assert.equal(await run('getComputedStyle(document.querySelector(".settings-theme-preview")).backgroundColor === getComputedStyle(document.body).backgroundColor'), true);
    assert.equal(await run('document.getElementById("themeToggleButton").textContent.includes(window.__rendererCore.themes.find(t=>t[0]===window.__rendererCore.getTheme())[1])'), true);
    if (screenshotDir && ['light', 'dark', 'blue'].includes(theme)) {
      fs.writeFileSync(path.join(screenshotDir, `${theme}.png`), (await wc.capturePage()).toPNG());
    }
  }
  await cancel('dark', true);
  assert.equal(persisted(), before);
  console.log('PASS nine cards, selection only, repeated temporary application, preview/header sync, no disk writes and cancel without closing');

  await open();
  await apply('blue');
  await choose('pink');
  await save();
  assert.equal(JSON.parse(persisted()).theme, 'blue', 'Unapplied selection must not be saved');
  assert.deepEqual(JSON.parse(persisted()).paths, fixture.paths);
  assert.equal(JSON.parse(persisted()).defaultProjectName, fixture.defaultProjectName);
  await reload();
  assert.equal(await run('window.__rendererCore.getTheme()'), 'blue');
  await run('document.getElementById("themeToggleButton").click()');
  await until('!document.getElementById("themeToggleButton").disabled');
  assert.equal(JSON.parse(persisted()).theme, 'green');
  await open();
  assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), 'green');
  await apply('orange');
  await run('document.getElementById("settingsProjectRootPath").value="not-a-valid-directory"');
  await cancel('green', true);
  assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), 'not-a-valid-directory', 'Theme cancel must preserve project input');
  await close('green');
  await open();
  assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), __dirname);
  await apply('pink');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
  await until('!document.getElementById("settingsDialog").open && window.__rendererCore.getTheme() === "green"');
  await open();
  await apply('red');
  await close('green');
  assert.equal(JSON.parse(persisted()).theme, 'green', 'Close button must discard unsaved theme');
  await open();
  await apply('pink');
  await run('document.getElementById("settingsDialog").close()');
  await until('window.__rendererCore.getTheme() === "green"');
  assert.equal(JSON.parse(persisted()).theme, 'green');
  console.log('PASS applied-only save, project input preserved by cancel, reload persistence, header toggle sync, Close button, Escape and standard close rollback');

  await open();
  await apply('dark');
  const beforeFailure = persisted();
  const layout = () => run(`(() => {
    const dialog = document.getElementById('settingsDialog');
    const section = document.getElementById('settings-appearance');
    return { height: dialog.getBoundingClientRect().height, bodyHeight: section.clientHeight,
      footerTop: document.querySelector('.settings-footer').getBoundingClientRect().top,
      overflow: section.scrollHeight > section.clientHeight };
  })()`);
  const beforeErrorLayout = await layout();
  assert.ok(beforeErrorLayout.height > 520, 'Settings dialog reserves extra vertical space');
  assert.equal(beforeErrorLayout.overflow, false);
  await run('["ProjectRoot", "ComposeDir", "DockerfileDir", "LogDir"].forEach(name => { document.getElementById(`settings${name}Path`).value="not-a-valid-directory"; }); document.getElementById("settingsSaveButton").click()');
  await until('!document.getElementById("settingsSaveError").hidden && !document.getElementById("settingsSaveButton").disabled');
  assert.match(await run('document.getElementById("settingsSaveError").textContent'), /プロジェクト内のパス指定を見直してください。\n対象：プロジェクトフォルダ/);
  assert.match(await run('document.getElementById("settingsSaveError").textContent'), /docker-compose.yml 保存場所、Dockerfile 保存場所、ログ保存場所/);
  assert.deepEqual(await layout(), beforeErrorLayout, 'Validation message must not move the footer or add scrolling');
  assert.equal(persisted(), beforeFailure);
  if (screenshotDir) {
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(screenshotDir, 'validation-error.png'), (await wc.capturePage()).toPNG());
  }
  await run(`["ProjectRoot", "ComposeDir", "DockerfileDir", "LogDir"].forEach(name => { document.getElementById(\`settings\${name}Path\`).value=${JSON.stringify(__dirname)}; })`);
  const write = fs.writeFileSync;
  const errorStart = errors.length;
  fs.writeFileSync = (filename, ...args) => {
    if (filename === settingsPath) throw new Error('simulated settings write failure');
    return write(filename, ...args);
  };
  try {
    await run('document.getElementById("settingsSaveButton").click()');
    await until('!document.getElementById("settingsSaveError").hidden && !document.getElementById("settingsSaveButton").disabled');
    assert.equal(await run('document.getElementById("settingsDialog").open'), true);
    assert.equal(persisted(), beforeFailure);
    assert.deepEqual(await layout(), beforeErrorLayout, 'Save failure message must use the reserved space');
  } finally { fs.writeFileSync = write; }
  const expectedErrors = errors.splice(errorStart);
  assert.ok(expectedErrors.every(message => message.includes('設定保存に失敗:')), JSON.stringify(expectedErrors));
  await cancel('green');
  assert.equal(JSON.parse(persisted()).theme, 'green');
  console.log('PASS validation/save errors use reserved space without extra scrolling or footer movement, keep dialog open and leave disk unchanged');

  wc.debugger.attach('1.3');
  try {
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await open();
    await apply('system');
    await until('document.documentElement.dataset.theme === "light"');
    const beforeAuto = persisted();
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await until('document.documentElement.dataset.theme === "dark"');
    assert.equal(persisted(), beforeAuto);
    await save();
    assert.equal(JSON.parse(persisted()).theme, 'system');
    await reload();
    assert.equal(await run('window.__rendererCore.getTheme()'), 'system');
    assert.equal(await run('document.documentElement.dataset.theme'), 'dark');
    await open();
    await apply('pink');
    await cancel('system');
    assert.equal(await run('document.documentElement.dataset.theme'), 'dark');
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await until('document.documentElement.dataset.theme === "light"');
  } finally { wc.debugger.detach(); }
  console.log('PASS system theme follows OS changes, persists logical system setting and survives cancel/reload');

  await open();
  await apply('blue');
  win.setSize(540, 620);
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await run('document.getElementById("settingsThemeCards").scrollWidth <= document.getElementById("settingsThemeCards").clientWidth'), true);
  assert.equal(await run('document.querySelector(".settings-content").scrollWidth <= document.querySelector(".settings-content").clientWidth'), true);
  assert.equal(await run('document.getElementById("settingsSaveButton").getBoundingClientRect().bottom <= innerHeight'), true);
  if (screenshotDir) fs.writeFileSync(path.join(screenshotDir, 'narrow.png'), (await wc.capturePage()).toPNG());
  await cancel('system');
  win.setSize(1280, 800);
  // A project edit still uses the existing save path while the current theme is retained.
  await open();
  await run('document.getElementById("settingsComposeDirPath").value=""');
  await save();
  assert.equal(JSON.parse(persisted()).paths.composeDir, undefined);
  assert.equal(JSON.parse(persisted()).paths.projectRoot, __dirname);
  assert.equal(JSON.parse(persisted()).theme, 'system');

  await open();
  await run('document.querySelector(\'[data-section="project"]\').click()');
  const beforeInitialize = persisted();
  const oldRootInput = await run('document.getElementById("settingsProjectRootPath").value');
  const initialize = async () => {
    await run('document.getElementById("settingsInitializePathsButton").click()');
    await until('!document.getElementById("settingsInitializePathsButton").disabled');
  };
  // 同名ファイルがあっても消さず、失敗を説明して設定と入力値を維持する。
  const logDirectory = path.join(__dirname, 'logs');
  fs.writeFileSync(logDirectory, 'keep-existing-data');
  try {
    await initialize();
    assert.match(await run('document.getElementById("settingsSaveError").textContent'), /既定フォルダを作成できませんでした/);
    assert.equal(fs.readFileSync(logDirectory, 'utf8'), 'keep-existing-data');
    assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), oldRootInput);
    assert.equal(persisted(), beforeInitialize);
  } finally { fs.unlinkSync(logDirectory); }
  await initialize();
  const expectedPaths = {
    projectRoot: path.join(__dirname, 'Project'),
    composeDir: path.join(__dirname, 'Project', 'docker-compose'),
    dockerfileDir: path.join(__dirname, 'Project', 'Dockerfiles'),
    logDir: logDirectory,
  };
  const names = { projectRoot: 'ProjectRoot', composeDir: 'ComposeDir', dockerfileDir: 'DockerfileDir', logDir: 'LogDir' };
  for (const [key, directory] of Object.entries(expectedPaths)) {
    assert.equal(fs.statSync(directory).isDirectory(), true);
    assert.equal(await run(`document.getElementById('settings${names[key]}Path').value`), directory);
  }
  assert.equal(persisted(), beforeInitialize, 'Initialization must not save settings');
  assert.equal(await run('window.__rendererCore.getTheme()'), 'system');
  if (screenshotDir) {
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(screenshotDir, 'project-initialized.png'), (await wc.capturePage()).toPNG());
  }
  const existingFile = path.join(expectedPaths.composeDir, 'keep.txt');
  fs.writeFileSync(existingFile, 'unchanged');
  await initialize();
  assert.equal(fs.readFileSync(existingFile, 'utf8'), 'unchanged');
  assert.equal(persisted(), beforeInitialize);
  await close('system');
  await open();
  assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), oldRootInput);
  await initialize();
  await save();
  assert.deepEqual(JSON.parse(persisted()).paths, expectedPaths);
  await reload();
  assert.deepEqual(await run('window.electronAPI.getSettings().then(s=>s.paths)'), expectedPaths);
  // 既存リンクを辿って別の場所へ作成することも拒否する。
  fs.rmdirSync(logDirectory);
  fs.symlinkSync(__dirname, logDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    assert.equal(await run('(async()=>{try{await window.electronAPI.initializeProjectPaths();return false;}catch{return true;}})()'), true);
  } finally { fs.unlinkSync(logDirectory); fs.mkdirSync(logDirectory); }
  console.log('PASS fixed default folder names under app root, initialization failure, no overwrite, no implicit save, close rollback, persistence and link rejection');

  await run(`window.electronAPI.saveSettings({paths:{...${JSON.stringify(expectedPaths)},projectRoot:'missing-saved-project'}})`);
  await reload();
  await open();
  await until('document.getElementById("settingsSaveError").textContent.includes("プロジェクト内のパス指定")');
  assert.match(await run('document.getElementById("settingsSaveError").textContent'), /対象：プロジェクトフォルダ/);
  await run(`document.getElementById('settingsProjectRootPath').value=${JSON.stringify(expectedPaths.projectRoot)}; document.getElementById('settingsProjectRootPath').dispatchEvent(new Event('input'));`);
  await until('document.getElementById("settingsSaveError").hidden');
  await close('system');
  console.log('PASS invalid saved paths are explained in the appearance footer and correction clears the reason');
  await run(`window.electronAPI.saveSettings(${JSON.stringify(original)})`);
  await reload();
  console.log('PASS narrow dialog layout, reachable footer, project save/cancel behavior; original test settings restored');
};

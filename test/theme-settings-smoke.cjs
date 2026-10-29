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
    await until('!document.getElementById("settingsCloseButton").disabled');
    assert.equal(await run('window.__rendererCore.getTheme()'), id);
    assert.equal(JSON.parse(persisted()).theme, id);
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  };
  const save = async () => {
    await run('document.getElementById("settingsSaveButton").click()');
    await until('!document.getElementById("settingsSaveButton").disabled');
    assert.equal(await run('document.getElementById("settingsDialog").open'), true);
    assert.match(await run('document.getElementById("settingsSaveError").textContent'), /フォルダ設定を保存しました/);
  };
  const close = async expected => {
    await run('new Promise(resolve => { document.getElementById("settingsDialog").addEventListener("close", () => resolve(), { once: true }); document.getElementById("settingsCloseButton").click(); })');
    assert.equal(await run('window.__rendererCore.getTheme()'), expected);
  };
  await open();
  const themes = ['system', 'light', 'dark', 'blue', 'green', 'yellow', 'orange', 'red', 'pink'];
  assert.deepEqual(await run('Array.from(document.querySelectorAll(".settings-theme-card"), e => e.dataset.themeId)'), themes);
  assert.equal(await run('document.querySelector(\'[data-section="project"]\').textContent.trim()'), 'フォルダ設定');
  assert.equal(await run('document.getElementById("settingsApplyThemeButton").textContent'), '適用');
  assert.equal(await run('document.querySelector("#settingsCancelButton, .settings-theme-preview")'), null);
  assert.deepEqual(await run('Array.from(document.querySelectorAll(".settings-footer button"), e=>e.textContent)'), ['保存', '閉じる']);
  const before = persisted();
  await choose('pink');
  assert.equal(await run('window.__rendererCore.getTheme()'), 'dark');
  assert.equal(persisted(), before);
  await close('dark');
  await open();
  assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), 'dark');

  const screenshotDir = process.env.DOCKER_BUILDER_SCREENSHOT_DIR;
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
  // Real Electron rendering and disk persistence for every theme; dirty folders stay uncommitted.
  await run('document.getElementById("settingsProjectRootPath").value="missing-folder"');
  for (const theme of themes) {
    await apply(theme);
    assert.deepEqual(JSON.parse(persisted()).paths, fixture.paths);
    assert.equal(JSON.parse(persisted()).defaultProjectName, fixture.defaultProjectName);
    assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), 'missing-folder');
    assert.equal(await run('document.getElementById("settingsDialog").open'), true);
    assert.equal(await run('document.getElementById("themeToggleButton").textContent.includes(window.__rendererCore.themes.find(t=>t[0]===window.__rendererCore.getTheme())[1])'), true);
    if (screenshotDir && ['light', 'dark', 'blue'].includes(theme)) fs.writeFileSync(path.join(screenshotDir, `${theme}.png`), (await wc.capturePage()).toPNG());
    await close(theme);
    await reload();
    assert.equal(await run('window.__rendererCore.getTheme()'), theme);
    await open();
    assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), theme);
    assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), __dirname);
    await run('document.getElementById("settingsProjectRootPath").value="missing-folder"');
  }
  console.log('PASS nine theme selection/apply/persistence/reload cycles; folder validation and dirty input independent; preview/Cancel removed');

  await apply('dark');
  const beforeFailure = persisted();
  await run('["ProjectRoot", "ComposeDir", "DockerfileDir", "LogDir"].forEach(name => { document.getElementById(`settings${name}Path`).value="not-a-valid-directory"; }); document.getElementById("settingsSaveButton").click()');
  await until('!document.getElementById("settingsSaveError").hidden && !document.getElementById("settingsSaveButton").disabled');
  assert.equal(await run('document.getElementById("settings-project").classList.contains("active")'), true);
  assert.equal(await run('document.activeElement.id'), 'settingsProjectRootPath');
  assert.equal(await run('document.querySelectorAll(\'#settings-project input[aria-invalid="true"]\').length'), 4);
  assert.equal(await run('getComputedStyle(document.getElementById("settingsProjectRootHint")).color'), 'rgb(255, 138, 128)', 'Dark-theme errors must remain legible');
  assert.match(await run('document.getElementById("settingsSaveError").textContent'), /対象：プロジェクトフォルダ、docker-compose.yml 保存場所、Dockerfile 保存場所、ログ保存場所。存在するフォルダ/);
  assert.equal(persisted(), beforeFailure);
  assert.equal(await run('window.__rendererCore.getTheme()'), 'dark');
  if (screenshotDir) {
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(screenshotDir, 'validation-error.png'), (await wc.capturePage()).toPNG());
  }
  // A folder error cannot prevent the independently committed theme.
  await run('document.querySelector(\'[data-section="appearance"]\').click()');
  await apply('blue');
  await choose('pink');
  await run(`["ProjectRoot", "ComposeDir", "DockerfileDir", "LogDir"].forEach(name => { document.getElementById(\`settings\${name}Path\`).value=${JSON.stringify(__dirname)}; })`);
  await save();
  assert.equal(JSON.parse(persisted()).theme, 'blue', 'Folder Save must ignore unapplied theme selection');
  assert.equal(await run('document.querySelectorAll(\'#settings-project input[aria-invalid="true"]\').length'), 0);
  await close('blue');
  console.log('PASS invalid folder Save auto-navigation, field errors/focus, no write; correction/retry; folder Save stays open and preserves applied theme');

  await open();
  const beforeWriteFailure = persisted();
  const write = fs.writeFileSync;
  const errorStart = errors.length;
  fs.writeFileSync = (filename, ...args) => {
    if (filename === settingsPath) throw new Error('simulated settings write failure');
    return write(filename, ...args);
  };
  try {
    await run('document.getElementById("settingsComposeDirPath").value=""; document.getElementById("settingsSaveButton").click()');
    await until('!document.getElementById("settingsSaveButton").disabled');
    assert.match(await run('document.getElementById("settingsSaveError").textContent'), /保存できません/);
    assert.equal(await run('document.getElementById("settingsComposeDirPath").value'), '');
    assert.equal(await run('document.getElementById("settingsDialog").open'), true);
    assert.equal(persisted(), beforeWriteFailure);
    await run('document.querySelector(\'[data-section="appearance"]\').click()');
    await choose('red');
    await run('document.getElementById("settingsApplyThemeButton").click()');
    await until('!document.getElementById("settingsCloseButton").disabled');
    assert.match(await run('document.getElementById("settingsThemeError").textContent'), /テーマを保存できません/);
    assert.equal(await run('window.__rendererCore.getTheme()'), 'blue');
    assert.equal(persisted(), beforeWriteFailure);
  } finally { fs.writeFileSync = write; }
  const expectedErrors = errors.splice(errorStart);
  assert.ok(expectedErrors.every(message => message.includes('設定保存に失敗:')), JSON.stringify(expectedErrors));
  await apply('red');
  await save();
  assert.equal(JSON.parse(persisted()).paths.composeDir, undefined, 'Empty optional directory is valid');
  assert.equal(JSON.parse(persisted()).theme, 'red');
  await choose('pink');
  await run('document.getElementById("settingsProjectRootPath").value="discard-me"');
  await close('red');
  await open();
  assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), __dirname);
  assert.equal(await run('document.getElementById("settingsComposeDirPath").value'), '');
  await choose('pink');
  await run('document.getElementById("settingsProjectRootPath").value="discard-on-escape"');
  win.focus(); wc.focus();
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
  await until('!document.getElementById("settingsDialog").open');
  await open();
  assert.equal(await run('window.__rendererCore.getTheme()'), 'red');
  assert.equal(await run('document.getElementById("settingsProjectRootPath").value'), __dirname);
  await apply('dark');
  await choose('pink');
  await run('document.getElementById("settingsDialog").close()');
  await until('!document.getElementById("settingsDialog").open');
  assert.equal(await run('window.__rendererCore.getTheme()'), 'dark');
  await reload();
  assert.equal(await run('window.__rendererCore.getTheme()'), 'dark');
  await run('document.getElementById("themeToggleButton").click()');
  await until('!document.getElementById("themeToggleButton").disabled');
  assert.equal(JSON.parse(persisted()).theme, 'blue');
  await open();
  assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), 'blue');
  await close('blue');
  console.log('PASS folder/theme write failures preserve inputs and committed state; retry; optional blank; Close/Escape/native close discard drafts; header sync');

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
    await close('system');
    await reload();
    assert.equal(await run('window.__rendererCore.getTheme()'), 'system');
    assert.equal(await run('document.documentElement.dataset.theme'), 'dark');
  } finally { wc.debugger.detach(); }
  console.log('PASS system theme follows OS while persisting logical system setting');

  await open();
  win.setContentSize(540, 620);
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await run('document.getElementById("settingsThemeCards").scrollWidth <= document.getElementById("settingsThemeCards").clientWidth'), true);
  assert.equal(await run('document.querySelector(".settings-content").scrollWidth <= document.querySelector(".settings-content").clientWidth'), true);
  assert.equal(await run('document.getElementById("settingsSaveButton").getBoundingClientRect().bottom <= innerHeight'), true);
  if (screenshotDir) fs.writeFileSync(path.join(screenshotDir, 'narrow.png'), (await wc.capturePage()).toPNG());
  await close('system');
  win.setContentSize(1280, 900);
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
  await close('system');
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
  await until('document.getElementById("settingsSaveError").textContent.includes("フォルダ設定のパス指定")');
  assert.match(await run('document.getElementById("settingsSaveError").textContent'), /対象：プロジェクトフォルダ/);
  await run(`document.getElementById('settingsProjectRootPath').value=${JSON.stringify(expectedPaths.projectRoot)}; document.getElementById('settingsProjectRootPath').dispatchEvent(new Event('input'));`);
  await until('document.getElementById("settingsSaveError").hidden');
  await close('system');
  console.log('PASS previously saved invalid paths are explained; correction clears field and footer errors');

  await run(`window.electronAPI.saveSettings(${JSON.stringify(original)})`);
  await reload();
  console.log('PASS narrow dialog layout and default-folder initialization safety; original test settings restored');
};

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

app.setPath('userData', path.join(__dirname, 'profile'));
app.setPath('sessionData', path.join(__dirname, 'session'));
const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
require('./main');
(async () => {
  await app.whenReady();
  const contents = BrowserWindow.getAllWindows()[0].webContents;
  const run = code => contents.executeJavaScript(code);
  for (let i = 0; i < 100; i++) {
    if (await run('document.querySelectorAll(".module-row").length === 19')) break;
    await delay(50);
  }
  assert.equal(await run('document.querySelectorAll(".module-row").length'), 19);
  assert.equal(await run('window.__rendererCore.getTheme()'), saved.theme);
  assert.equal(await run('document.documentElement.dataset.theme === window.__rendererCore.getEffectiveTheme()'), true);
  assert.equal(await run('document.getElementById("projectNameInput").value'), saved.defaultProjectName);
  assert.deepEqual(await run('window.electronAPI.getSettings().then(s=>s.paths)'), saved.paths);
  await run('window.__rendererUI.openSettingsDialog()');
  assert.equal(await run('document.querySelector(\'.settings-theme-card[aria-checked="true"]\').dataset.themeId'), saved.theme);
  console.log('PASS full Electron process restart: saved theme, project settings and selected card restored from disk');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });

// Exercise an actual installed application through a loopback-only, temporary
// Chromium debugging session. No test hooks or debugging switches are shipped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const executable = path.resolve(process.argv[2] || '');
assert.ok(process.argv[2] && fs.existsSync(executable), 'Pass the installed executable path');
const version = require('../package.json').version;
const profile = path.resolve('release/installed-test-profile');
let child, socket;
async function open() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(executable, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  let origin;
  for (let i = 0; i < 200; i++) {
    const match = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
    if (match) { origin = `http://127.0.0.1:${match[1]}`; break; }
    if (child.exitCode !== null) throw new Error(`Installed app exited ${child.exitCode}: ${stderr}`);
    await delay(50);
  }
  assert.ok(origin, 'Installed app did not start a loopback debugging session');
  let page;
  for (let i = 0; i < 100; i++) {
    const targets = await (await fetch(`${origin}/json/list`)).json();
    page = targets.find(target => target.type === 'page' && target.url.endsWith('/app/index.html'));
    if (page) break;
    await delay(50);
  }
  assert.ok(page, 'Packaged application page not found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  return async expression => {
    const id = ++sequence;
    const reply = new Promise(resolve => pending.set(id, resolve));
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }));
    const message = await Promise.race([reply, delay(10000).then(() => { throw new Error(`Evaluation timed out: ${expression}`); })]);
    if (message.error || message.result?.exceptionDetails) throw new Error(JSON.stringify(message.error || message.result.exceptionDetails));
    return message.result.result.value;
  };
}
async function close(run) {
  await run('window.close()').catch(() => {});
  socket.close();
  for (let i = 0; i < 100 && child.exitCode === null; i++) await delay(50);
  assert.equal(child.exitCode, 0, 'Installed app must close normally');
}
(async () => {
  let run = await open();
  for (let i = 0; i < 100 && !await run('document.querySelectorAll(".module-row").length === 19'); i++) await delay(50);
  assert.equal(await run('document.querySelectorAll(".module-row").length'), 19);
  assert.equal(await run('window.electronAPI.getVersion()'), version);
  assert.match(await run('navigator.userAgent'), /Electron\/45\.0\.0/);
  assert.deepEqual(await run('[typeof require, typeof process, typeof window.electronAPI.invoke]'), ['undefined', 'undefined', 'undefined']);
  const settings = await run('window.electronAPI.getSettings()');
  await run(`window.electronAPI.saveSettings({theme:'dark', defaultProjectName:'installed-test'})`);
  await run(`document.getElementById('projectNameInput').value='installed-test';
    document.querySelector('[data-module-id="nginx"]').click();
    document.querySelector('[data-module-id="nodejs"]').click();
    document.querySelector('section[data-module-id="nginx"] input[data-field-name="hostPort"]').value='8099';
    window.__rendererGenerate.generateConfigs();`);
  assert.match(await run('document.getElementById("composeOutput").value'), /8099:80/);
  assert.match(await run('document.getElementById("dockerfileOutput").value'), /FROM node:/);
  assert.equal(await run(`window.electronAPI.isDirectory(${JSON.stringify(path.dirname(executable))})`), true);
  assert.equal(await run(`(async()=>{try{await window.electronAPI.saveSettings({theme:'bad'});return false;}catch{return true;}})()`), true);
  await run(`const script=document.createElement('script');script.textContent='window.cspBypassed=true';document.head.appendChild(script);`);
  assert.equal(await run('window.cspBypassed === undefined'), true);
  await close(run);
  run = await open();
  for (let i = 0; i < 100 && !await run('document.querySelectorAll(".module-row").length === 19'); i++) await delay(50);
  assert.equal(await run('document.documentElement.dataset.theme'), 'dark');
  assert.equal(await run('document.getElementById("projectNameInput").value'), 'installed-test');
  await run(`window.electronAPI.saveSettings(${JSON.stringify(settings)})`);
  await close(run);
  console.log(`PASS installed ${version}: normal startup/close twice, Electron 45, ASAR preload/IPC, 19 modules, inputs, Compose/Dockerfile, settings persistence, directory check, isolation and CSP`);
})().catch(error => {
  console.error(error);
  socket?.close();
  child?.kill();
  process.exitCode = 1;
});

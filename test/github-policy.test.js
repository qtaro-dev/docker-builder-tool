const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const https = require('node:https');
const { validateSettings } = require('../security');
const { requestJSON, endpoint } = require('../image-catalog');
const { slots } = require('../app/src/image-versions');

test('application network boundary rejects GitHub auth/API/upload endpoints before transport', async () => {
  const original = https.get;
  let requests = 0;
  https.get = () => { requests++; throw new Error('Transport must not be reached'); };
  try {
    for (const url of [
      'https://github.com/login/oauth/authorize',
      'https://api.github.com/repos/qtaro-dev/docker-builder-tool/actions/workflows/docker-validation.yml/dispatches',
      'https://api.github.com/repos/qtaro-dev/docker-builder-tool/contents/docker-compose.yml',
      'https://uploads.github.com/repos/qtaro-dev/docker-builder-tool/releases/1/assets',
      'https://raw.githubusercontent.com/qtaro-dev/docker-builder-tool/main/package.json',
      'https://github.com/v2/namespaces/library/repositories/node/tags',
    ]) await assert.rejects(requestJSON(url), /許可されていない配信元/);
    assert.equal(requests, 0);
    // 情報源の表示URLとは独立し、全更新先はDocker Hubに固定されている。
    for (const slot of slots) {
      const url = new URL(endpoint(slot));
      assert.equal(url.origin, 'https://hub.docker.com');
      assert.ok(url.pathname.startsWith('/v2/namespaces/'));
    }
  } finally { https.get = original; }
});

test('settings schema cannot accept GitHub credentials or workflow configuration', () => {
  for (const value of [
    { githubToken: 'policy-test-placeholder' },
    { github: { token: 'policy-test-placeholder' } },
    { oauth: { clientId: 'policy-test-placeholder' } },
    { actions: { workflow: 'docker-validation.yml' } },
    { paths: { githubToken: 'policy-test-placeholder' } },
  ]) assert.throws(() => validateSettings(value), /Invalid settings/);
  assert.deepEqual(validateSettings({ theme: 'dark', paths: { composeDir: 'project' } }), { theme: 'dark', paths: { composeDir: 'project' } });
});

test('preload exposes local operations, fixed About page and Docker Hub update without caller URL/auth', async () => {
  let api;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../preload'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve(); } },
    }),
  });
  assert.deepEqual(Object.keys(api).sort(), [
    'getVersion', 'getAboutInfo', 'openProjectPage', 'getImageCatalog', 'updateImageCatalog', 'getSettings', 'saveSettings', 'getSettingsPath',
    'isDirectory', 'initializeProjectPaths', 'pickDirectory', 'writeLog', 'saveGeneratedFile', 'saveGeneratedBundle', 'onMenuCommand',
  ].sort());
  await api.updateImageCatalog('https://api.github.com', { token: 'policy-test-placeholder' });
  await api.openProjectPage('https://evil.invalid', { token: 'policy-test-placeholder' });
  assert.deepEqual(calls, [['images:update'], ['about:openProjectPage']]);
});

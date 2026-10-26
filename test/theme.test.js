const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function loadCore() {
  const attributes = { 'data-theme': 'light' };
  const button = { textContent: '' };
  const query = { matches: false, addEventListener: (_name, listener) => { query.change = listener; } };
  const calls = [];
  const events = [];
  const window = { matchMedia: () => query, dispatchEvent: event => events.push(event), electronAPI: { saveSettings: value => calls.push(value) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/src/renderer/core.js'), 'utf8'), {
    window, document: { documentElement: { getAttribute: key => attributes[key], setAttribute: (key, value) => { attributes[key] = value; } }, getElementById: () => button },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return { core: window.__rendererCore, attributes, button, query, calls, events };
}

test('theme application preserves identifiers, updates display and never persists implicitly', () => {
  const { core, attributes, button, calls } = loadCore();
  assert.equal(core.themes.length, 9);
  core.applyTheme('pink');
  assert.equal(core.getTheme(), 'pink');
  assert.equal(attributes['data-theme'], 'pink');
  assert.match(button.textContent, /ピンク/);
  core.applyTheme('unknown');
  assert.equal(core.getTheme(), 'pink');
  core.applyTheme('warm');
  assert.equal(core.getTheme(), 'warm');
  assert.deepEqual(calls, []);
});

test('system theme follows media changes while retaining its logical setting', () => {
  const { core, query, attributes, calls, events } = loadCore();
  core.applyTheme('system');
  assert.equal(attributes['data-theme'], 'light');
  query.matches = true;
  query.change();
  assert.equal(core.getTheme(), 'system');
  assert.equal(attributes['data-theme'], 'dark');
  assert.equal(events.at(-1).detail.effectiveTheme, 'dark');
  core.applyTheme('blue');
  query.matches = false;
  query.change();
  assert.equal(attributes['data-theme'], 'blue');
  assert.deepEqual(calls, []);
});

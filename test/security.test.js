const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { entryURL, text, validateSettings, assertTrustedSender } = require("../security");

test("IPC accepts only the application main frame", () => {
  const frame = { url: entryURL };
  const sender = { mainFrame: frame };
  const window = { webContents: sender, isDestroyed: () => false };
  assert.doesNotThrow(() => assertTrustedSender({ sender, senderFrame: frame }, window));
  for (const event of [
    { sender, senderFrame: { url: entryURL } },
    { sender: {}, senderFrame: frame },
    { sender },
  ]) assert.throws(() => assertTrustedSender(event, window), /Untrusted/);
  frame.url = "https://example.invalid/";
  assert.throws(() => assertTrustedSender({ sender, senderFrame: frame }, window));
});

test("settings and text reject unexpected types, keys and oversized payloads", () => {
  assert.deepEqual(validateSettings({ theme: "orange", paths: { composeDir: "C:\\project" } }),
    { theme: "orange", paths: { composeDir: "C:\\project" } });
  for (const value of [null, [], "bad", { theme: "bogus" }, { theme: {} },
    { defaultProjectName: 1 }, { paths: [] }, { paths: { arbitrary: "x" } },
    JSON.parse('{"__proto__":{"polluted":true}}'), { defaultProjectName: "x".repeat(257) }]) {
    assert.throws(() => validateSettings(value));
  }
  assert.throws(() => text("a\0b"));
  assert.throws(() => text("x".repeat(4097)));
  assert.equal({}.polluted, undefined);
});

test("preload exposes only named operations and strips Electron event objects", async () => {
  let api, listener, removed;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve("../preload"), "utf8"), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: {
        invoke: (...args) => { calls.push(args); return Promise.resolve(); },
        on: (_channel, fn) => { listener = fn; },
        removeListener: (_channel, fn) => { removed = fn; },
      },
    }),
  });
  assert.equal(api.invoke, undefined);
  assert.equal(api.send, undefined);
  await api.getSettings();
  await api.saveSettings({ theme: "dark" });
  // 初期化APIは呼び出し元からパスを受け取らず、固定操作だけを公開する。
  await api.initializeProjectPaths("C:\\outside");
  await api.getImageCatalog();
  await api.updateImageCatalog("https://evil.invalid");
  assert.deepEqual(calls, [["settings:get"], ["settings:save", { theme: "dark" }], ["settings:initializeProjectPaths"], ["images:get"], ["images:update"]]);
  let args;
  const unsubscribe = api.onMenuCommand((...values) => { args = values; });
  listener({ sender: "privileged" }, "file-new");
  assert.deepEqual(args, ["file-new"]);
  unsubscribe();
  assert.equal(removed, listener);
});

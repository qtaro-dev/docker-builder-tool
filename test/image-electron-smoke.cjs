// 既存生成試験の前提として、入力後に実UIの「設定確認」を明示操作する。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { dialog } = require("electron");
const bundled = require("./app/data/image-catalog.json");
const versions = require("./app/src/image-versions");

module.exports = async ({ run, until, wc, win }) => {
  await run("window.__rendererUI.resetConfiguration(); document.querySelector('[data-tab=config]').click()");
  await run(`document.querySelector('.module-row[data-module-id="nginx"]').click();
    document.querySelector('[data-module-id="nginx"] input[data-field-name="hostPort"]').value = '9137';
    document.querySelector('.module-row[data-module-id="nodejs"]').click();
    document.querySelector('.module-row[data-module-id="python-web"]').click();`);
  assert.equal(await run('document.querySelector("[data-module-id=nginx] input[data-field-name=hostPort]").value'), "9137");
  await run(`const framework = document.querySelector('.framework-toggle-checkbox'); framework.checked = true; framework.dispatchEvent(new Event('change'));
    document.querySelector('.module-row[data-module-id="mysql"]').click();`);
  assert.equal(await run('document.querySelector(".framework-toggle-checkbox").checked'), true);
  assert.equal(await run('document.querySelectorAll(".image-version-panel").length'), 4);
  await run(`const series = document.querySelector('[data-module-id=nodejs] .image-series');
    series.value = '22'; series.dispatchEvent(new Event('change'));
    const form = document.querySelector('[data-module-id=nodejs] .image-variant');
    form.value = [...form.options].find(o => o.textContent.startsWith('alpine ')).value; form.dispatchEvent(new Event('change'));
    window.__testConfirmModules(); window.__rendererGenerate.generateConfigs();`);
  assert.match(await run('document.getElementById("dockerfileOutput").value'), /FROM node:22\..*-alpine/);
  assert.match(await run('document.getElementById("composeOutput").value'), /working_dir: "\/app"/);
  assert.match(await run('document.getElementById("composeOutput").value'), /dockerfile: "Dockerfile.python-web"/);
  assert.match(await run('document.getElementById("composeOutput").value'), /flask run --host=0.0.0.0 --port=5000/);
  assert.equal(await run('document.getElementById("generatedFileSelect").options.length'), 9);
  await run(String.raw`document.getElementById('dockerfileOutput').value += '\n# retained edit';
    const files = document.getElementById('generatedFileSelect'); files.value = '2'; files.dispatchEvent(new Event('change'));`);
  assert.match(await run('document.getElementById("dockerfileOutput").value'), /FROM python:/);
  assert.doesNotMatch(await run('document.getElementById("dockerfileOutput").value'), /FROM node:/);
  await run(`document.getElementById('generatedFileSelect').value = '0'; document.getElementById('generatedFileSelect').dispatchEvent(new Event('change'));`);
  assert.match(await run('document.getElementById("dockerfileOutput").value'), /# retained edit/);

  const savedDialog = dialog.showSaveDialog;
  try {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(__dirname, "docker-compose.yml") });
    await run("document.getElementById('composeDownloadBtn').click()");
    await until("document.getElementById('generatedSaveStatus').textContent.includes('保存先')");
    dialog.showSaveDialog = async (_parent, options) => {
      assert.equal(options.defaultPath, path.join(__dirname, "nodejs", "Dockerfile.nodejs"));
      return { canceled: false, filePath: path.join(__dirname, "wrong-Dockerfile.nodejs") };
    };
    await run("document.getElementById('dockerfileDownloadBtn').click()");
    await until("document.getElementById('generatedSaveStatus').textContent.includes('Composeが参照する場所')");
    assert.match(fs.readFileSync(path.join(__dirname, "wrong-Dockerfile.nodejs"), "utf8"), /# retained edit/);
    assert.match(await run('document.getElementById("generatedPlacementGuide").textContent'), /Dockerfile.nodejs/);
  } finally { dialog.showSaveDialog = savedDialog; }
  console.log("PASS version series/variant, retained module inputs/framework, separate files/edit/save, context and placement mismatch warning");

  await run(`window.__savedConfirm = window.confirm;
    window.__savedVersion = window.ImageUI.selected('nodejs');
    const oldSeries = document.querySelector('[data-module-id=nodejs] .image-series');
    oldSeries.value = '20'; oldSeries.dispatchEvent(new Event('change'));
    window.confirm = () => false; window.__testConfirmModules(); window.__rendererGenerate.generateConfigs();`);
  assert.equal(await run('document.getElementById("composeOutput").value'), "");
  assert.match(await run('document.getElementById("portMessage").textContent'), /通常生成を制限/);
  assert.match(await run('document.querySelector("[data-module-id=nodejs] .image-status").textContent'), /EOL/);
  assert.equal(await run('document.querySelector("[data-module-id=nodejs] .image-details").open'), false);
  await run("window.confirm = () => true; window.__testConfirmModules(); window.__rendererGenerate.generateConfigs()");
  assert.match(await run('document.getElementById("dockerfileOutput").value'), /FROM node:20\./);
  assert.match(await run('document.getElementById("guideSecurity").textContent'), /検証目的の例外/);
  await run(`window.ImageUI.selections.set('nodejs', {...window.__savedVersion, tag:'nonexistent'});
    window.confirm = () => { throw new Error('Unknown tags must not have an exception'); };
    window.__testConfirmModules(); window.__rendererGenerate.generateConfigs();`);
  assert.equal(await run('document.getElementById("composeOutput").value'), "");
  await run("window.ImageUI.selections.set('nodejs',window.__savedVersion); window.confirm = window.__savedConfirm; window.__testConfirmModules(); window.__rendererGenerate.generateConfigs()");
  console.log("PASS Electron EOL reject/one-generation exception and unknown-tag rejection without exception");

  // 通信のOS境界だけを置き換え、main/preload/UI/検証/実キャッシュを通す。
  const original = https.get;
  const before = await run("window.ImageUI.selected('nodejs').image");
  let fail = false;
  https.get = (url, _opts, callback) => {
    const req = new EventEmitter(); req.destroy = error => { req.emit("error", error); req.emit("close"); };
    process.nextTick(() => {
      if (fail) { req.destroy(new Error("simulated offline")); return; }
      try {
        const match = new URL(url).pathname.match(/^\/v2\/namespaces\/([^/]+)\/repositories\/([^/]+)\/tags(?:\/(.+))?$/);
        assert.ok(match);
        const entries = bundled.entries.filter(e => versions.slots.find(s => s.id === e.slotId).repository === match[1] + "/" + match[2]);
        const detail = e => ({ name: e.tag, digest: e.digest, images: e.platforms.map(p => ({ ...p, os: "linux" })) });
        const data = match[3] ? detail(entries.find(e => e.tag === decodeURIComponent(match[3]))) : { results: entries.map(detail) };
        const res = new EventEmitter(); res.resume = () => {};
        res.statusCode = 200; res.headers = { "content-type": "application/json" }; callback(res);
        res.emit("data", Buffer.from(JSON.stringify(data))); res.emit("end"); req.emit("close");
      } catch (e) { req.destroy(e); }
    });
    return req;
  };
  try {
    await run("document.getElementById('updateImageCatalogButton').click()");
    await until("document.getElementById('imageCatalogStatus').textContent.includes('更新完了')");
    assert.equal(await run("window.ImageUI.selected('nodejs').image"), before);
    assert.equal(await run('document.querySelector("[data-module-id=nginx] input[data-field-name=hostPort]").value'), "9137");
    const cachePath = path.join(__dirname, "profile", "image-catalog-v1.json");
    const bytes = fs.readFileSync(cachePath);
    fail = true;
    await run("document.getElementById('updateImageCatalogButton').click()");
    await until("document.getElementById('imageCatalogStatus').textContent.includes('更新失敗')");
    assert.deepEqual(fs.readFileSync(cachePath), bytes);
    assert.equal(await run("window.ImageUI.selected('nodejs').image"), before);
    await run("window.__testConfirmModules(); window.__rendererGenerate.generateConfigs()");
    assert.match(await run('document.getElementById("composeOutput").value'), /9137:80/);
  } finally { https.get = original; }
  console.log("PASS Electron online update, offline failure preserves userData cache, selected version and other inputs");

  // 実画面で全テーマの新しい文字/選択欄のコントラストと横方向の収まりを確認する。
  const screenshots = process.env.DOCKER_BUILDER_SCREENSHOT_DIR;
  for (const theme of ["system", "light", "dark", "blue", "green", "yellow", "orange", "red", "pink"]) {
    await run(`window.__rendererCore.applyTheme('${theme}'); document.querySelector('[data-tab=config]').click(); document.querySelector('#configSections').scrollIntoView(); window.scrollBy(0, -230)`);
    const colors = await run(`(() => { const e = document.querySelector('.image-series'); const c = getComputedStyle(e); return [c.color, c.backgroundColor]; })()`);
    const luminance = color => {
      const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const a = luminance(colors[0]), b = luminance(colors[1]);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, theme);
    if (screenshots && ["light", "dark", "blue"].includes(theme)) {
      fs.mkdirSync(screenshots, { recursive: true });
      fs.writeFileSync(path.join(screenshots, `v030-${theme}.png`), (await wc.capturePage()).toPNG());
    }
  }
  win.setSize(720, 800);
  assert.equal(await run("document.documentElement.scrollWidth <= innerWidth"), true,
    JSON.stringify(await run("[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,8).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width}))")));
  await run("document.querySelector('[data-tab=output]').click()");
  assert.equal(await run("document.documentElement.scrollWidth <= innerWidth"), true);
  if (screenshots) fs.writeFileSync(path.join(screenshots, "v030-output-narrow.png"), (await wc.capturePage()).toPNG());
  win.setSize(1280, 800);
  console.log("PASS nine themes contrast and narrow version/output layout; screenshots captured");
};

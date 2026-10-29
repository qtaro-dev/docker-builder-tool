// モジュール選択画面だけの表示回帰。テーマ設定や生成仕様は変更しない。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const luminance = rgb => {
  const values = rgb.match(/[\d.]+/g).slice(0, 3).map(v => {
    // color-mixの計算値はcolor(srgb ...)（0〜1）で返る場合がある。
    const c = rgb.startsWith('color(srgb ') ? Number(v) : Number(v) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};
const palette = {
  light: ['rgb(232, 232, 232)', 'rgb(85, 85, 85)'],
  dark: ['rgb(38, 58, 84)', 'rgb(96, 165, 250)'],
  blue: ['rgb(224, 237, 255)', 'rgb(37, 99, 235)'],
  green: ['rgb(224, 245, 231)', 'rgb(25, 135, 84)'],
  yellow: ['rgb(255, 242, 179)', 'rgb(197, 138, 0)'],
  orange: ['rgb(255, 240, 214)', 'rgb(200, 100, 22)'],
  red: ['rgb(255, 229, 229)', 'rgb(220, 53, 69)'],
  pink: ['rgb(255, 229, 240)', 'rgb(214, 51, 132)'],
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
module.exports = async ({ run, wc, win }) => {
  const originalTheme = await run('window.__rendererCore.getTheme()');
  const selected = ['nginx', 'certbot', 'nodejs', 'wordpress', 'mysql', 'phpmyadmin'];
  const screenshotDir = process.env.DOCKER_BUILDER_SCREENSHOT_DIR;
  win.setContentSize(1280, 720);
  wc.debugger.attach('1.3');
  try {
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('CSS.enable');
    await run('window.__rendererUI.resetConfiguration(); document.querySelector(\'[data-tab="modules"]\').click()');
    const { root } = await wc.debugger.sendCommand('DOM.getDocument');
    const nodes = {};
    for (const id of ['nginx', 'apache']) {
      nodes[id] = (await wc.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: `.module-row[data-module-id="${id}"]` })).nodeId;
    }
    const hover = async id => {
      for (const [key, nodeId] of Object.entries(nodes)) await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: key === id ? ['hover'] : [] });
    };
    const read = id => run(`(() => {
      const row = document.querySelector('.module-row[data-module-id="${id}"]');
      const style = e => getComputedStyle(e);
      const icon = row.querySelector('.module-icon-wrapper');
      return { background: style(row).backgroundColor, color: style(row.querySelector('.module-name')).color,
        desc: style(row.querySelector('.module-desc')).color, border: style(icon).borderTopColor,
        borderWidth: style(icon).borderTopWidth, accent: style(row.querySelector('.module-label-cell')).boxShadow,
        iconWidth: icon.getBoundingClientRect().width, height: row.getBoundingClientRect().height };
    })()`);
    // 行全体の位置、アイコン内外寸、文字位置を全19件で比較する。
    const geometry = () => run(`Array.from(document.querySelectorAll('.module-row'), row =>
      [row, row.querySelector('.module-icon-wrapper'), row.querySelector('.module-icon, .module-icon-fallback'), row.querySelector('.module-text-wrapper')].map(el => {
        const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
      }))`);
    const initialGeometry = await geometry();
    for (const id of selected) await run(`document.querySelector('.module-row[data-module-id="${id}"]').click()`);
    assert.deepEqual(await geometry(), initialGeometry, 'Initial six selections must not move icons, rows or text');
    await run(`(() => {
      const section = document.querySelector('#configSections section[data-module-id="mysql"]');
      const input = section.querySelector('input[data-field-name="hostPort"]');
      input.value = '13557'; input.dispatchEvent(new Event('input', {bubbles:true}));
      section.querySelector('.module-review-checkbox').click();
    })()`);
    const retainedState = () => run(`({
      ids: Array.from(document.querySelectorAll('.module-row.is-selected'), e => e.dataset.moduleId),
      value: document.querySelector('#configSections section[data-module-id="mysql"] input[data-field-name="hostPort"]').value,
      reviewed: document.querySelector('#configSections section[data-module-id="mysql"] .module-review-checkbox').checked
    })`);
    const initialState = await retainedState();
    assert.equal(initialState.reviewed, true);
    const themes = await run('window.__rendererCore.themes.map(t=>t[0])');
    for (const theme of themes) {
      await run(`window.__rendererCore.applyTheme(${JSON.stringify(theme)})`);
      await hover(null);
      const unselected = await read('apache');
      await hover('apache');
      const unselectedHover = await read('apache');
      assert.notEqual(unselected.background, unselectedHover.background, theme + ' unselected hover');
      assert.equal(unselected.borderWidth, '3px');
      assert.equal(unselected.border, 'rgba(0, 0, 0, 0)');
      await hover(null);
      const normal = await read('nginx');
      const effective = await run('window.__rendererCore.getEffectiveTheme()');
      assert.equal(normal.background, palette[effective][0], theme);
      assert.equal(normal.border, palette[effective][1], theme);
      assert.equal(normal.borderWidth, '3px', theme);
      assert.equal(normal.accent, 'none', theme + ' no left accent');
      assert.equal(normal.iconWidth, 66);
      for (const color of [normal.color, normal.desc]) assert.ok(contrast(normal.background, color) >= 4.5, theme + ' text contrast');
      await hover('nginx');
      const hovered = await read('nginx');
      assert.notEqual(hovered.background, normal.background);
      for (const color of [hovered.color, hovered.desc]) assert.ok(contrast(hovered.background, color) >= 4.5, theme + ' selected hover contrast');
      assert.notEqual(hovered.background, unselectedHover.background);
      assert.equal(hovered.height, normal.height);
      assert.equal(await run('document.querySelectorAll(".module-row.is-selected").length'), 6);
      assert.equal(await run('document.querySelectorAll("#configSections section[data-module-id]").length'), 6);
      assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(await run('Array.from(document.querySelectorAll(".module-row.is-selected .module-icon"),e=>e.complete&&e.naturalWidth>0).every(Boolean)'), true);
      await hover(null);
      assert.deepEqual(await retainedState(), initialState, theme + ' theme change retains selection, input and confirmation');
      const beforeToggle = await geometry();
      await run('document.querySelector(\'.module-row[data-module-id="nginx"]\').click()');
      assert.deepEqual(await geometry(), beforeToggle, theme + ' deselection geometry');
      assert.equal((await read('nginx')).border, 'rgba(0, 0, 0, 0)');
      await run('document.querySelector(\'.module-row[data-module-id="nginx"]\').click()');
      assert.deepEqual(await geometry(), beforeToggle, theme + ' selection geometry');
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if (screenshotDir) fs.writeFileSync(path.join(screenshotDir, 'module-selection-' + theme + '.png'), (await wc.capturePage()).toPNG());
    }
    // OS設定変更時もsystem識別子と確認状態を保ち、選択色だけを追従させる。
    await run('window.__rendererCore.applyTheme("system")');
    for (const effective of ['light', 'dark']) {
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: effective }] });
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(await run('window.__rendererCore.getTheme()'), 'system');
      assert.equal((await read('nginx')).background, palette[effective][0]);
      assert.equal((await read('nginx')).border, palette[effective][1]);
      assert.deepEqual(await retainedState(), initialState);
    }
    // 選択解除・再選択後も、構成入力へ反映される既存の動作を確認。
    await run('document.querySelector(\'.module-row[data-module-id="nginx"]\').click()');
    assert.equal(await run('document.querySelectorAll("#configSections section[data-module-id]").length'), 5);
    await run('document.querySelector(\'.module-row[data-module-id="nginx"]\').click();document.querySelector(\'[data-tab="config"]\').click()');
    assert.equal(await run('document.querySelectorAll(".module-row.is-selected").length'), 6);
    assert.equal(await run('document.querySelectorAll("#configSections section[data-module-id]").length'), 6);
    console.log('PASS module selection colors: nine theme palettes at 1280x720; fixed icon/row/text geometry on selection and deselection; transparent 3px borders; hover contrast >=4.5; OS theme following; retained selection/input/confirmation');
  } finally {
    wc.debugger.detach();
    await run(`window.__rendererUI.resetConfiguration();window.__rendererCore.applyTheme(${JSON.stringify(originalTheme)})`);
    win.setContentSize(1280, 900);
  }
};

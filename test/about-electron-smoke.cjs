// 実ElectronでAbout専用UIを検証。外部ブラウザのOS境界だけをスタブする。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Menu, shell, BrowserWindow } = require('electron');
const luminance = rgb => rgb.match(/[\d.]+/g).slice(0,3).map(v=>{
  const c = Number(v)/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
}).reduce((total,c,i)=>total+c*[.2126,.7152,.0722][i],0);
const contrast = (a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
module.exports = async ({ run, until, wc, win }) => {
  const originalTheme = await run('window.__rendererCore.getTheme()');
  const originalSize = win.getContentSize();
  if (process.env.DOCKER_BUILDER_SCREENSHOT_DIR) fs.mkdirSync(process.env.DOCKER_BUILDER_SCREENSHOT_DIR, {recursive:true});
  const external = shell.openExternal;
  const opened = [];
  const target = 'https://github.com/qtaro-dev/docker-builder-tool';
  shell.openExternal = async url=>{opened.push(url);};
  const open = async ()=>{
    Menu.getApplicationMenu().items[5].submenu.items[0].click();
    await until('document.getElementById("aboutDialog").open');
    await until('document.querySelector(".about-illustration").complete && document.querySelector(".about-illustration").naturalWidth > 0');
  };
  const close = async ()=>{
    await run('document.getElementById("aboutCloseButton").click()');
    await until('!document.getElementById("aboutDialog").open');
  };
  try {
    win.setContentSize(1280,720);
    const version = require('./app-info').describeApp().displayVersion;
    const license = require('./package.json').license;
    await open();
    await until(`document.getElementById('aboutVersion').textContent===${JSON.stringify(version)} && document.getElementById('aboutLicense').textContent.includes(${JSON.stringify(license)})`);
    assert.equal(await run('document.getElementById("aboutTitle").textContent'), 'Docker Builder Tool');
    assert.equal(await run('document.querySelector(".about-subtitle").textContent'), 'Docker 構成ジェネレーター');
    assert.equal(await run('document.getElementById("aboutLogPath").textContent'), path.join(__dirname, 'docker-builder.log'));
    const themes = await run('window.__rendererCore.themes.map(t=>t[0])');
    for (const theme of themes) {
      await run(`window.__rendererCore.applyTheme(${JSON.stringify(theme)})`);
      const layout = await run(`(() => {
        const dialog=document.getElementById('aboutDialog'),content=document.querySelector('.about-content'),img=document.querySelector('.about-illustration');
        const rect=dialog.getBoundingClientRect(),ir=img.getBoundingClientRect(),button=document.getElementById('aboutCloseButton').getBoundingClientRect();
        const pairs=['#aboutTitle','.about-subtitle','#aboutDescription','.about-details dt','#aboutProjectLink','.about-log-path'].map(s=>[
          getComputedStyle(document.querySelector(s)).color,getComputedStyle(document.querySelector(s).closest('.about-hero')||dialog).backgroundColor]);
        return { inside: rect.top>=0 && rect.bottom<=innerHeight && rect.left>=0 && rect.right<=innerWidth,
          noScroll:content.scrollHeight<=content.clientHeight, noHorizontal:content.scrollWidth<=content.clientWidth,
          imageFits:ir.left>=rect.left && ir.right<=rect.right && ir.top>=rect.top && ir.bottom<=rect.bottom,
          imageRatio:ir.width/ir.height, originalRatio:img.naturalWidth/img.naturalHeight,
          objectFit:getComputedStyle(img).objectFit, closeVisible:button.bottom<=innerHeight, pairs };
      })()`);
      assert.equal(layout.inside,true,theme+' dialog fits 1280x720');
      assert.equal(layout.noScroll,true,theme+' no unnecessary internal scroll');
      assert.equal(layout.noHorizontal,true,theme);
      assert.equal(layout.imageFits,true,theme);
      assert.ok(Math.abs(layout.imageRatio-layout.originalRatio)<.001,theme+' image aspect ratio');
      assert.equal(layout.objectFit,'contain');
      assert.equal(layout.closeVisible,true,theme);
      for(const pair of layout.pairs)assert.ok(contrast(...pair)>=4.5,theme+' About text contrast');
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if(process.env.DOCKER_BUILDER_SCREENSHOT_DIR)fs.writeFileSync(path.join(process.env.DOCKER_BUILDER_SCREENSHOT_DIR,'about-'+theme+'.png'),(await wc.capturePage()).toPNG());
    }
    assert.deepEqual(opened,[], 'Opening About must not launch a browser automatically');
    const beforeURL = wc.getURL();
    await run('document.getElementById("aboutProjectLink").click()');
    await until('document.getElementById("aboutLinkStatus").textContent===""');
    // await a completed invoke to ensure the preceding native-shell call has completed.
    await run('window.electronAPI.getAboutInfo()');
    assert.deepEqual(opened,[target]);
    assert.equal(wc.getURL(),beforeURL);
    await run('window.electronAPI.openProjectPage("file:///C:/Windows/notepad.exe")');
    assert.deepEqual(opened,[target,target], 'Caller URL must be ignored');
    shell.openExternal = async ()=>{throw new Error('simulated browser failure');};
    await run('document.getElementById("aboutProjectLink").click()');
    await until('document.getElementById("aboutLinkStatus").textContent.includes("ブラウザを開けませんでした")');
    assert.equal(await run('document.getElementById("aboutDialog").open'),true);
    await close();
    await open();
    win.focus();wc.focus();
    wc.sendInputEvent({type:'keyDown',keyCode:'ESC'});wc.sendInputEvent({type:'keyUp',keyCode:'ESC'});
    await until('!document.getElementById("aboutDialog").open');
    // 同じpreloadを持つ他ウィンドウにも公開ページ起動権限を与えない。
    const foreign = new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
    try {
      await foreign.loadURL('data:text/html,<title>About IPC boundary</title>');
      for(const operation of ['getAboutInfo','openProjectPage'])assert.equal(await foreign.webContents.executeJavaScript(`(async()=>{try{await window.electronAPI.${operation}();return false;}catch{return true;}})()`),true);
    } finally {foreign.destroy();}
    win.setContentSize(480,480);
    await open();
    assert.equal(await run('document.getElementById("aboutDialog").getBoundingClientRect().bottom<=innerHeight && document.querySelector(".about-content").scrollWidth<=document.querySelector(".about-content").clientWidth'),true);
    await close();
    console.log('PASS About: nine themes at 1280x720, image/aspect ratio, dynamic version/license/log path, menu/Close/Escape, fixed external URL/failure/untrusted IPC, narrow internal scrolling');
  } finally {
    shell.openExternal=external;
    await run(`document.getElementById('aboutDialog').close();window.__rendererCore.applyTheme(${JSON.stringify(originalTheme)})`);
    win.setContentSize(...originalSize);
  }
};

// ローカルHTMLの描画回帰。アプリ本体を読み込まず、外部通信・PDF出力もしない。
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{setTimeout:delay}=require('node:timers/promises');
const root=path.resolve(__dirname,'../..'),manual=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'docs/manual'),out=process.argv[3]?path.resolve(process.argv[3]):path.join(__dirname,'qa');
fs.mkdirSync(out,{recursive:true});
const profile=path.join(out,'profiles','run-'+process.pid);fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);app.setPath('sessionData',path.join(profile,'session'));
setTimeout(()=>{console.error('Documentation render test timeout');app.exit(1)},60000).unref();
(async()=>{
 await app.whenReady();const win=new BrowserWindow({show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});win.setContentSize(1280,720);
 const wc=win.webContents,run=s=>wc.executeJavaScript(s,true),errors=[],network=[];
 wc.on('console-message',d=>{if(d.level==='error')errors.push(d.message);});
 wc.session.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/.test(d.url)){network.push(d.url);cb({cancel:true});}else cb({});});
 const until=async s=>{for(let i=0;i<120;i++){if(await run(s))return;await delay(50);}throw new Error('Timed out '+s);};
 const frame=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const snapshot=async name=>{await frame();fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());};
 const report={engine:process.versions.chrome,viewport:[1280,720],pages:[],printMedia:[],nativePrintDialog:'NOT_RUN',pdfGenerated:false};
 const assets=()=>run('Promise.all(Array.from(document.images,i=>{i.loading="eager";return i.decode()})).then(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0))');
 const checkLayout=()=>run('({overflow:document.documentElement.scrollWidth>innerWidth,bg:getComputedStyle(document.body).backgroundColor,foreground:getComputedStyle(document.body).color})');
 // 公開入口も相対パスだけで新しい操作ガイドへ移動する。
 await win.loadFile(path.join(manual,'index.html'));
 await until('location.pathname.endsWith("/index.html")');
 assert.equal(await assets(),true);assert.equal((await checkLayout()).overflow,false);
 await run('document.getElementById("open-recipes").click()');
 await until('location.pathname.endsWith("/recipes.html")');assert.equal(await assets(),true);
 assert.equal(await run('document.querySelector(".recipe-mascot").naturalWidth>0'),true);
 await snapshot('recipe-character');
 await run('document.getElementById("back-to-guide").click()');
 await until('location.pathname.endsWith("/index.html")');assert.equal(await run('location.hash'),'#contents');
 await run('window.scrollTo(0,0)');
 report.crossPageNavigation=true;report.recipeIllustration=true;
 await snapshot('guide-1280');
 for(const id of ['overview','screens','selection','configuration','generate','save','settings','combinations','trouble','advanced']){
  await run(`document.querySelector('.sidebar a[href="#${id}"]').click()`);await frame();
  assert.equal(await run('location.hash'),'#'+id);
  const top=await run(`document.getElementById('${id}').getBoundingClientRect().top`);assert.ok(top>=-2&&top<720,id+' heading visible');
 }
 await run('document.querySelector("#advanced .back").click()');await delay(800);
 assert.equal(await run('location.hash'),'#contents');assert.ok(await run('document.getElementById("contents").getBoundingClientRect().top>=-2'));
 await run('document.querySelector(".zoom-image").click()');assert.equal(await run('document.getElementById("image-dialog").open'),true);
 assert.equal(await run('document.querySelectorAll("#zoom-content .target").length'),3);await snapshot('image-zoom');
 await run('document.getElementById("zoom-close").click()');assert.equal(await run('document.getElementById("image-dialog").open'),false);
 await run('document.querySelector(".zoom-image").click()');win.focus();wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:'ESC'});wc.sendInputEvent({type:'keyUp',keyCode:'ESC'});await until('!document.getElementById("image-dialog").open');
 report.pages.push({page:'index.html',images:true,tocTenChapters:true,backToContents:true,zoomAndEscape:true});
 wc.debugger.attach('1.3');
 // マニュアルには表示モード切替UIがない。OSのdarkでも意図した白・青を保つ。
 for(const color of ['light','dark']){await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:color}]});assert.equal((await checkLayout()).overflow,false);}
 wc.debugger.detach();
 win.setContentSize(560,900);await run('window.scrollTo(0,0)');await frame();assert.equal((await checkLayout()).overflow,false);await snapshot('guide-narrow');win.setContentSize(1280,720);
 await win.loadFile(path.join(manual,'recipes.html'));assert.equal(await assets(),true);assert.equal((await checkLayout()).overflow,false);
 assert.equal(await run('document.querySelectorAll(".recipe").length'),require('./recipe-inputs.json').length);
 await snapshot('recipes-1280');
 await run('document.getElementById("recipe-search").value="Nginx MySQL";document.getElementById("recipe-search").dispatchEvent(new Event("input"))');
 assert.equal(await run('document.querySelectorAll(".recipe-card:not([hidden])").length'),1);
 await run('document.querySelector(".recipe-card:not([hidden])").click()');await frame();assert.equal(await run('location.hash'),'#recipe-nginx-nodejs-mysql');
 assert.ok(await run('document.getElementById("recipe-nginx-nodejs-mysql").getBoundingClientRect().top>=-2'));
 await run('document.querySelector("#recipe-nginx-nodejs-mysql .back").click()');await delay(800);assert.ok(await run('document.getElementById("contents").getBoundingClientRect().top>=-2'));
 await snapshot('recipe-search');await run('document.getElementById("recipe-reset").click()');
 assert.equal(await run('document.querySelector("#recipe-status, #recipe-count, .status, .scope")'),null);
 assert.equal(await run('document.querySelector(".topbar").textContent.includes("32")'),false);
 await run('document.getElementById("recipe-reset").click();document.getElementById("recipe-level").value="初級";document.getElementById("recipe-level").dispatchEvent(new Event("change"))');
 assert.ok(await run('document.querySelectorAll(".recipe-card:not([hidden])").length')>0);await run('document.getElementById("recipe-reset").click()');
 for(const level of ['初級','中級','上級']){
  await run(`document.getElementById('recipe-level').value=${JSON.stringify(level)};document.getElementById('recipe-level').dispatchEvent(new Event('change'))`);
  const expected=require('./recipe-inputs.json').filter(r=>r.level===level).length;
  assert.equal(await run('document.querySelectorAll(".recipe-card:not([hidden])").length'),expected);
 }
 await run('document.getElementById("recipe-reset").click()');
 assert.equal(await run('document.querySelectorAll(".difficulty-reason").length'),require('./recipe-inputs.json').length);
 await run('document.getElementById("difficulty").scrollIntoView({behavior:"instant"})');await snapshot('difficulty-guide');
 await run('document.getElementById("recipe-nginx-nodejs-postgresql-redis").scrollIntoView({behavior:"instant"})');await snapshot('advanced-recipe');
 // 全32カードの詳細遷移を確認する。
 for(const id of await run('Array.from(document.querySelectorAll(".recipe"),e=>e.id)')){
  await run(`document.querySelector('.recipe-card[data-ref="${id}"]').click()`);await frame();
  assert.equal(await run('location.hash'),'#'+id);assert.equal(await run(`document.getElementById('${id}').hidden`),false);
 }
 win.setContentSize(560,900);assert.equal((await checkLayout()).overflow,false);await run('window.scrollTo(0,0)');await snapshot('recipes-narrow');win.setContentSize(1280,720);
 report.pages.push({page:'recipes.html',images:true,search:true,levelFilter:true,allRecipeAnchors:true,narrow560:true});
 // 印刷ボタンの呼び出しを境界で確認し、印刷メディアCSSをA4本文幅で検査する。
 await run('window.__printCalls=0;window.print=()=>{window.__printCalls++};document.getElementById("print-button").click()');assert.equal(await run('window.__printCalls'),1);
 wc.debugger.attach('1.3');
 for(const page of ['index.html','recipes.html']){
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'screen'});await win.loadFile(path.join(manual,page));await assets();
  const originalOpen=await run('Array.from(document.querySelectorAll("details"),e=>e.open)');
  await run('window.dispatchEvent(new Event("beforeprint"))');
  assert.equal(await run('Array.from(document.querySelectorAll("details")).every(e=>e.open)'),true);
  win.setContentSize(688,1016);await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'print'});await frame();
  const print=await run(`({horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
    sidebarHidden:getComputedStyle(document.querySelector('.sidebar')).display==='none',
    figures:Array.from(document.querySelectorAll('.screenshot'),e=>({height:e.getBoundingClientRect().height,breakInside:getComputedStyle(e).breakInside})),
    imagesFit:Array.from(document.images).every(e=>e.getBoundingClientRect().width<=688),
    rowsFit:Array.from(document.querySelectorAll('tr')).every(e=>e.getBoundingClientRect().height<1016),
    chapterBreaks:Array.from(document.querySelectorAll('.chapter,.recipe')).every(e=>getComputedStyle(e).breakBefore==='page')})`);
  assert.equal(print.horizontalOverflow,false,page+' print width');assert.equal(print.sidebarHidden,true);assert.equal(print.imagesFit,true);assert.equal(print.rowsFit,true);assert.equal(print.chapterBreaks,true);
  assert.ok(print.figures.every(f=>f.height<1016&&f.breakInside==='avoid'),page+' figures fit an A4 content page');
  await run('window.scrollTo(0,0)');await snapshot('print-'+page.replace('.html',''));report.printMedia.push({page,...print});
  await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{media:'screen'});await run('window.dispatchEvent(new Event("afterprint"))');
  assert.deepEqual(await run('Array.from(document.querySelectorAll("details"),e=>e.open)'),originalOpen);
 }
 wc.debugger.detach();assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
 report.externalRequests=0;report.consoleErrors=0;fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(report,null,2));
 console.log('PASS Chromium: prominent cross-page links and recipe character, two pages, all images, 10 chapter links, all recipe links, search/level/reset, zoom/Close/Escape, 1280x720 and 560px, offline, A4 print CSS; no PDF/OS printing');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});

// 全リンク先をChromiumで開き、表示またはダウンロード開始を確認する。保存は境界で取り消す。
const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{setTimeout:delay}=require('node:timers/promises');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/manual'),out=path.join(__dirname,'qa'),profile=path.join(out,'profiles','links-'+process.pid);fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);app.setPath('sessionData',path.join(profile,'session'));
setTimeout(()=>{console.error('Link browser audit timeout');app.exit(1)},60000).unref();
(async()=>{
 await app.whenReady();const win=new BrowserWindow({show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.setContentSize(1280,720);const wc=win.webContents;
 const targets=JSON.parse(fs.readFileSync(path.join(out,'link-targets.json'),'utf8')),results=[],network=[];let completedDownload;
 wc.session.webRequest.onBeforeRequest((d,cb)=>{if(/^https?:/.test(d.url)){network.push(d.url);cb({cancel:true});}else cb({});});
 wc.setWindowOpenHandler(()=>({action:'deny'}));
 wc.session.on('will-download',(_event,item)=>{item.cancel();completedDownload?.({kind:'download',filename:item.getFilename()});});
 for(const relative of targets){
  const full=path.resolve(base,relative);assert.ok(full.startsWith(base+path.sep));assert.ok(fs.readFileSync(full).length>0,relative);
  const download=new Promise(resolve=>completedDownload=resolve);
  const loaded=wc.loadFile(full).then(()=>({kind:'page'}),error=>({kind:'error',message:error.message}));
  let result=await Promise.race([download,loaded,delay(3000).then(()=>({kind:'timeout'}))]);
  if(result.kind==='error')result=await Promise.race([download,delay(100).then(()=>result)]);
  assert.ok(['page','download'].includes(result.kind),relative+' '+JSON.stringify(result));
  if(result.kind==='page'){
   assert.equal(await wc.executeJavaScript('document.body!==null'),true,relative);
   if(relative.endsWith('.html')&&relative.startsWith('examples/')){
    const body=await wc.executeJavaScript('document.body.innerText.trim()');assert.ok(body.length>0,relative);
    if(fs.readFileSync(full,'utf8').includes('docker-builder-ci-static'))assert.equal(body,'docker-builder-ci-static',relative);
   }
  }
  if(relative==='examples/apache-basic/additions/fixture-web/index.html')fs.writeFileSync(path.join(out,'apache-sample-link.png'),(await wc.capturePage()).toPNG());
  results.push({file:relative,outcome:result.kind});await delay(5);
 }
 // HTMLサンプルのクリックで別画面が開き、元のレシピを維持することも確認。
 await wc.loadFile(path.join(base,'recipes.html'));
 const {pathToFileURL}=require('node:url');const expected=pathToFileURL(path.join(base,'examples/apache-basic/additions/fixture-web/index.html')).href;
 wc.setWindowOpenHandler(details=>details.url===expected?({action:'allow',overrideBrowserWindowOptions:{show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}}):({action:'deny'}));
 const childCreated=new Promise(resolve=>wc.once('did-create-window',child=>resolve(child)));
 await wc.executeJavaScript('document.querySelector(\'a[href="examples/apache-basic/additions/fixture-web/index.html"]\').click()');
 const child=await Promise.race([childCreated,delay(3000).then(()=>{throw new Error('Sample tab did not open')})]);
 try {
  if(child.webContents.isLoadingMainFrame())await new Promise(resolve=>child.webContents.once('did-finish-load',resolve));
  assert.equal(child.webContents.getURL(),expected);
  assert.equal(await child.webContents.executeJavaScript('document.body.innerText.trim()'),'docker-builder-ci-static');
  assert.ok(wc.getURL().endsWith('/recipes.html'),'Original manual remains open');
 }finally{child.destroy();}
 assert.deepEqual(network,[]);fs.writeFileSync(path.join(out,'link-browser-result.json'),JSON.stringify({targets:results.length,displayed:results.filter(r=>r.outcome==='page').length,downloadStarted:results.filter(r=>r.outcome==='download').length,newTabKeepsManual:true,downloadsSaved:false,externalRequests:network.length,results},null,2));
 console.log('PASS all',results.length,'unique file destinations render or start download; Apache sample expected text confirmed; no files downloaded');app.exit(0);
})().catch(error=>{console.error(error);app.exit(1)});

// 実配布EXEをローカルInspector経由で検査する開発用ツール。ASARや製品IPCは変更しない。
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {fileURLToPath}=require('node:url');
const {setTimeout:delay}=require('node:timers/promises');
const executable=path.resolve(process.argv[2]),kind=process.argv[3],out=path.resolve(process.argv[4]);
assert.ok(['portable','installer'].includes(kind));assert.ok(fs.existsSync(executable));fs.mkdirSync(out,{recursive:true});
const expectedRoot=path.dirname(executable),results={kind,executable,osBrowser:'NOT_VERIFIED (native opener boundary stubbed)',screenshots:[],runs:[]};
async function until(fn,timeout=45000){const deadline=Date.now()+timeout;let last;do{try{const result=await fn();if(result)return result;}catch(e){last=e;}await delay(100);}while(Date.now()<deadline);throw new Error('Timed out: '+last?.message);}
async function inspect(restart=false){
 for(const sub of ['profile','session'])fs.mkdirSync(path.join(out,sub),{recursive:true});
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(executable,[`--inspect=127.0.0.1:${port}`,`--user-data-dir=${path.join(out,'profile')}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let finished=false,code;child.on('exit',value=>{finished=true;code=value;});
 const log=fs.createWriteStream(path.join(out,restart?'restart.log':'runtime.log'));child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 let socket;
 try{
  const target=await until(async()=>{if(finished)throw new Error('EXE exited early '+code);const r=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)});return (await r.json())[0];});
  assert.ok(target.webSocketDebuggerUrl.startsWith(`ws://127.0.0.1:${port}/`));
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0,paused=false,hits=[],frameId;const pending=new Map();
  const trace=value=>fs.appendFileSync(path.join(out,'inspector-trace.log'),value+'\n');
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Debugger.paused'){paused=true;hits=message.params.hitBreakpoints||[];frameId=message.params.callFrames[0].callFrameId;trace('PAUSED '+JSON.stringify(message.params.callFrames.slice(0,2).map(f=>({url:f.url,functionName:f.functionName}))));}if(message.id&&pending.has(message.id)){const entry=pending.get(message.id);pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{trace(method+' '+(params.expression||'').slice(0,180));const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Inspector timeout '+method+' '+(params.expression||'').slice(0,100)));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
  await call('Runtime.enable');
  // Chromiumの標準user-data-dirでテスト用プロファイルへ分離する。
  const prefix="process.getBuiltinModule('module').createRequire(process.execPath)('electron')";
  const run=expression=>evaluate(`(async()=>{const e=${prefix};const w=e.BrowserWindow.getAllWindows()[0];return await w.webContents.executeJavaScript(${JSON.stringify(expression)},true)})()`);
  await until(()=>run('document.querySelectorAll(".module-row").length===19'));
  const metadata=await evaluate(`(()=>{const e=${prefix};const w=e.BrowserWindow.getAllWindows()[0];return {packaged:e.app.isPackaged,version:e.app.getVersion(),userData:e.app.getPath('userData'),resources:process.resourcesPath,appPath:e.app.getAppPath(),preferences:w.webContents.getLastWebPreferences()}})()`);
  assert.equal(metadata.packaged,true);assert.equal(metadata.version,'0.3.0');assert.equal(metadata.preferences.nodeIntegration,false);assert.equal(metadata.preferences.contextIsolation,true);assert.equal(metadata.preferences.sandbox,true);assert.equal(metadata.preferences.webSecurity,true);
  await evaluate(`(()=>{const w=${prefix}.BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false);return true})()`);
  await until(()=>run('document.getElementById("aboutVersion").textContent==="0.3.0 Release 1"'));
  assert.equal(await run('document.title'),'Docker Builder Tool 0.3.0 Release 1');
  const initialTheme=await run('window.__rendererCore.getTheme()');
  // 再検証時に残っているテスト設定を消さず、撮影時だけライトへ切り替える。
  if(!restart)await run('window.__rendererCore.applyTheme("light")');
  const expectedTheme=restart?'dark':'light';assert.equal(await run('window.__rendererCore.getTheme()'),expectedTheme);
  if(kind==='portable')assert.equal(path.resolve(metadata.userData),path.join(expectedRoot,'data'));
  if(!restart){
   // 実際に展開・インストールされたresources一式を元ソースと照合する。
   const checked=spawnSync(process.execPath,[path.join(__dirname,'verify-package.cjs'),path.join(metadata.resources,'app.asar'),kind],{encoding:'utf8'});assert.equal(checked.status,0,checked.stdout+checked.stderr);
   fs.writeFileSync(path.join(out,'package-check.log'),checked.stdout);
   await evaluate(`(()=>{const e=${prefix};e.Menu.getApplicationMenu().items.find(i=>i.label==='ヘルプ').submenu.items.find(i=>i.label==='バージョン情報').click();return true})()`);
   await until(()=>run('document.getElementById("aboutDialog").open && document.querySelector(".about-illustration").complete'));
   await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const png=await evaluate(`(async()=>{const e=${prefix};return (await e.BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')})()`);
   const screenshot=path.join(out,'about.png');fs.writeFileSync(screenshot,Buffer.from(png,'base64'));results.screenshots.push(screenshot);
   await run('document.getElementById("aboutCloseButton").click()');
   // ブラウザの起動操作だけをスタブし、製品メニューのパス解決とPortable用コピーは実行する。
   await evaluate(`(()=>{const e=${prefix};global.__manualUrls=[];global.__openExternal=e.shell.openExternal;e.shell.openExternal=async url=>{global.__manualUrls.push(url)};e.Menu.getApplicationMenu().items.find(i=>i.label==='ヘルプ').submenu.items.find(i=>i.label==='ユーザーマニュアル').click();return true})()`);
   const urls=await until(async()=>{const value=await evaluate('global.__manualUrls');return value.length?value:null});
   assert.equal(urls.length,1);const manual=fileURLToPath(urls[0]);assert.ok(fs.existsSync(manual));assert.ok(fs.existsSync(path.join(path.dirname(manual),'recipes.html')));
   if(kind==='portable')assert.equal(path.dirname(manual),path.join(expectedRoot,'data/manual/0.3.0-release1'));else assert.equal(manual,path.join(metadata.resources,'manual/index.html'));
   results.manualPath=manual;
   await evaluate(`(()=>{${prefix}.shell.openExternal=global.__openExternal;return true})()`);
   await run(`document.querySelector('.module-row[data-module-id="nginx"]').click();document.querySelector('[data-tab="config"]').click();document.getElementById('projectNameInput').value='distribution-test';document.querySelector('input[data-field-name="hostPort"]').value='9090';document.querySelectorAll('.module-review-checkbox').forEach(c=>{if(!c.checked)c.click()});document.getElementById('generateButton').click();`);
   const compose=await until(()=>run('document.getElementById("composeOutput").value || false'));assert.match(compose,/9090:80/);assert.match(compose,/distribution-test-nginx/);
   const saved=path.join(out,`saved-${Date.now()}-docker-compose.yml`);results.generatedFile=saved;
   await evaluate(`(()=>{const e=${prefix};global.__saveDialog=e.dialog.showSaveDialog;e.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(saved)}});return true})()`);
   await run('document.querySelector("[data-tab=output]").click();document.getElementById("composeDownloadBtn").click()');await until(()=>fs.existsSync(saved)&&fs.readFileSync(saved,'utf8')===compose);
   await evaluate(`(()=>{${prefix}.dialog.showSaveDialog=global.__saveDialog;return true})()`);
   await run('window.electronAPI.saveSettings({theme:"dark"})');
   const settingsPath=await run('window.electronAPI.getSettingsPath()');assert.equal(path.resolve(settingsPath),path.join(expectedRoot,'settings.json'));assert.equal(JSON.parse(fs.readFileSync(settingsPath,'utf8')).theme,'dark');
   const about=await run('window.electronAPI.getAboutInfo()');assert.equal(path.resolve(about.logFilePath),path.join(expectedRoot,'docker-builder.log'));
   await run('window.electronAPI.writeLog("Distribution smoke test")');assert.match(fs.readFileSync(about.logFilePath,'utf8'),/Distribution smoke test/);
   results.settingsPath=settingsPath;results.logPath=about.logFilePath;
  }
  results.runs.push({restart,version:metadata.version,about:'0.3.0 Release 1',packaged:true,security:true,userData:metadata.userData,resources:metadata.resources,initialTheme,themeDuringCheck:expectedTheme});
  await evaluate(`(()=>{setTimeout(()=>${prefix}.app.quit(),100);return true})()`);socket.close();socket=null;
  await until(()=>finished,30000);assert.equal(code,0);
 }finally{if(socket)socket.close();if(!finished){spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await until(()=>finished,10000).catch(()=>{});}log.end();}
}
(async()=>{await inspect();await inspect(true);if(kind==='portable'){assert.ok(fs.existsSync(results.manualPath),'Cached manual persists after portable exit');assert.equal(fs.existsSync(path.join(results.runs[0].resources,'app.asar')),false,'Portable temporary extraction removed');}fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...results,launch:true,about:true,manualBoundary:true,generation:true,fileSave:true,settingsPersistence:true,logPersistence:true},null,2));console.log('PASS actual '+kind+' EXE: launch/restart, About/title, secure preferences, manual assets, generation/save, settings/log persistence; default browser GUI remains unverified');})().catch(e=>{console.error(e);process.exitCode=1;});

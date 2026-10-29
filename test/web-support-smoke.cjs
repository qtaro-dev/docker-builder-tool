const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({run,until,wc,win})=>{
 await run(`window.__rendererUI.clearResultsOnly();document.querySelectorAll('.module-row.is-selected').forEach(e=>e.click());['nginx','apache','nodejs','mysql'].forEach(id=>document.querySelector('.module-row[data-module-id="'+id+'"]').click());window.__rendererModulesUI.renderConfigSections(true);document.getElementById('projectNameInput').value='web-ui-test';`);
 assert.deepEqual(await run(`Array.from(document.querySelector('[data-module-id="nginx"] select[data-field-name="proxyTarget"]').options).map(o=>o.value)`),['','nodejs']);
 await run(`(async()=>{const s=document.querySelector('#configSections [data-module-id="nginx"]');s.querySelector('.module-panel-toggle').click();s.querySelector('.module-advanced-settings').open=true;const set=(name,value)=>{const e=s.querySelector('input[data-field-name="'+name+'"],select[data-field-name="'+name+'"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};set('reverseProxy','on');set('proxyTarget','nodejs');set('proxyPath','/api/');window.__testConfirmModules();await window.__rendererGenerate.generateConfigs();})()`);
 assert.equal(await run(`document.getElementById('portMessage').classList.contains('port-message-error')`),false,await run(`document.getElementById('portMessage').textContent`));
 await until(`window.GeneratedFiles.all().some(f=>f.filename==='default.conf'&&f.content.includes('/api/'))`);
 assert.match(await run(`window.GeneratedFiles.all().find(f=>f.relativePath==='nginx/conf/default.conf').content`),/proxy_pass http:\/\/[^:]+-nodejs:3000\//);
 assert.equal(await run(`document.querySelector('#configSections [data-module-id="nginx"] .module-review-checkbox').checked`),true);
 await run(`document.querySelector('#configSections [data-module-id="nginx"] .module-advanced-settings').open=false`);
 assert.equal(await run(`document.querySelector('#configSections [data-module-id="nginx"] .module-review-checkbox').checked`),true);
 await run(`const e=document.querySelector('#configSections [data-module-id="nginx"] input[data-field-name="proxyPath"]');e.value='/other/';e.dispatchEvent(new Event('input',{bubbles:true}));`);
 assert.equal(await run(`document.querySelector('#configSections [data-module-id="nginx"] .module-review-checkbox').checked`),false);
 const {dialog}=require('electron'),old=dialog.showOpenDialog;
 try{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[__dirname]});
  await run(`document.getElementById('generatedBundleSaveBtn').click()`);
  await until(`document.getElementById('generatedSaveStatus').textContent.includes('生成ファイル一式を保存しました')`);
  const saved=path.join(__dirname,'web-ui-test');assert.equal(fs.statSync(saved).isDirectory(),true);
  const files=await run(`window.GeneratedFiles.all().map(f=>({relativePath:f.relativePath,content:f.content}))`);
  for(const file of files)assert.equal(fs.readFileSync(path.join(saved,file.relativePath),'utf8'),file.content);
  assert.equal(fs.readFileSync(path.join(saved,'docker-compose.yml'),'utf8'),await run(`document.getElementById('composeOutput').value`));
  assert.equal(fs.existsSync(path.join(saved,'nginx/html/setting.html')),false);
  assert.equal(await run(`window.electronAPI.saveGeneratedBundle([{relativePath:'../index.html',content:'bad'}]).then(()=>false,()=>true)`),true);
  dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
  assert.deepEqual(await run(`window.electronAPI.saveGeneratedBundle([{relativePath:'index.html',content:'x'}],'web-ui-test')`),{canceled:true});
 }finally{dialog.showOpenDialog=old;}
 const screenshots=path.join(process.env.DOCKER_BUILDER_SOURCE_ROOT,'release/web-support-ui');fs.mkdirSync(screenshots,{recursive:true});
 win.setContentSize(1280,720);
 await run(`document.querySelector('[data-tab="config"]').click();const section=document.querySelector('#configSections [data-module-id="nginx"]');if(section.querySelector('.module-panel-toggle').getAttribute('aria-expanded')!=='true')section.querySelector('.module-panel-toggle').click();section.querySelector('.module-advanced-settings').open=true;section.querySelector('.module-advanced-settings').scrollIntoView({block:'center'});`);
 for(const theme of ['system','light','dark','blue','green','yellow','orange','red','pink']){
  await run(`window.__rendererCore.applyTheme(${JSON.stringify(theme)});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`),true);
  if(['light','dark'].includes(theme))fs.writeFileSync(path.join(screenshots,'advanced-'+theme+'.png'),(await wc.capturePage()).toPNG());
 }
 await run(`window.__rendererCore.applyTheme('dark')`);
 await run(`document.querySelectorAll('.module-row.is-selected').forEach(e=>e.click())`);
 console.log('PASS Web advanced fields, HTTP-only target list, proxy output, review invalidation, real bundle-save IPC/contents and traversal rejection (OS directory dialog stubbed)');
};

const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{setTimeout:delay}=require('node:timers/promises');app.setPath('userData',path.join(__dirname,'profile'));app.setPath('sessionData',path.join(__dirname,'session'));require('./main');
setTimeout(()=>{console.error('Advanced UI test timeout');app.exit(1)},45000).unref();
(async()=>{
 await app.whenReady();const win=BrowserWindow.getAllWindows()[0],wc=win.webContents;wc.setBackgroundThrottling(false);win.setContentSize(1280,900);const run=s=>wc.executeJavaScript(s,true);const until=async s=>{for(let i=0;i<100;i++){if(await run(s))return;await delay(50);}throw new Error('Timed out '+s);};
 await until('document.querySelectorAll(".module-row").length===19');const root=process.env.MANUAL_SOURCE_ROOT;
 const ids=['nginx-nodejs-postgresql-redis','nginx-flask-postgresql-redis','nginx-wordpress-mariadb-admin'];const results=[];
 for(const recipe of require(path.join(root,'tools/manual/recipe-inputs.json')).filter(r=>ids.includes(r.id))){
  await run('window.__rendererUI.resetConfiguration();document.querySelector("[data-tab=modules]").click()');
  for(const id of recipe.modules)await run(`document.querySelector('.module-row[data-module-id="${id}"]').click()`);
  await run(`document.querySelector('[data-tab=config]').click();document.getElementById('projectNameInput').value=${JSON.stringify(recipe.projectName)};document.getElementById('projectNameInput').dispatchEvent(new Event('input',{bubbles:true}));`);
  for(const [id,fields]of Object.entries(recipe.configs))for(const [name,value]of Object.entries(fields)){
   await run(`(()=>{const section=document.querySelector('#configSections section[data-module-id="${id}"]');const input=section.querySelector('input[data-field-name="${name}"],select[data-field-name="${name}"]');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('change',{bubbles:true}));if(${JSON.stringify(name)}==='framework'){const toggle=section.querySelector('.framework-toggle-checkbox');toggle.checked=${JSON.stringify(value)}==='flask';toggle.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  }
  await run('document.querySelectorAll(".module-review-checkbox").forEach(check=>{if(!check.checked)check.click();})');assert.equal(await run('document.getElementById("generateButton").disabled'),false);
  await run('document.getElementById("generateButton").click()');await until('!!document.getElementById("composeOutput").value');
  const dir=path.join(root,'docs/manual/examples',recipe.id,'generated');assert.equal(await run('document.getElementById("composeOutput").value'),fs.readFileSync(path.join(dir,'docker-compose.yml'),'utf8'));
  const files=await run('Array.from(document.getElementById("generatedFileSelect").options,o=>({relativePath:o.textContent}))');
  for(let i=0;i<files.length;i++){
   await run(`document.getElementById('generatedFileSelect').value='${i}';document.getElementById('generatedFileSelect').dispatchEvent(new Event('change'))`);
   assert.equal(await run('document.getElementById("dockerfileOutput").value'),fs.readFileSync(path.join(dir,files[i].relativePath),'utf8'));
  }
  results.push({id:recipe.id,composeEqual:true,filesEqual:true,dockerExecuted:false});console.log('PASS actual Electron UI generation',recipe.id);
 }
 fs.writeFileSync(path.join(root,'tools/manual/qa/advanced-ui-result.json'),JSON.stringify(results,null,2));app.exit(0);
})().catch(e=>{console.error(e);app.exit(1)});

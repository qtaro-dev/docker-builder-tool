// 既存生成試験の前提として、入力後に実UIの「設定確認」を明示操作する。
// 実Electron画面の入力・ボタンとヘッドレス生成を照合。保存先選択だけOS境界で置換する。
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {dialog}=require('electron');
module.exports=async({run,until,wc})=>{
  const {cases,generateCase}=require(path.join(process.env.DOCKER_BUILDER_SOURCE_ROOT,'scripts/lib/headless-generation.cjs'));
  const nativeSave=dialog.showSaveDialog;
  const records=[];
  try {
    for(const definition of cases){
      const projectName='manual-'+definition.id;
      const expected=generateCase(definition.id,projectName);
      await run("window.__rendererUI.resetConfiguration(); document.querySelector('[data-tab=modules]').click()");
      for(const id of definition.modules) await run(`document.querySelector('.module-row[data-module-id="${id}"]').click()`);
      await run(`document.querySelector('[data-tab=config]').click();document.getElementById('projectNameInput').value=${JSON.stringify(projectName)}`);
      for(const [id,fields] of Object.entries(definition.config))for(const [name,value] of Object.entries(fields)){
        await run(`(()=>{const section=document.querySelector('section.card[data-module-id="${id}"]');const input=section.querySelector('input[data-field-name="${name}"],select[data-field-name="${name}"]');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('change'));if(${JSON.stringify(name)}==='framework'){const toggle=section.querySelector('.framework-toggle-checkbox');toggle.checked=${JSON.stringify(value)}==='flask';toggle.dispatchEvent(new Event('change'));}})()`);
      }
      await run("window.__testConfirmModules(); document.getElementById('generateButton').click();document.querySelector('[data-tab=output]').click()");
      assert.equal(await run("document.getElementById('composeOutput').value"),expected.compose,definition.id+' UI/headless Compose equality');
      const directory=path.join(__dirname,'manual-exports',definition.id);fs.mkdirSync(directory,{recursive:true});
      dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(directory,'docker-compose.yml')});
      await run("document.getElementById('composeDownloadBtn').click()");
      await until(`document.getElementById('generatedSaveStatus').textContent.includes(${JSON.stringify(path.join(directory,'docker-compose.yml'))})`);
      assert.equal(fs.readFileSync(path.join(directory,'docker-compose.yml'),'utf8'),expected.compose);
      for(let index=0;index<expected.model.files.length;index++){
        const file=expected.model.files[index];const target=path.join(directory,file.relativePath);fs.mkdirSync(path.dirname(target),{recursive:true});
        await run(`document.getElementById('generatedFileSelect').value='${index}';document.getElementById('generatedFileSelect').dispatchEvent(new Event('change'))`);
        assert.equal(await run("document.getElementById('dockerfileOutput').value"),file.content);
        dialog.showSaveDialog=async()=>({canceled:false,filePath:target});
        await run("document.getElementById('dockerfileDownloadBtn').click()");
        await until(`document.getElementById('generatedSaveStatus').textContent.includes(${JSON.stringify(target)})`);
        assert.equal(fs.readFileSync(target,'utf8'),file.content);
      }
      records.push({case:definition.id,projectName,composeEqual:true,files:expected.model.files.map(f=>f.relativePath),images:expected.model.images.map(e=>({module:e.moduleId,image:e.image,series:e.series,variant:e.variant})),
        inputs:await run("[...document.querySelectorAll('#configSections [data-field-name]')].filter(e=>e.matches('input,select')).map(e=>({module:e.dataset.moduleId,field:e.dataset.fieldName,value:e.value}))")});
      if(process.env.DOCKER_BUILDER_SCREENSHOT_DIR){
        await run("document.querySelector('[data-tab=config]').click();window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
        fs.writeFileSync(path.join(process.env.DOCKER_BUILDER_SCREENSHOT_DIR,'manual-'+definition.id+'.png'),(await wc.capturePage()).toPNG());
      }
    }
    if(process.env.DOCKER_BUILDER_SCREENSHOT_DIR)fs.writeFileSync(path.join(process.env.DOCKER_BUILDER_SCREENSHOT_DIR,'manual-ui-evidence.json'),JSON.stringify(records,null,2));
  } finally {dialog.showSaveDialog=nativeSave;}
  console.log('PASS six real Electron UI workflows: exact Compose/Dockerfile equality, input settings and real local save IPC (OS destination dialog stubbed)');
};

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({run,until})=>{
 const {dialog}=require('electron'),originalOpen=dialog.showOpenDialog,originalMessage=dialog.showMessageBox;
 const parent=path.join(__dirname,'bundle-folder-tests');fs.mkdirSync(parent);
 await run(`(async()=>{document.querySelectorAll('.module-row.is-selected').forEach(e=>e.click());['nginx','nodejs'].forEach(id=>document.querySelector('.module-row[data-module-id="'+id+'"]').click());window.__rendererModulesUI.renderConfigSections(true);document.getElementById('projectNameInput').value='myapp';window.__testConfirmModules();await window.__rendererGenerate.generateConfigs();})()`);
 const click=async()=>{await run(`document.getElementById('generatedSaveStatus').textContent='';document.getElementById('generatedBundleSaveBtn').click()`);await until(`!document.getElementById('generatedBundleSaveBtn').disabled`);return run(`document.getElementById('generatedSaveStatus').textContent`);};
 try{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[parent]});
  dialog.showMessageBox=async()=>{throw Error('Unexpected confirmation for a new folder');};
  const root=path.join(parent,'myapp');assert.ok((await click()).includes(root));
  const compose=await run(`document.getElementById('composeOutput').value`),files=await run(`window.GeneratedFiles.all().map(f=>({relativePath:f.relativePath,content:f.content}))`);
  for(const f of files)assert.equal(fs.readFileSync(path.join(root,f.relativePath),'utf8'),f.content);
  assert.ok(fs.existsSync(path.join(root,'nginx/conf/default.conf')));assert.ok(fs.existsSync(path.join(root,'nodejs/Dockerfile.nodejs')));
  fs.writeFileSync(path.join(root,'nodejs/server.cjs'),'USER SOURCE - KEEP');fs.writeFileSync(path.join(root,'docker-compose.yml'),'OLD COMPOSE');
  let calls=0;
  dialog.showMessageBox=async(_window,options)=>{calls++;assert.deepEqual(options.buttons,['既存フォルダに保存','別名で保存','キャンセル']);return {response:2};};
  assert.match(await click(),/キャンセル/);assert.equal(calls,1);assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'OLD COMPOSE');
  fs.mkdirSync(path.join(parent,'myapp-2'));
  dialog.showMessageBox=async(_window,options)=>{assert.ok(options.detail.includes(path.join(parent,'myapp-3')));return {response:1};};
  assert.ok((await click()).includes(path.join(parent,'myapp-3')));assert.equal(fs.readFileSync(path.join(parent,'myapp-3/docker-compose.yml'),'utf8'),compose);
  calls=0;
  dialog.showMessageBox=async(_window,options)=>{if(++calls===1)return {response:0};assert.ok(options.detail.includes('上書き対象'));assert.ok(options.detail.includes('docker-compose.yml'));assert.ok(options.detail.includes('nginx/conf/default.conf'));assert.ok(!options.detail.includes('server.cjs'));return {response:1};};
  assert.match(await click(),/キャンセル/);assert.equal(calls,2);assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'OLD COMPOSE');
  dialog.showMessageBox=async()=>({response:0});
  assert.ok((await click()).includes(root));assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),compose);assert.equal(fs.readFileSync(path.join(root,'nodejs/server.cjs'),'utf8'),'USER SOURCE - KEEP');
  await run(`document.getElementById('projectNameInput').value='con'`);
  assert.match(await click(),/保存に失敗しました.*使用できない/);assert.equal(fs.existsSync(path.join(parent,'con')),false);
 }finally{dialog.showOpenDialog=originalOpen;dialog.showMessageBox=originalMessage;await run(`document.getElementById('projectNameInput').value='myapp'`);}
 console.log('PASS named myapp bundle folder, exact Nginx/Node structure, collision/overwrite confirmations, myapp-3 alternative, cancellation, source preservation and invalid-name error (native dialogs stubbed)');
};

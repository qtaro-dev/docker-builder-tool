// OSブラウザ境界だけをスタブし、本物のメニュー・固定パス・失敗通知を確認する。
const {Menu,shell,dialog}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {setTimeout:delay}=require('node:timers/promises');
module.exports=async({run,until,wc})=>{
  const external=shell.openExternal,errorBox=dialog.showErrorBox,opened=[],errors=[];
  const waitFor=async condition=>{for(let i=0;i<100&&!condition();i++)await delay(20);assert.ok(condition(),'Native menu callback completed');};
  try {
    shell.openExternal=async url=>{opened.push(url);};dialog.showErrorBox=(...args)=>errors.push(args);
    const help=Menu.getApplicationMenu().items.find(item=>item.label==='ヘルプ');
    const item=help.submenu.items.find(item=>item.label==='ユーザーマニュアル');assert.ok(item);
    const before=wc.getURL();await item.click();
    await waitFor(()=>opened.length===1);
    assert.deepEqual(opened,[pathToFileURL(path.join(__dirname,'docs/manual/index.html')).href]);assert.equal(wc.getURL(),before);
    assert.ok(fs.existsSync(path.join(__dirname,'docs/manual/recipes.html')));
    assert.equal(await run('typeof window.electronAPI.openUserManual'),'undefined','No arbitrary URL/path IPC');
    shell.openExternal=async()=>{throw new Error('simulated browser failure');};await item.click();
    await waitFor(()=>errors.length===1);
    assert.equal(errors.length,1);assert.match(errors[0][0],/マニュアルを開けませんでした/);
    assert.equal(await run('window.electronAPI.getVersion()'),'0.3.0');
    await until('document.title==="Docker Builder Tool 0.3.0 Release 1"');
    console.log('PASS real Help menu, fixed manual file URL, opener failure dialog, SemVer/display separation and window title');
  }finally{shell.openExternal=external;dialog.showErrorBox=errorBox;}
};

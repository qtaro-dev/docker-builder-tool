// 既存アプリの隔離コピーで、新しい構成例のUI生成を検証する。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),tmpRoot=fs.realpathSync.native(os.tmpdir()),tmp=fs.mkdtempSync(path.join(tmpRoot,'dbt-advanced-'));
try{
 for(const name of ['main.js','preload.js','security.js','image-catalog.js','app-info.js','app-paths.js','user-manual.js','package.json','app'])fs.cpSync(path.join(root,name),path.join(tmp,name),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'capture-advanced-ui.cjs'),path.join(tmp,'capture-advanced-ui.cjs'));
 const p=JSON.parse(fs.readFileSync(path.join(tmp,'package.json'),'utf8'));p.main='capture-advanced-ui.cjs';fs.writeFileSync(path.join(tmp,'package.json'),JSON.stringify(p));
 const env={...process.env,MANUAL_SOURCE_ROOT:root};delete env.ELECTRON_RUN_AS_NODE;
 const result=spawnSync(require(path.join(root,'node_modules/electron')),[tmp],{env,stdio:'inherit',timeout:60000});if(result.error)throw result.error;process.exitCode=result.status===0?0:1;
}finally{if(path.dirname(tmp)!==tmpRoot||!path.basename(tmp).startsWith('dbt-advanced-'))throw new Error('Unsafe temporary path');fs.rmSync(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:200});}

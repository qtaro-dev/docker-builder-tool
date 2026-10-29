// 本体生成物を専用プロジェクトで起動し、自身のコンテナ・ネットワーク・ボリュームだけ削除する。
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {loadModules}=require('./lib/headless-generation.cjs'),generation=require('../app/src/project-generation'),{renderComposeYaml}=require('../app/src/compose-serialization'),catalog=require('../app/data/image-catalog.json');
const root=path.resolve(__dirname,'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'0.0.0.0',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});
async function run(){
 const dest=fs.mkdtempSync(path.join(root,'release/web-support-')),results=[],token=crypto.randomBytes(4).toString('hex');
 for(const [web,proxy,bind,proxyPath='/api/'] of [['nginx',false,false],['apache',false,false],['nginx',true,false],['apache',true,false],['nginx',false,true],['apache',false,true],['nginx',true,false,'/'],['apache',true,false,'/']]){
  const name=web+(proxy?(proxyPath==='/'?'-proxy-root':'-proxy'):bind?'-bind':'-static'),dir=path.join(dest,name),project='dbt-web-'+token+'-'+name;fs.mkdirSync(dir);
  const row={name,project,outcome:'FAIL',steps:[]};results.push(row);let attempted=false;
  const docker=(args,label,required=true,timeout=120000)=>{const p=spawnSync('docker',['--context','desktop-linux',...args],{cwd:dir,encoding:'utf8',windowsHide:true,timeout,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(dir,label+'.log'),(p.stdout||'')+'\n'+(p.stderr||'')+'\nexit='+p.status+'\n'+(p.error?.message||''));row.steps.push({label,exit:p.status});console.log(name+' '+label+': '+p.status);if(required)assert.equal(p.status,0,label);return p;};
  const compose=(args,label,required=true,timeout)=>docker(['compose','-p',project,'-f',path.join(dir,'docker-compose.yml'),...args],label,required,timeout);
  try{
   row.port=await freePort();const nodePort=await freePort(),modules=loadModules().filter(m=>m.id===web||proxy&&m.id==='nodejs');
   const configs=new Map(modules.map(m=>[m.id,Object.fromEntries(m.fields.map(f=>[f.name,f.default??'']))]));
   Object.assign(configs.get(web),{[web==='nginx'?'hostPort':'port']:row.port,reverseProxy:proxy?'on':'off',proxyTarget:proxy?'nodejs':'',proxyPath,...(bind?{dataStoreType:'bind',dataStorePath:'./public'}:{})});if(proxy)configs.get('nodejs').hostPort=nodePort;
   const model=generation.build({modules,configs,catalog,projectName:project});assert.deepEqual(model.errors,[]);row.images=model.images.map(i=>i.image);
   for(const f of [{relativePath:'docker-compose.yml',content:renderComposeYaml(model)},...model.files]){const target=path.join(dir,f.relativePath);assert.ok(target.startsWith(dir+path.sep));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,f.content);}
   if(proxy)for(const f of ['package.json','package-lock.json','server.cjs'])fs.copyFileSync(path.join(root,'test/fixtures/node-validation',f),path.join(dir,'nodejs',f));
   row.generation='PASS';assert.equal(docker(['ps','-a','--filter','label=com.docker.compose.project='+project,'-q'],'precheck').stdout.trim(),'');
   compose(['config','-q'],'config');compose(['pull','--ignore-buildable'],'pull',true,300000);compose(['build'],'build',true,600000);attempted=true;compose(['up','-d'],'up');
   const http=async(route,expected)=>{for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:'+row.port+route,{signal:AbortSignal.timeout(3000)}),body=await r.text();assert.equal(r.status,200);assert.ok(body.includes(expected));return {status:r.status,body};}catch(e){if(i===39)throw e;await pause(1000);}}};
   row.initialPage=await http('/',proxy&&proxyPath==='/'?'docker-builder-ci':'構築完了テストページ');if(proxy)row.proxy=await http(proxyPath,'docker-builder-ci');
   const privatePage=await fetch('http://127.0.0.1:'+row.port+'/setting.html');assert.ok([403,404].includes(privatePage.status));row.privatePageStatus=privatePage.status;
   const setting=fs.readFileSync(path.join(dir,web,'setting.html'),'utf8');assert.ok(setting.includes(String(row.port)));assert.ok(setting.includes(proxy?'有効':'無効'));row.setting='PASS';
   compose(['ps','--all','--format','json'],'ps');compose(['logs','--no-color','--timestamps'],'logs');row.outcome='PASS';
  }catch(e){row.error=e.stack;console.error(row.error);if(attempted)compose(['logs','--no-color','--tail','100'],'failure-logs',false);}
  finally{
   if(attempted){const down=compose(['down','-v','--remove-orphans'],'down',false),remaining=['container','network','volume'].map((kind)=>docker(kind==='container'?['ps','-a','--filter','label=com.docker.compose.project='+project,'-q']:[kind,'ls','--filter','label=com.docker.compose.project='+project,'-q'],'remaining-'+kind,false));row.cleanup=down.status===0&&remaining.every(p=>p.status===0&&!p.stdout.trim());if(!row.cleanup)row.outcome='FAIL';}else row.cleanup='No up attempted';
   fs.writeFileSync(path.join(dest,'results.json'),JSON.stringify(results,null,2));
  }
 }
 console.log(dest);console.log(results.map(r=>r.name+': '+r.outcome).join('\n'));if(results.some(r=>r.outcome!=='PASS'))process.exitCode=1;
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});module.exports={run};

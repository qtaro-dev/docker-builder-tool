// サンプルのキャッシュ制御だけを、DB/Redisの代役で検証する。Dockerの実動作試験ではない。
const assert=require('node:assert/strict');const path=require('node:path'),fs=require('node:fs'),yaml=require('js-yaml');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/manual/examples');
const {createHandler}=require(path.join(base,'nginx-nodejs-postgresql-redis/additions/nodejs/server.cjs'));
(async()=>{
 let value=42,dbDown=false,cacheDown=false,time=0;const store=new Map();
 const db={query:async(sql,args)=>{if(dbDown)throw new Error('private-secret-must-not-leak');if(sql.startsWith('INSERT')){value=args[1];return {rows:[]};}return {rows:[{value}]};}};
 const cache={get:async key=>{if(cacheDown)throw new Error('private-secret-must-not-leak');const item=store.get(key);return item&&item.until>time?item.value:null;},set:async(key,data,opt)=>{if(cacheDown)throw new Error('cache');assert.equal(opt.EX,10);store.set(key,{value:data,until:time+opt.EX*1000});},del:async key=>{if(cacheDown)throw new Error('cache');store.delete(key);},ping:async()=>{if(cacheDown)throw new Error('cache');return 'PONG';}};
 const handler=createHandler({db,cache});
 const request=async(method,url,body)=>{let status,result;const req={method,url,async *[Symbol.asyncIterator](){yield typeof body==='string'?body:JSON.stringify(body);}};await handler(req,{writeHead:s=>status=s,end:text=>result=JSON.parse(text)});assert.ok(!JSON.stringify(result).includes('private-secret'));return {status,...result};};
 assert.deepEqual(await request('GET','/value'),{status:200,value:42,source:'database',cache:'available'});
 assert.equal((await request('GET','/value')).source,'cache');time=11000;assert.equal((await request('GET','/value')).source,'database');
 assert.deepEqual(await request('POST','/value',{value:43}),{status:200,value:43,cache:'invalidated'});
 assert.equal((await request('GET','/value')).value,43);
 assert.equal((await request('POST','/value',{value:true})).status,400);assert.equal(value,43);
 assert.equal((await request('POST','/value','{bad')).status,400);
 assert.equal((await request('POST','/value',{value:'42;drop table'})).status,400);assert.equal(value,43);
 cacheDown=true;assert.deepEqual(await request('GET','/value'),{status:200,value:43,source:'database',cache:'unavailable'});
 assert.equal((await request('POST','/value',{value:44})).cache,'invalidation-failed');assert.equal(value,44);assert.equal((await request('GET','/health')).status,503);
 cacheDown=false;store.clear();dbDown=true;assert.equal((await request('GET','/value')).status,503);
 dbDown=false;assert.equal((await request('GET','/health')).ok,true);
 const catalog=require('./recipe-inputs.json');
 for(const recipe of catalog.filter(r=>r.level==='上級'&&r.modules.length===4)){
  const generated=yaml.load(fs.readFileSync(path.join(base,recipe.id,'generated/docker-compose.yml'),'utf8'));
  const overlay=yaml.load(fs.readFileSync(path.join(base,recipe.id,'additions/compose.manual.yml'),'utf8'));
  for(const [name,service]of Object.entries(overlay.services)){
   assert.ok(generated.services[name],recipe.id+' override service');
   for(const volume of service.volumes||[]){const host=volume.split(':')[0];assert.ok(fs.existsSync(path.join(base,recipe.id,'additions',host)),recipe.id+' '+host);}
   for(const dependency of Object.keys(service.depends_on||{}))assert.ok(generated.services[dependency],dependency);
   for(const [key,host]of Object.entries(service.environment||{})){
    if(key==='DB_HOST')assert.ok(generated.services[host],host);
    if(key==='REDIS_URL')assert.ok(generated.services[new URL(host).hostname],host);
   }
  }
  for(const service of Object.values(generated.services))if(service.build){assert.ok(fs.existsSync(path.join(base,recipe.id,'generated',service.build.context,service.build.dockerfile)));}
 }
 fs.writeFileSync(path.join(__dirname,'qa/advanced-result.json'),JSON.stringify({nodeSampleControlTests:true,composeReferences:true,externalDependenciesInstalled:false,dockerExecuted:false},null,2));
 console.log('PASS Node sample: miss/hit/TTL/update/invalidation/fallback/health/input bounds/no secret leak; all advanced Compose references');
})().catch(e=>{console.error(e);process.exitCode=1;});

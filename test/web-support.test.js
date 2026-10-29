const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadModules}=require('../scripts/lib/headless-generation.cjs');
const generation=require('../app/src/project-generation');
const catalog=require('../app/data/image-catalog.json');
const {validateGeneratedFiles}=require('../security');
const all=loadModules();
function generate(ids,overrides={}){const modules=all.filter(m=>ids.includes(m.id));const configs=new Map(modules.map(m=>[m.id,{...Object.fromEntries(m.fields.map(f=>[f.name,f.default??''])),...overrides[m.id]}]));return generation.build({modules,configs,catalog,projectName:'web-test'});}
test('both Web servers generate seeded named volumes, private metadata and restricted build context',()=>{
 for(const id of ['nginx','apache']){const model=generate([id]);assert.deepEqual(model.errors,[]);const svc=model.services[0];assert.ok(svc.build);assert.equal(svc.volumes.length,2);assert.equal(model.volumes.size,1);const index=model.files.find(f=>f.relativePath===id+'/html/index.html');assert.match(index.content,/構築完了テストページ/);const setting=model.files.find(f=>f.relativePath===id+'/setting.html');assert.match(setting.content,/外部公開しないでください/);assert.match(setting.content,/無効/);assert.ok(model.files.find(f=>f.filename==='Dockerfile.'+id+'.dockerignore').content.includes('!html/index.html'));assert.equal(model.files.length,5);validateGeneratedFiles([{relativePath:'docker-compose.yml',content:'x'},...model.files]);}
});
test('proxy only permits selected HTTP targets, validates path/protocol and uses internal service ports',()=>{
 for(const id of ['nginx','apache']){
  const on={reverseProxy:'on',proxyTarget:'nodejs',proxyPath:'/api/'};
  const model=generate([id,'nodejs'],{[id]:on,nodejs:{hostPort:34567}});assert.deepEqual(model.errors,[]);const conf=model.files.find(f=>f.filename.endsWith('.conf'));assert.match(conf.content,/web-test-nodejs:3000\//);assert.doesNotMatch(conf.content,/34567/);assert.deepEqual(model.services.find(s=>s.name==='web-test-'+id).depends_on,['web-test-nodejs']);
  for(const target of ['mysql','nodejs','', 'http://example.com'])assert.ok(generate([id,'mysql'],{[id]:{...on,proxyTarget:target}}).errors.length);
  for(const proxyPath of ['','/api','/../','/a;return 200;/','/setting.html/','//','/api/?x'])assert.ok(generate([id,'nodejs'],{[id]:{...on,proxyPath}}).errors.length,proxyPath);
  assert.ok(generate([id,'nodejs'],{[id]:{...on,[id==='nginx'?'hostPortProtocol':'portProtocol']:'udp'}}).errors.length);
 }
 const flask=generate(['nginx','python-web'],{nginx:{reverseProxy:'on',proxyTarget:'python-web',proxyPath:'/'},'python-web':{framework:'flask'}});assert.deepEqual(flask.errors,[]);assert.match(flask.files.find(f=>f.filename==='default.conf').content,/:5000\//);
});
test('static bind paths and private metadata remain separate; source values cannot inject or reveal secrets',()=>{
 const model=generate(['nginx','mysql'],{nginx:{dataStoreType:'bind',dataStorePath:'./public'},mysql:{password:'do-not-output-secret',rootPassword:'root-private-value'}});
 assert.deepEqual(model.errors,[]);assert.equal(model.services[0].build,undefined);assert.ok(model.files.some(f=>f.relativePath==='public/index.html'));
 const setting=model.files.find(f=>f.filename==='setting.html').content;assert.doesNotMatch(setting,/do-not-output-secret|root-private-value|MYSQL_PASSWORD/);assert.match(setting,/mysql/i);
 assert.ok(generate(['nginx'],{nginx:{dataStoreType:'bind',dataStorePath:'./nginx'}}).errors.length);
 assert.ok(generate(['nginx'],{nginx:{dataStoreType:'bind',dataStorePath:'.'}}).errors.length);
 const external=generate(['nginx'],{nginx:{dataStoreType:'bind',dataStorePath:'C:/external-web'}});assert.deepEqual(external.errors,[]);assert.ok(external.notes.some(n=>n.includes('未配置')));
 assert.ok(generate(['nginx','apache'],{nginx:{dataStoreType:'bind',dataStorePath:'./same'},apache:{dataStoreType:'bind',dataStorePath:'./same'}}).errors.length);
});
test('bundle IPC validation rejects traversal, executable files, duplicates and oversized payloads',()=>{
 for(const relativePath of ['../index.html','/index.html','C:/index.html','a\\index.html','a/CON.html','a./index.html','app.exe','a/.env','a/index.html:stream'])assert.throws(()=>validateGeneratedFiles([{relativePath,content:'x'}]),relativePath);
 assert.throws(()=>validateGeneratedFiles([{relativePath:'a/index.html',content:'x'},{relativePath:'A/index.html',content:'y'}]));
 assert.throws(()=>validateGeneratedFiles([{relativePath:'index.html',content:'x'.repeat(2097153)}]));
 assert.equal(validateGeneratedFiles([{relativePath:'nginx/conf/default.conf',content:'server {}'}]).length,1);
});

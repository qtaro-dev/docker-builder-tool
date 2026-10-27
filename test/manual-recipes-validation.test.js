// このファイルの実行器は全て模擬。Dockerを呼び出したと誤認させない。
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const plan=require('../scripts/lib/manual-recipe-plan.cjs');
const {run,merge,save,markdown,ownedArgs,cleanup}=require('../scripts/manual-recipes-validation.cjs');
const {portOf,envOf,http}=require('../scripts/lib/manual-recipe-probes.cjs');
async function temporary(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbtm-unit-'));
  try{return await fn(dir);}finally{
    // 模擬dockerモードが作った作業ディレクトリも所有接頭辞を照合して掃除する。
    for(const p of find(dir,'workspace.txt')) {
      const work=fs.readFileSync(p,'utf8');assert.equal(path.dirname(work),path.resolve(os.tmpdir()));assert.ok(path.basename(work).startsWith('dbtm-work-'));
      fs.rmSync(work,{recursive:true,force:true});
    }
    assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});
  }
}
function find(dir,name) {return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?find(path.join(dir,e.name),name):e.name===name?[path.join(dir,e.name)]:[]);}
const fakeCommand=()=>({stdout:''});
function simulatedSuccess({record:r}) {Object.assign(r,{status:'OK',preparation:'PASS',compose:'PASS',pull:'PASS',build:'PASS',up:'PASS',response:'PASS',evidence:['SIMULATED UNIT TEST, not real Docker']});}
test('manual recipe list has no duplicates; every entry belongs to exactly one group of at most six',()=>{
  const all=plan.batches().flatMap(b=>b.recipes.map(r=>r.id));
  assert.deepEqual(all,plan.recipes.map(r=>r.id));assert.equal(new Set(all).size,all.length);
  assert.ok(plan.batches().every(b=>b.recipes.length>0&&b.recipes.length<=6));assert.throws(()=>plan.batch(0));assert.throws(()=>plan.batch(99));
  for(const r of plan.recipes) assert.ok(fs.existsSync(path.join(plan.root,'docs/manual/examples',r.id,'generated/docker-compose.yml')));
});
test('all recipe groups regenerate actual application output; static verification never checks OK',()=>temporary(async dir=>{
  const seen=[];
  for(const b of plan.batches()) {
    const rows=await run({batch:b.batch,destination:path.join(dir,String(b.batch)),commandExecutor:()=>{throw new Error('Docker must not run');}});
    for(const r of rows.filter(r=>r.batch===b.batch)) {
      assert.equal(r.generation,'PASS');assert.equal(r.status,'STATIC_ONLY');assert.equal(r.up,'NOT_RUN');seen.push(r.id);
    }
  }
  assert.equal(seen.length,plan.recipes.length);
}));
test('simulated batches retain success records and isolate all recipe projects',()=>temporary(async dir=>{
  const directories=[],projects=new Set(),order=[];
  for(const b of plan.batches()) {
    const output=path.join(dir,'batch-'+b.batch);directories.push(output);
    await run({mode:'docker',batch:b.batch,destination:output,commandExecutor:fakeCommand,
      executor:context=>{order.push('run');assert.ok(!projects.has(context.project));projects.add(context.project);simulatedSuccess(context);},
      cleanupExecutor:()=>order.push('cleanup'),
    });
  }
  assert.ok(order.every((s,i)=>s===(i%2?'cleanup':'run')));
  const merged=merge(directories);assert.equal(merged.length,plan.recipes.length);
  assert.ok(merged.every(r=>r.status==='OK'&&r.cleanup==='PASS'));
  assert.match(markdown(merged,'SIMULATED'),/\[x\] OK/);
  assert.equal(projects.size,plan.recipes.length);
}));
test('simulated failure cleans up and continues; cleanup failure removes OK; missing batches stay NOT_RUN',()=>temporary(async dir=>{
  let attempt=0,cleanups=0;
  const rows=await run({mode:'docker',batch:1,destination:dir,commandExecutor:fakeCommand,
    executor:context=>{attempt++;if(attempt===1)throw new Error('SIMULATED build failure');simulatedSuccess(context);},
    cleanupExecutor:()=>{cleanups++;if(cleanups===2)throw new Error('SIMULATED cleanup failure');},
  });
  assert.equal(attempt,6);assert.equal(cleanups,6);assert.equal(rows[0].status,'FAIL');assert.equal(rows[1].status,'FAIL');assert.equal(rows[1].cleanup,'FAIL');assert.equal(rows[2].status,'OK');
  const merged=merge([dir]);assert.ok(merged.slice(6).every(r=>r.status==='NOT_RUN'));
  assert.throws(()=>merge([dir,dir]),/Duplicate/);
  save(dir,rows,'static');assert.throws(()=>merge([dir]),/Static/);
}));
test('incomplete proof cannot be merged into an OK checkbox',()=>temporary(dir=>{
  const rows=require('../scripts/manual-recipes-validation.cjs').initial();rows[0].status='OK';
  save(dir,rows,'docker');assert.throws(()=>merge([dir]),/Incomplete OK/);
}));
test('cleanup is restricted to owned main/restore projects; changed Compose is refused',()=>temporary(dir=>{
  const file=path.join(dir,'docker-compose.yml');fs.writeFileSync(file,'services: {}');
  const owned={directory:dir,project:'dbtm-012345abcdef-1-main',restore:'dbtm-012345abcdef-1-restore',restoreUsed:true,lockContainer:'dbtm-012345abcdef-1-main-lock',composeFiles:[{name:'docker-compose.yml',sha256:require('node:crypto').createHash('sha256').update('services: {}').digest('hex')}],emptyEnv:path.join(dir,'empty.env'),config:dir,log:path.join(dir,'cleanup.log')};
  const calls=[];cleanup(owned,(_exe,args)=>{calls.push(args);return {stdout:''};});
  assert.equal(calls.filter(args=>args.includes('down')).length,2);assert.ok(calls.every(a=>!a.includes('prune')));
  assert.throws(()=>ownedArgs(owned,'other-project'));
  fs.writeFileSync(file,'changed');assert.throws(()=>ownedArgs(owned),/Changed/);
}));
test('runtime probes resolve actual ports and environment; HTTP refuses redirects/external paths',async()=>{
  assert.equal(portOf({ports:['19080:80']},80),19080);assert.throws(()=>portOf({ports:[]},80));
  assert.equal(portOf({ports:[{target:80,published:'19080',protocol:'tcp'}]},80),19080);
  assert.deepEqual(envOf({environment:['DB=a=b']}),{DB:'a=b'});
  await assert.rejects(()=>http(80,'//example.com'));
});
test('actual loopback HTTP probe checks the distributed Node fixture response (no Docker)',async()=>{
  const httpServer=require('node:http'),vm=require('node:vm');let handler;
  const source=fs.readFileSync(path.join(plan.root,'docs/manual/examples/nodejs-basic/additions/nodejs/server.cjs'),'utf8');
  vm.runInNewContext(source,{require:name=>{assert.equal(name,'node:http');return {createServer:fn=>{handler=fn;return {listen:()=>{}};}};}});
  const server=httpServer.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:'https://example.invalid/'});res.end();}else handler(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const p=server.address().port;
    const result=await require('../scripts/lib/manual-recipe-probes.cjs').probe({recipe:{id:'nodejs-basic',modules:['nodejs']},services:{'manual-nodejs-nodejs':{ports:[{target:3000,published:String(p)}]}},compose:()=>({stdout:'[{"Service":"manual-nodejs-nodejs","State":"running"}]'})});
    assert.deepEqual(result.evidence,['nodejs HTTP/dependency response']);
    await assert.rejects(()=>http(p,'/redirect'),/302/);
  } finally {await new Promise(r=>server.close(r));}
});
test('one downloaded batch extracted at artifact root is merged; missing batches remain unchecked',()=>temporary(dir=>{
  const rows=require('../scripts/manual-recipes-validation.cjs').initial();
  for(const r of rows.slice(0,6)) Object.assign(r,{status:'OK',generation:'PASS',preparation:'PASS',compose:'PASS',pull:'PASS',build:'N/A',up:'PASS',response:'PASS',cleanup:'PASS',evidence:['SIMULATED proof for aggregation unit test']});
  save(dir,rows,'docker');
  const result=require('node:child_process').spawnSync(process.execPath,[path.join(plan.root,'scripts/manual-recipes-validation.cjs'),'--merge'],{env:{...process.env,MANUAL_RECIPE_ARTIFACTS:dir},encoding:'utf8'});
  assert.equal(result.status,1,'incomplete checklist must fail');
  const combined=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8')).rows;
  assert.ok(combined.slice(0,6).every(r=>r.status==='OK'));assert.ok(combined.slice(6).every(r=>r.status==='NOT_RUN'));
}));
test('workflow serializes six-entry batches, keeps read-only permissions and preserves full checklist',()=>{
  const text=fs.readFileSync(path.join(plan.root,'.github/workflows/manual-recipes-validation.yml'),'utf8');
  assert.match(text,/max-parallel: 1/);assert.match(text,/fail-fast: false/);assert.match(text,/contents: read/);assert.doesNotMatch(text,/secrets\.|pull_request_target|contents: write/);
  assert.match(text,/--cleanup/);assert.match(text,/--merge/);assert.match(text,/if: always/);
  const workflow=require('js-yaml').load(text);assert.equal(workflow.on.push,undefined);assert.equal(workflow.on.pull_request,undefined);assert.ok(Object.hasOwn(workflow.on,'workflow_dispatch'));
  assert.equal(workflow.jobs.batches.env,undefined,'runner context must be used at step scope');
});
test('Laravel fixture uses actual pinned framework; missing installed dependencies cannot pass readiness',()=>temporary(dir=>{
  const recipe=plan.recipes.find(r=>r.id==='laravel-mysql');
  const output=path.join(dir,'case');const prepared=require('../scripts/lib/manual-recipe-generation.cjs').prepare(recipe,output);
  const pkg=JSON.parse(fs.readFileSync(path.join(output,'laravel/composer.json'),'utf8'));
  assert.equal(pkg.require['laravel/framework'],'12.70.1');assert.equal(pkg.config['allow-plugins'],false);
  assert.deepEqual(plan.prerequisites(recipe,output),[]);
  assert.deepEqual(plan.prerequisites(recipe,output,{dependencies:true}),['composer.lock','vendor/autoload.php']);
  assert.ok(prepared.ciFixture.includes('laravel/routes/web.php'));
  assert.ok(prepared.generated.includes('laravel/Dockerfile.laravel'));
}));

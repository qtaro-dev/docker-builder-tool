// 最大6件ずつ実検証し、成功記録を残したまま各ケースの所有リソースを片付ける。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const plan=require('./lib/manual-recipe-plan.cjs');
const {prepare}=require('./lib/manual-recipe-generation.cjs');
const {ready,probe}=require('./lib/manual-recipe-probes.cjs');
const {classifyFailure}=require('./docker-validation.cjs');
const states=['NOT_RUN','STATIC_ONLY','OK','FAIL','BLOCKED','PARTIAL'];
// 未解決PromiseだけではNodeのイベントループを維持できない。HTTP待機中の無言終了を防ぐ。
function holdEventLoop(task) {
  const heartbeat=setInterval(()=>{},1000);
  return Promise.resolve().then(task).finally(()=>clearInterval(heartbeat));
}
const safeEnv=extra=>Object.fromEntries([...['PATH','Path','HOME','SystemRoot','TEMP','TMP','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]),...Object.entries(extra||{})]);
function command(executable,args,directory,log,timeout,extra={}) {
  fs.appendFileSync(log,`$ ${executable} ${JSON.stringify(args)}\n`);
  const result=spawnSync(executable,args,{cwd:directory,env:safeEnv(extra),encoding:'utf8',timeout,maxBuffer:8*1024*1024,shell:false,windowsHide:true});
  fs.appendFileSync(log,`${result.stdout||''}\n${result.stderr||''}\nexit=${result.status}\n`);
  if(result.status!==0||result.error) throw new Error(`${executable} failed: ${classifyFailure(result)} (see ${path.basename(log)})`);
  return {stdout:result.stdout||''};
}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function initial() {return plan.recipes.map(r=>({id:r.id,title:r.title,batch:Math.floor(plan.recipes.indexOf(r)/plan.BATCH_SIZE)+1,status:'NOT_RUN',generation:'NOT_RUN',preparation:'NOT_RUN',compose:'NOT_RUN',pull:'NOT_RUN',build:'NOT_RUN',up:'NOT_RUN',response:'NOT_RUN',cleanup:'NOT_RUN',scope:plan.scope(r),reason:'',evidence:[]}));}
function markdown(rows,mode) {
  const clean=s=>String(s).replaceAll('|','\\|').replace(/[\r\n]/g,' ').slice(0,1500);
  return ['## マニュアルレシピ構築チェックリスト','',`モード: ${mode}。OKは実Docker検証と後片付けが成功したものだけです。`,
    '各グループは最大6件。公開ポートの重複を避けるため1件ずつ起動し、検査後に専用リソースを削除します。','',
    '| チェック | グループ | レシピ | 生成 | 準備 | config | pull | build | 起動 | 応答/連携 | 後片付け | 結果・理由 |','| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(r=>`| ${[r.status==='OK'?'[x] OK':'[ ] '+r.status,r.batch,r.title,r.generation,r.preparation,r.compose,r.pull,r.build,r.up,r.response,r.cleanup,r.reason||r.evidence.join('; ')||'未実施'].map(clean).join(' | ')} |`),
    '', 'STATIC_ONLY=ローカル静的検査のみ、BLOCKED=必要な入力不足、PARTIAL=起動等の一部のみ確認、FAIL=失敗、NOT_RUN=未実施。これらはOKに数えません。',
    '', '### 各レシピの確認範囲',...rows.map(r=>`- ${clean(r.title)}: ${clean(r.scope)}`),''].join('\n');
}
function save(destination,rows,mode) {
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'results.json'),JSON.stringify({mode,sourceRevision:process.env.GITHUB_SHA||null,rows},null,2));fs.writeFileSync(path.join(destination,'checklist.md'),markdown(rows,mode));
}
async function waitFor(action,timeout=120000) {
  const deadline=Date.now()+timeout;let error;
  do {try{return await action();}catch(e){error=e;await new Promise(r=>setTimeout(r,2000));}}while(Date.now()<deadline);
  throw new Error('readiness/response timeout: '+error?.message);
}
// 生成ファイルと実行プロジェクト名をハッシュで結び付け、別のComposeを削除しない。
function ownedArgs(owned,project=owned.project) {
  assert.match(project,/^dbtm-[a-f0-9]{12}-[1-9][0-9]*-(?:main|restore)$/);
  for(const f of owned.composeFiles) assert.equal(hash(path.join(owned.directory,f.name)),f.sha256,'Changed owned Compose');
  return ['compose','--project-name',project,'--project-directory',owned.directory,'--env-file',owned.emptyEnv,...owned.composeFiles.flatMap(f=>['-f',path.join(owned.directory,f.name)])];
}
function cleanup(owned,invoke=command) {
  assert.equal(owned.lockContainer,owned.project+'-lock');
  const failures=[];
  for(const project of [...(owned.restoreUsed?[owned.restore]:[]),owned.project]) {
    try{invoke('docker',[...ownedArgs(owned,project),'down','-v','--rmi','local','--remove-orphans','--timeout','10'],owned.directory,owned.log,90000,{DOCKER_CONFIG:owned.config});}catch(e){failures.push(e.message);}
  }
  // lockfile作成用の一時コンテナも所有名を確認してから除去する。
  try {
    const found=invoke('docker',['ps','-aq','--filter','name=^/'+owned.lockContainer+'$'],owned.directory,owned.log,10000,{DOCKER_CONFIG:owned.config});
    if(found.stdout.trim()) invoke('docker',['rm','-f',owned.lockContainer],owned.directory,owned.log,10000,{DOCKER_CONFIG:owned.config});
  } catch(e) {failures.push(e.message);}
  if(failures.length) throw new Error('Owned cleanup failed: '+failures.join('; '));
}
function runtime(record,recipe,generated,directory,destination,token,index,invoke=command) {
  // 認証設定領域はArtifactの外に置く。中断時はownership.jsonから同じ領域を参照する。
  const config=path.join(path.dirname(directory),'docker-config');fs.mkdirSync(config,{recursive:true});
  const emptyEnv=path.join(path.dirname(directory),'empty.env');fs.writeFileSync(emptyEnv,'');
  const project=`dbtm-${token}-${index}-main`,restore=`dbtm-${token}-${index}-restore`;
  const composeFiles=['docker-compose.yml',...(generated.additions.includes('compose.manual.yml')?['compose.manual.yml']:[])].map(name=>({name,sha256:hash(path.join(directory,name))}));
  const exported=path.join(destination,recipe.id);fs.mkdirSync(exported,{recursive:true});
  const owned={directory,config,emptyEnv,project,restore,restoreUsed:false,lockContainer:`${project}-lock`,composeFiles,log:path.join(exported,'cleanup.log')};
  fs.writeFileSync(path.join(directory,'ownership.json'),JSON.stringify(owned,null,2));
  fs.writeFileSync(path.join(exported,'ownership.json'),JSON.stringify(owned,null,2));
  const dockerEnv={DOCKER_CONFIG:config,DOCKER_BUILDKIT:'1',BUILDKIT_PROGRESS:'plain'};
  const compose=(tail,timeout=60000)=>invoke('docker',[...ownedArgs(owned),...tail],directory,path.join(exported,'docker.log'),timeout,dockerEnv);
  return {recipe,record,project,owned,compose,directory,generated,waitFor,
    restore:(tail,timeout)=>{
      // 中断直後のalways処理でも復旧用プロジェクトを取り残さないよう、起動前に記録する。
      owned.restoreUsed=true;
      for(const target of [directory,exported])fs.writeFileSync(path.join(target,'ownership.json'),JSON.stringify(owned,null,2));
      return invoke('docker',[...ownedArgs(owned,restore),...tail],directory,path.join(exported,'restore.log'),timeout,dockerEnv);
    },
    command:(name,args,timeout,extra)=>invoke(name,args,directory,path.join(exported,'extras.log'),timeout,{...dockerEnv,...extra}),
  };
}
async function execute(context) {
  const {recipe,record:r,compose:c,directory,generated,owned}=context;
  r.preparation='FAIL';
  if(recipe.modules.includes('laravel')) {
    const dockerfile=fs.readFileSync(path.join(directory,'laravel/Dockerfile.laravel'),'utf8');
    const composer=dockerfile.match(/^COPY --from=(\S+) \/usr\/bin\/composer/m)?.[1];
    assert.ok(composer,'Generated Dockerfile does not identify Composer image');
    try {
      context.command('docker',['run','--rm','--name',owned.lockContainer,'--user',`${process.getuid()}:${process.getgid()}`,'-e','COMPOSER_HOME=/tmp/composer','-v',`${path.join(directory,'laravel')}:/app`,'-w','/app',composer,'update','--no-interaction','--no-progress','--no-scripts','--no-plugins','--ignore-platform-req=ext-*'],300000);
    } catch(e) {const blocked=new Error('Laravel fixture dependency preparation unavailable: '+e.message);blocked.code='RECIPE_BLOCKED';throw blocked;}
    assert.deepEqual(plan.prerequisites(recipe,directory,{dependencies:true}),[],'Laravel fixture dependencies missing');
  }
  // Flaskがrootで作るキャッシュも、この検証専用の領域では削除できるようにする。
  if(recipe.modules.includes('python-web')) {const cache=path.join(directory,'python-web/__pycache__');fs.mkdirSync(cache,{recursive:true});fs.chmodSync(cache,0o777);}
  // パッケージのインストールはrunner内の使い捨てコンテナでのみ行う。配布例は上書きしない。
  if(recipe.modules.includes('nodejs')&&!fs.existsSync(path.join(directory,'nodejs/package-lock.json'))) {
    const image=generated.model.images.find(i=>i.moduleId==='nodejs').image;
    context.command('docker',['run','--rm','--name',owned.lockContainer,'-v',`${path.join(directory,'nodejs')}:/app`,'-w','/app',image,'npm','install','--package-lock-only','--ignore-scripts'],180000);
  }
  r.preparation='PASS';
  r.compose='FAIL';c(['config','-q']);r.compose='PASS';
  // 完全なComposeはログへ出さず、機密を持たないJSON構造を内部で参照する。
  const merged=JSON.parse(c(['config','--format','json']).stdout);context.services=merged.services;
  r.pull='FAIL';for(const image of generated.model.images) context.command('docker',['pull','--platform','linux/amd64',image.image],180000);r.pull='PASS';
  if(generated.model.files.some(f=>f.relativePath.includes('/Dockerfile.'))) {r.build='FAIL';c(['build'],480000);r.build='PASS';}else r.build='N/A';
  r.up='FAIL';c(['up','-d','--build'],180000);r.up='PASS';r.response='FAIL';
  await waitFor(()=>ready(context),recipe.modules.includes('redmine')||recipe.modules.includes('jenkins')?240000:120000);
  // readinessだけをリトライする。書込み・バックアップ等の本検査は一度だけ実施する。
  const result=await probe(context);r.evidence=result.evidence;r.response=result.partial?'PARTIAL':'PASS';r.status=result.partial?'PARTIAL':'OK';
  if(result.partial) r.reason='起動確認のみ。レシピの残りの操作は未検証です。';
}
async function run({mode='static',batch:batchNumber=1,destination,executor=execute,cleanupExecutor=cleanup,commandExecutor=command}={}) {
  assert.ok(['static','docker'].includes(mode));assert.ok(destination);
  if(mode==='docker'&&executor===execute) assert.ok(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true','Real Docker tests only run on GitHub Linux CI');
  const rows=initial(),selected=plan.batch(batchNumber),token=crypto.randomBytes(6).toString('hex');save(destination,rows,mode);
  const workRoot=fs.mkdtempSync(path.join(os.tmpdir(),'dbtm-work-'));fs.writeFileSync(path.join(destination,'workspace.txt'),workRoot);
  for(const recipe of selected) {
    const r=rows.find(row=>row.id===recipe.id),directory=path.join(workRoot,recipe.id);let context,generated;
    try {
      generated=prepare(recipe,directory);r.generation='PASS';
      fs.writeFileSync(path.join(directory,'input-record.json'),JSON.stringify({modules:recipe.modules,configs:recipe.configs,projectName:recipe.projectName,generated:generated.generated,additions:generated.additions,ciFixture:generated.ciFixture},null,2));
      const missing=plan.prerequisites(recipe,directory);
      if(missing.length) {r.status='BLOCKED';r.reason='利用者が用意するLaravel本体/設定が不足: '+missing.join(', ');}
      else if(mode==='static') {r.status='STATIC_ONLY';r.reason='生成一致のみ。Dockerは実行していません。';}
      else {
        context=runtime(r,recipe,generated,directory,destination,token,plan.recipes.indexOf(recipe)+1,commandExecutor);
        await executor(context);
        assert.ok(r.status==='OK'||r.status==='PARTIAL','Executor did not report a result');
      }
    } catch(e) {r.status=e.code==='RECIPE_BLOCKED'?'BLOCKED':'FAIL';r.reason=e.message;}
    finally {
      if(context) {
        try{context.compose(['ps','--all','--format','json'],15000);context.compose(['logs','--no-color','--timestamps','--tail','120'],20000);}catch{/* 起動失敗時も可能なログを残す */}
        try{cleanupExecutor(context.owned,commandExecutor);r.cleanup='PASS';}catch(e){r.status='FAIL';r.cleanup='FAIL';r.reason+='; '+e.message;}
      }
      // 資格情報のない生成/追加ファイルとログだけを保存する。依存一式・DBダンプ・.envは除外。
      const output=path.join(destination,recipe.id);fs.mkdirSync(output,{recursive:true});
      const exportFiles=[...(generated?.generated||[]),...(generated?.additions||[]),...(generated?.ciFixture||[]),'laravel/composer.lock','input-record.json','ownership.json','docker.log','cleanup.log','restore.log','extras.log'];
      for(const file of exportFiles) if(!file.split('/').some(p=>p==='.env'||p==='backup')&&fs.existsSync(path.join(directory,file))) {
        const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(directory,file),target);
      }
      // CIで作成したlockfileは再現用に保存する。node_modulesやDB内容は保存しない。
      const lock=path.join(directory,'nodejs/package-lock.json');if(fs.existsSync(lock)){fs.mkdirSync(path.join(output,'nodejs'),{recursive:true});fs.copyFileSync(lock,path.join(output,'nodejs/package-lock.json'));}
      if(context&&r.cleanup==='PASS') {
        try {assert.equal(path.dirname(directory),workRoot);fs.rmSync(directory,{recursive:true,force:true});}
        catch(e) {r.cleanup='FAIL';r.status='FAIL';r.reason+='; temporary file cleanup: '+e.message;}
      }
      save(destination,rows,mode);console.log(`${r.status}: ${recipe.id}: ${r.reason||r.evidence.join('; ')}`);
    }
  }
  if(mode==='static') {assert.ok(path.dirname(workRoot)===path.resolve(os.tmpdir())&&path.basename(workRoot).startsWith('dbtm-work-'));fs.rmSync(workRoot,{recursive:true,force:true});}
  return rows;
}
function merge(directories) {
  const combined=initial(),seen=new Set();
  for(const directory of directories) {
    const result=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'));
    assert.equal(result.mode,'docker','Static evidence cannot become an Actions OK');
    if(process.env.GITHUB_SHA)assert.equal(result.sourceRevision,process.env.GITHUB_SHA,'Evidence belongs to a different commit');
    for(const row of result.rows.filter(r=>r.status!=='NOT_RUN')) {
      assert.ok(!seen.has(row.id),'Duplicate recipe result');seen.add(row.id);
      const target=combined.find(r=>r.id===row.id);assert.ok(target);assert.equal(row.batch,target.batch);assert.ok(states.includes(row.status));
      if(row.status==='OK') assert.ok(['generation','preparation','compose','pull','up','response','cleanup'].every(k=>row[k]==='PASS')&&['PASS','N/A'].includes(row.build),'Incomplete OK evidence');
      Object.assign(target,row);
    }
  }
  return combined;
}
function cleanupSaved(destination) {
  if(!fs.existsSync(destination))return;
  const failures=[];
  const saved=fs.existsSync(path.join(destination,'results.json'))?JSON.parse(fs.readFileSync(path.join(destination,'results.json'),'utf8')).rows:[];
  for(const recipe of plan.recipes) {
    const file=path.join(destination,recipe.id,'ownership.json');if(!fs.existsSync(file))continue;
    if(saved.find(r=>r.id===recipe.id)?.cleanup==='PASS')continue;
    const owned=JSON.parse(fs.readFileSync(file,'utf8'));
    const tmp=path.resolve(os.tmpdir()),resolved=path.resolve(owned.directory);
    assert.ok(resolved.startsWith(tmp+path.sep)&&path.basename(path.dirname(resolved)).startsWith('dbtm-work-')&&path.basename(resolved)===recipe.id,'Unsafe cleanup directory');
    try{cleanup(owned);fs.rmSync(resolved,{recursive:true,force:true});}catch(e){failures.push(recipe.id+': '+e.message);}
  }
  if(failures.length)throw new Error(failures.join('; '));
}
async function main(args) {
  if(args[0]==='--plan') {console.log(JSON.stringify({include:plan.batches().map(b=>({batch:b.batch}))}));return;}
  const destination=path.resolve(process.env.MANUAL_RECIPE_ARTIFACTS||'release/manual-recipes');
  if(args[0]==='--cleanup') {assert.ok(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true');cleanupSaved(destination);return;}
  if(args[0]==='--merge') {
    fs.mkdirSync(destination,{recursive:true});
    const directories=fs.readdirSync(destination,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('recipe-batch-')).map(e=>path.join(destination,e.name));
    // download-artifactは一致が1件だけの場合、直下へ展開するバージョンもある。
    if(!directories.length&&fs.existsSync(path.join(destination,'results.json')))directories.push(destination);
    const rows=merge(directories);save(destination,rows,'docker');
    if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown(rows,'docker'));
    if(rows.some(r=>r.status!=='OK'))process.exitCode=1;return;
  }
  assert.ok(['--static','--run'].includes(args[0]));const n=Number(args[1]);plan.batch(n);
  const rows=await run({mode:args[0]==='--run'?'docker':'static',batch:n,destination});
  if(rows.some(r=>r.batch===n&& ![args[0]==='--run'?'OK':'STATIC_ONLY'].includes(r.status)))process.exitCode=1;
}
module.exports={initial,markdown,save,run,merge,cleanup,cleanupSaved,ownedArgs,command,main,holdEventLoop};
if(require.main===module)holdEventLoop(()=>main(process.argv.slice(2))).catch(e=>{console.error(e);process.exitCode=1;});

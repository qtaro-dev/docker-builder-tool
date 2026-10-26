// GitHub runnerで本体生成物を起動・確認する。削除は自身のComposeプロジェクトだけ。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { probeCase } = require('./lib/runtime-checks.cjs');
const { cases, generateCase, writeCase, fixtureFiles } = require('./lib/headless-generation.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = () => path.resolve(process.env.DOCKER_VALIDATION_ARTIFACTS || path.join(root, 'release/docker-validation'));
const PASS = 'PASS', FAIL = 'FAIL', NOT_RUN = 'NOT_RUN', NA = 'NOT_APPLICABLE';

function verifyCase(directory, generated) {
  const yaml = require('js-yaml').load(fs.readFileSync(path.join(directory, 'docker-compose.yml'), 'utf8'));
  assert.equal(Object.keys(yaml.services).length, generated.definition.modules.length);
  const local = relative => {
    assert.equal(path.isAbsolute(relative), false);
    const target = path.resolve(directory, relative);
    assert.ok(target.startsWith(path.resolve(directory) + path.sep), 'Build path escapes case');
    assert.equal(fs.lstatSync(target).isSymbolicLink(), false);
    return target;
  };
  for (const model of generated.model.services) {
    const svc = yaml.services[model.name]; assert.ok(svc, 'Missing service');
    assert.deepEqual(svc.ports, Array.from(model.ports));
    assert.deepEqual(svc.volumes || [], Array.from(model.volumes || []));
    const id = model.build ? model.build.context.slice(2) : generated.model.images.find(e => e.image === model.image)?.moduleId;
    const cfg = generated.definition.config[id];
    const expectedPort = id === 'nodejs' ? cfg.hostPort + ':3000' : id === 'python-web' ? cfg.hostPort + ':5000' : id === 'nginx' ? cfg.hostPort + ':80' : id === 'apache' ? cfg.port + ':80' : cfg.port + ':5432';
    assert.deepEqual(svc.ports, [expectedPort]);
    if (model.build) {
      assert.deepEqual(svc.build, {context: './' + id, dockerfile: 'Dockerfile.' + id});
      const context = local(svc.build.context); assert.ok(fs.statSync(context).isDirectory());
      const dockerfile = local(path.join(svc.build.context, svc.build.dockerfile)); assert.equal(path.dirname(dockerfile), context);
      const text = fs.readFileSync(dockerfile, 'utf8');
      assert.ok(text.includes('FROM ' + generated.model.images.find(e => e.moduleId === id).image + '\n'));
      assert.deepEqual(JSON.parse(text.split('\n').find(l => l.startsWith('CMD ')).slice(4)), svc.command);
      assert.equal(svc.image, undefined);
      const ignore = fs.readFileSync(local(id + '/Dockerfile.' + id + '.dockerignore'), 'utf8');
      assert.ok(ignore.split('\n').includes('.env'));
      if(id === 'nodejs') {
        assert.equal((text.match(/^RUN npm ci$/gm) || []).length, 1);
        assert.deepEqual(svc.command, ['sh','-c','npm run dev']);
        assert.equal(svc.volumes?.length || 0, 0);
        for(const file of fixtureFiles) assert.ok(fs.statSync(local('nodejs/' + file)).isFile());
        const pkg = JSON.parse(fs.readFileSync(local('nodejs/package.json')));
        const lock = JSON.parse(fs.readFileSync(local('nodejs/package-lock.json')));
        assert.equal(pkg.private,true); assert.equal(pkg.name,'docker-builder-ci-fixture');
        assert.equal(pkg.scripts.dev,'node server.cjs'); assert.equal(pkg.name,lock.name); assert.equal(pkg.version,lock.version);
        assert.equal(Object.keys(pkg.dependencies || {}).length,0);
      } else {
        assert.equal(id,'python-web'); assert.match(text,/RUN pip install/);
        assert.ok(svc.volumes.includes('./python-web:/app'));
        assert.ok(svc.command[2].includes('flask run --host=0.0.0.0 --port=5000'));
        assert.match(fs.readFileSync(local('python-web/requirements.txt'),'utf8'),/--require-hashes/);
        assert.ok(fs.statSync(local('python-web/app.py')).isFile());
      }
    } else {
      assert.equal(svc.image, model.image); assert.match(svc.image,/@sha256:[a-f0-9]{64}$/);
      assert.equal(svc.build,undefined);
      if(id === 'postgres') {
        const environment=Array.isArray(svc.environment)?Object.fromEntries(svc.environment.map(v=>{const n=v.indexOf('=');return [v.slice(0,n),v.slice(n+1)];})):svc.environment;
        assert.equal(environment.POSTGRES_DB,generated.definition.db.database);
        assert.equal(environment.POSTGRES_USER,generated.definition.db.user);
        assert.equal(environment.POSTGRES_PASSWORD,generated.definition.db.password);
        assert.ok(svc.volumes.some(v=>v.endsWith(':/var/lib/postgresql/data')));
      } else {
        assert.ok(['nginx','apache'].includes(id));
        assert.ok(svc.volumes[0].startsWith('./fixture-web:'));
        assert.match(fs.readFileSync(local('fixture-web/index.html'),'utf8'),/docker-builder-ci-static/);
      }
    }
  }
  assert.deepEqual(Object.keys(yaml.volumes || {}).sort(), [...generated.model.volumes].sort());
  return yaml;
}

function classifyFailure(result) {
  if (result.error?.code === 'ENOENT') return 'docker-unavailable';
  if (result.error?.code === 'ETIMEDOUT') return 'timeout';
  if (result.error?.code === 'ENOBUFS') return 'log-limit';
  if (result.signal) return 'docker-signal';
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (/manifest unknown|manifest.*not found|no matching manifest|failed to resolve.*not found/i.test(text)) return 'registry-reference';
  if (/toomanyrequests|too many requests|rate.limit|\b429\b/i.test(text)) return 'registry-rate-limit';
  if (/unauthorized|authentication required|pull access denied/i.test(text)) return 'registry-auth';
  if (/TLS handshake timeout|i\/o timeout|context deadline exceeded|temporary failure.*resolution|no such host|connection (reset|refused)|network is unreachable|\b503\b|\b502\b/i.test(text)) return 'external-network-possible';
  return 'docker-command';
}
function dockerCommand(args, directory, log, configDirectory, timeout = 60000) {
  // CI認証情報・任意のDocker context/hostを子プロセスへ転送しない。
  const env = { DOCKER_CONFIG: configDirectory, DOCKER_BUILDKIT: '1', BUILDKIT_PROGRESS: 'plain' };
  for (const key of ['PATH', 'Path', 'HOME', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  const header = `$ docker ${args.map(a => JSON.stringify(a)).join(' ')}\nSTARTED: ${new Date().toISOString()}\n`;
  // 強制中断でも最後に開始したコマンドを特定できるよう、開始前に記録する。
  fs.appendFileSync(log, header); console.log(header);
  const result = spawnSync('docker', args, { cwd: directory, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: false });
  const output = `${result.stdout || ''}\n${result.stderr || ''}\nexit=${result.status} signal=${result.signal || ''}\n${result.error?.message || ''}\n`;
  fs.appendFileSync(log, output);
  console.log(output);
  return { ok: result.status === 0 && !result.error, category: classifyFailure(result), output, stdout: result.stdout || '' };
}
function initialResults(mode) {
  return { schemaVersion: 1, mode, cases: cases.map(c => ({ id: c.id, modules: c.modules, generation: NOT_RUN, compose: NOT_RUN,
    build: c.modules.some(id => ['nodejs','python-web'].includes(id)) ? NOT_RUN : NA, pull: NOT_RUN, up: NOT_RUN, response: NOT_RUN, cleanup: NOT_RUN, outcome: NOT_RUN, reason: '' })) };
}
function summary(results) {
  const escape = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ').slice(0, 1200);
  const lines = ['## Docker生成構成の検証', '', `モード：${results.mode}。dockerモードは実起動・HTTP/DB検証。generate-onlyは静的検証のみ。CVE検査は対象外。`, '',
    '| ケース | 生成 | config | pull | build | up | HTTP/DB | cleanup | 結果 | 理由 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of results.cases) lines.push(`| ${[row.id, row.generation, row.compose, row.pull, row.build, row.up, row.response, row.cleanup, row.outcome, row.reason || 'なし'].map(escape).join(' | ')} |`);
  lines.push('', 'PASS=成功、FAIL=失敗、NOT_RUN=未実施、NOT_APPLICABLE=既成イメージのみのため対象外。',
    'registry-referenceはタグ/digestの参照不成立、registry-rate-limit/authは配布元の制限・認証、external-network-possibleはログから推定した通信障害です。断定せず各ログを確認してください。',
    '生成ファイル・fixture・静的検証ログ・Compose/buildログはArtifactを参照してください。');
  return lines.join('\n') + '\n';
}
function writeResults(results, destination, githubSummary = true) {
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  const markdown = summary(results);
  fs.writeFileSync(path.join(destination, 'summary.md'), markdown);
  if (githubSummary && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}
function run({ mode = 'generate-only', destination = artifacts(), invoke = dockerCommand, probe = probeCase, pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2000) } = {}) {
  if (!['generate-only', 'docker'].includes(mode)) throw new Error('Unknown validation mode');
  const results = initialResults(mode);
  const deadline = Date.now() + 25 * 60000;
  const execute = (args, directory, log, config, timeout = 60000) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Validation total timeout (25 minutes)');
    return invoke(args, directory, log, config, Math.min(timeout, remaining));
  };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-builder-validation-'));
  const configDirectory = path.join(temporary, 'docker-config'); fs.mkdirSync(configDirectory);
  const emptyEnv = path.join(temporary, 'empty.env'); fs.writeFileSync(emptyEnv, '');
  const prepared = [];
  // コピーするファイルはこの検証で生成した許可リストだけ。作業ツリー全体は保存しない。
  for (const row of results.cases) {
    const directory = fs.mkdtempSync(path.join(temporary, `${row.id}-`));
    fs.writeFileSync(path.join(directory, 'compose.log'), 'NOT_RUN: Docker Compose config has not run.\n');
    fs.writeFileSync(path.join(directory, 'build.log'), `${row.build}: Dockerfile build has not run${row.build === NA ? ' (prebuilt image only)' : ''}.\n`);
    row.projectName = `dbt-${crypto.randomBytes(4).toString('hex')}-${row.id}`;
    const exported = new Set(['docker-compose.yml', 'generation.log', 'compose.log', 'build.log',
      ...(row.modules.includes('nodejs') ? ['nodejs/Dockerfile.nodejs', 'nodejs/Dockerfile.nodejs.dockerignore', ...fixtureFiles.map(f => `nodejs/${f}`)] : [])]);
    try {
      const generated = generateCase(row.id, row.projectName);
      for (const file of writeCase(directory, generated)) exported.add(file);
      verifyCase(directory, generated);
      fs.writeFileSync(path.join(directory, 'generation.log'), `PASS: ${row.modules.join(' + ')}\n${generated.model.warnings.join('\n')}\n`);
      row.generation = PASS;
      row.outcome = mode === 'generate-only' ? 'STATIC_ONLY' : NOT_RUN;
      if (mode === 'generate-only') row.reason = 'Dockerは実行していません。生成・YAML/配置/ポート/ボリューム等の静的検証のみ成功。';
      prepared.push({ row, directory, generated, exported });
    } catch (error) {
      row.generation = FAIL; row.outcome = FAIL; row.reason = `generation-or-structure: ${error.message}`;
      fs.writeFileSync(path.join(directory, 'generation.log'), error.stack || String(error));
      prepared.push({ row, directory, exported });
    }
  }
  function exportPrepared() {
    for (const { row, directory, exported } of prepared) for (const file of exported) {
      const source = path.join(directory, file);
      if (!fs.existsSync(source)) continue;
      const target = path.join(destination, row.id, file);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
    }
  }
  // 強制終了時にも、生成物とコマンド開始記録をArtifact対象に残す。
  exportPrepared(); writeResults(results, destination, false);
  const ownership = { schemaVersion: 1, cases: prepared.filter(p => p.row.generation === PASS).map(p => ({
    id: p.row.id, projectName: p.row.projectName,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(p.directory,'docker-compose.yml'))).digest('hex'),
  })) };
  fs.writeFileSync(path.join(destination,'ownership.json'),JSON.stringify(ownership,null,2));
  try {
    if (mode === 'docker') {
      if (invoke === dockerCommand && (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true')) throw new Error('Runtime validation is restricted to the GitHub-hosted Linux CI job');
      const infrastructureLog = path.join(destination,'docker-environment.log');
      let ready = true;
      for(const args of [['version'],['info','--format','{{.ServerVersion}}'],['compose','version']]) {
        const value = execute(args, temporary, infrastructureLog, configDirectory);
        if(!value.ok) { ready=false; for(const p of prepared) if(p.row.generation===PASS) {p.row.outcome=FAIL;p.row.reason='docker-environment ('+value.category+')';} break; }
      }
      const pulls = new Map();
      if(ready) for(const {row,directory,generated} of prepared) {
        if(row.generation !== PASS) continue;
        const args=['compose','--project-name',row.projectName,'--project-directory',directory,'--env-file',emptyEnv,'-f',path.join(directory,'docker-compose.yml')];
        const log = name => path.join(destination,row.id,name+'.log');
        const call = (tail, name, timeout=60000) => execute([...args,...tail],directory,log(name),configDirectory,timeout);
        try {
          const config=call(['config','-q'],'compose');row.compose=config.ok?PASS:FAIL;
          if(!config.ok) throw new Error('compose-config ('+config.category+')');
          row.pull=PASS;
          for(const image of generated.model.images) {
            if(!pulls.has(image.image)) pulls.set(image.image,execute(['pull','--platform','linux/amd64',image.image],temporary,path.join(destination,'registry-preflight.log'),configDirectory,180000));
            const pulled=pulls.get(image.image);
            if(!pulled.ok) {row.pull=FAIL;throw new Error('registry-preflight ('+pulled.category+') '+image.image);}
          }
          if(row.build !== NA) {
            const build=call(['build'],'build',240000);row.build=build.ok?PASS:FAIL;
            if(!build.ok) throw new Error('compose-build ('+build.category+')');
          }
          const up=call(['up','-d','--build'],'up',120000);row.up=up.ok?PASS:FAIL;
          if(!up.ok) throw new Error('compose-up ('+up.category+')');
          let response, attempts=0;
          const until=Math.min(deadline,Date.now()+90000);
          do {
            attempts++;
            response=probe({ generated, composeArgs:args, directory, log:log('response'), execute:(a,c,l,t)=>execute(a,c,l,configDirectory,t) });
            if(response.ok) break;
            fs.appendFileSync(log('response'),'attempt '+attempts+': '+response.reason+'\n');
            pause();
          } while(attempts<30 && Date.now()<until);
          row.response=response.ok?PASS:FAIL;
          row.evidence=response.reason;
          if(!response.ok) throw new Error('service-response: '+response.reason);
          fs.appendFileSync(log('response'),'PASS: '+response.reason+'\n');
          row.outcome=PASS;
        } catch(error) {row.outcome=FAIL;row.reason=error.message;}
        finally {
          // 後片付けは全体期限を超えても試み、ログを消す前に採取する。
          invoke([...args,'ps','--all','--format','json'],directory,log('containers'),configDirectory,15000);
          invoke([...args,'logs','--no-color','--timestamps','--tail','200'],directory,log('containers'),configDirectory,15000);
          const cleanup=invoke([...args,'down','-v','--remove-orphans','--timeout','10'],directory,log('cleanup'),configDirectory,60000);
          row.cleanup=cleanup.ok?PASS:FAIL;
          if(!cleanup.ok){row.outcome=FAIL;row.reason+=(row.reason?'; ':'')+'cleanup ('+cleanup.category+')';}
          writeResults(results,destination,false);
        }
      }
    }
  } catch(error) {
    for(const {row} of prepared) if(![FAIL,PASS].includes(row.outcome)){row.outcome=FAIL;row.reason='validation-internal: '+error.message;}
  } finally {
    writeResults(results,destination,false);
    const resolved=path.resolve(temporary);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('docker-builder-validation-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }
  return results;
}
// 中断後のalwaysステップも、保存した生成物のハッシュと固有project名を照合してから削除する。
function cleanupSaved(destination, invoke=dockerCommand) {
  const manifestPath=path.join(destination,'ownership.json');
  if(!fs.existsSync(manifestPath)) return;
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const results=JSON.parse(fs.readFileSync(path.join(destination,'results.json'),'utf8'));
  assert.equal(manifest.schemaVersion,1);
  const config=fs.mkdtempSync(path.join(os.tmpdir(),'dbt-cleanup-'));
  try {
    const env=path.join(config,'empty.env');fs.writeFileSync(env,'');
    for(const owned of manifest.cases) {
      assert.ok(cases.some(c=>c.id===owned.id),'Unknown cleanup case');
      assert.ok(new RegExp('^dbt-[a-f0-9]{8}-'+owned.id+'$').test(owned.projectName),'Unowned project');
      const directory=path.join(destination,owned.id),file=path.join(directory,'docker-compose.yml');
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),owned.sha256,'Changed cleanup Compose');
      const row=results.cases.find(c=>c.id===owned.id&&c.projectName===owned.projectName);assert.ok(row);
      if(row.cleanup===PASS) continue;
      const cleaned=invoke(['compose','--project-name',owned.projectName,'--project-directory',directory,'--env-file',env,'-f',file,'down','-v','--remove-orphans','--timeout','10'],directory,path.join(directory,'cleanup.log'),config,60000);
      row.cleanup=cleaned.ok?PASS:FAIL;
      if(!cleaned.ok){row.outcome=FAIL;row.reason+='; fallback cleanup failed';}
    }
    writeResults(results,destination,false);
    if(results.cases.some(c=>c.cleanup===FAIL)) throw new Error('Cleanup failed; inspect cleanup.log');
  } finally {
    assert.ok(path.resolve(config).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(config).startsWith('dbt-cleanup-'));
    fs.rmSync(config,{recursive:true,force:true});
  }
}
function main(args) {
  if (args.length !== 1 || !['--generate-only', '--run', '--summary-only', '--cleanup-only'].includes(args[0])) throw new Error('Use --generate-only, --run or --summary-only');
  const destination = artifacts();
  if(args[0]==='--cleanup-only') {
    if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true') throw new Error('Cleanup only runs in Linux CI');
    cleanupSaved(destination);return;
  }
  if (args[0] === '--summary-only') {
    let results;
    try { results = JSON.parse(fs.readFileSync(path.join(destination, 'results.json'), 'utf8')); }
    catch { results = initialResults('not-started'); for (const row of results.cases) row.reason = '生成・Docker検証の前提ステップが失敗/中断したため未実施。Actionsのステップログを確認してください。'; }
    for (const row of results.cases) if (row.outcome === NOT_RUN && !row.reason) row.reason = '検証開始前に失敗、または実行途中で中断しました。Actionsのステップログを確認してください。';
    writeResults(results, destination); return;
  }
  const results = run({ mode: args[0] === '--run' ? 'docker' : 'generate-only' });
  console.log(summary(results));
  if (results.cases.some(c => c.outcome === FAIL)) process.exitCode = 1;
}
module.exports = { verifyCase, classifyFailure, initialResults, summary, run, main, cleanupSaved };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.stack); process.exitCode = 1; }
}

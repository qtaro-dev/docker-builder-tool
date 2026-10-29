const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { spawnSync } = require('node:child_process');
const { cases, generateCase, writeCase } = require('../scripts/lib/headless-generation.cjs');
const { verifyCase, classifyFailure, run, main, cleanupSaved } = require('../scripts/docker-validation.cjs');
const { parsePS } = require('../scripts/lib/runtime-checks.cjs');
function temporary(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-validation-unit-'));
  try { return callback(directory); }
  finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('docker-validation-unit-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function simulatedDocker(calls, failure = () => false) {
  return (args, directory, log, configDirectory, timeout) => {
    calls.push({ args, directory, log, configDirectory, timeout });
    fs.appendFileSync(log, `SIMULATED UNIT TEST: docker ${args.join(' ')}\n`);
    return { ok: !failure(args, directory), category: 'simulated-test-failure', output: '' };
  };
}

test('headless application generation produces six isolated valid structures without invoking Docker', () => temporary(destination => {
  const results = run({ destination, invoke: () => { throw new Error('Docker must not run in generate-only'); } });
  assert.equal(results.cases.length, 6);
  assert.deepEqual(results.cases.map(c => c.generation), Array(6).fill('PASS'));
  assert.ok(results.cases.every(c => c.compose === 'NOT_RUN' && c.outcome === 'STATIC_ONLY'));
  assert.equal(results.cases[0].build, 'NOT_APPLICABLE');
  for (const row of results.cases) {
    const saved = path.join(destination, row.id);
    const compose = yaml.load(fs.readFileSync(path.join(saved, 'docker-compose.yml'), 'utf8'));
    assert.equal(fs.readFileSync(path.join(saved,'docker-compose.yml'),'utf8'),generateCase(row.id,row.projectName).compose);
    assert.equal(Object.keys(compose.services).length, row.modules.length);
    assert.ok(fs.existsSync(path.join(saved, 'generation.log')));
    assert.equal(fs.existsSync(path.join(saved, 'settings.json')), false);
    assert.equal(fs.existsSync(path.join(saved, '.env')), false);
    if (row.modules.includes('nodejs')) {
      assert.ok(fs.existsSync(path.join(saved, 'nodejs/Dockerfile.nodejs')));
      assert.ok(fs.existsSync(path.join(saved, 'nodejs/Dockerfile.nodejs.dockerignore')));
      assert.match(fs.readFileSync(path.join(saved, 'nodejs/server.cjs'), 'utf8'), /CIのビルド成立/);
    } else assert.equal(fs.existsSync(path.join(saved, 'nodejs')), false);
  }
  assert.throws(() => generateCase('unknown', 'test'));
  assert.throws(() => generateCase('nginx', '../unsafe'));
}));

test('static checks reject wrong context, missing Dockerfile, ports, volumes and command divergence', () => temporary(directory => {
  const generated = generateCase('nodejs', 'test-node');
  writeCase(directory, generated); verifyCase(directory, generated);
  const target = path.join(directory, 'docker-compose.yml');
  for (const mutate of [
    s => { s.build.context = '../outside'; }, s => { s.build.dockerfile = 'Missing'; },
    s => { s.ports = ['9000:3000']; }, s => { s.volumes = ['hidden:/app']; },
    s => { s.command = ['npm', 'install']; }, s => { s.image = 'node:latest'; },
  ]) {
    const doc = yaml.load(generated.compose); mutate(Object.values(doc.services)[0]);
    fs.writeFileSync(target, yaml.dump(doc)); assert.throws(() => verifyCase(directory, generated));
  }
  fs.writeFileSync(target, generated.compose);
  fs.unlinkSync(path.join(directory, 'nodejs/Dockerfile.nodejs'));
  assert.throws(() => verifyCase(directory, generated), /ENOENT/);
}));

test('fixture lockfile can be installed with npm ci without dependencies or lifecycle scripts', () => temporary(directory => {
  const generated = generateCase('nodejs', 'test-lock'); writeCase(directory, generated);
  // npm-cli.jsをNodeで直接呼び、Windowsでもshellを介さず検証する。
  assert.ok(process.env.npm_execpath, 'Run this regression through npm test');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: path.join(directory, 'nodejs'), encoding: 'utf8', timeout: 30000, shell: false, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}));

test('simulated Docker driver starts all six cases, checks responses and cleans only owned projects', () => temporary(destination => {
  const calls = [];
  const result = run({ mode: 'docker', destination, invoke: simulatedDocker(calls), probe:()=>({ok:true,reason:'simulated-response'}), pause:()=>{} });
  assert.ok(result.cases.every(c => c.outcome === 'PASS'));
  assert.equal(calls.filter(c => c.args.at(-1) === '-q').length, 6);
  assert.equal(calls.filter(c => c.args.at(-1) === 'build').length, 3);
  assert.equal(calls.filter(c => c.args[0] === 'pull').length, 5, 'Share one small base pull across Node cases');
  assert.equal(new Set(calls.filter(c => c.args.at(-1) === '-q').map(c => c.directory)).size, 6);
  assert.ok(calls.every(c => c.timeout > 0 && c.timeout <= 300000));
  assert.equal(calls.filter(c=>c.args.includes('up')).length,6);
  assert.equal(calls.filter(c=>c.args.includes('down')).length,6);
  assert.ok(result.cases.every(c=>c.response==='PASS'&&c.cleanup==='PASS'));
  assert.equal(calls.some(c=>c.args.includes('prune')),false);
  assert.equal(result.cases[0].build, 'NOT_APPLICABLE');
}));

test('simulated Compose, registry, build and infrastructure failures remain failures with artifacts', () => {
  for (const stage of ['config', 'pull', 'build', 'version']) temporary(destination => {
    const calls = [];
    const result = run({ mode: 'docker', destination, invoke: simulatedDocker(calls, args => stage === 'config' ? args.at(-1) === '-q' : args.at(-1) === stage || args[0] === stage), probe:()=>({ok:true,reason:'simulated-response'}), pause:()=>{} });
    assert.ok(result.cases.some(c => c.outcome === 'FAIL'), stage);
    for (const row of result.cases) assert.ok(fs.existsSync(path.join(destination, row.id, 'docker-compose.yml')));
    const saved = JSON.parse(fs.readFileSync(path.join(destination, 'results.json')));
    assert.ok(saved.cases.some(c => c.outcome === 'FAIL' && c.reason.includes('simulated-test-failure')));
    if (stage === 'pull') {
      assert.equal(result.cases[0].outcome, 'FAIL');
      assert.ok(result.cases.every(c => c.compose === 'PASS' && c.up === 'NOT_RUN'));
      assert.equal(calls.some(c => c.args.at(-1) === 'build'), false);
    }
  });
  assert.equal(classifyFailure({ stderr: 'manifest unknown' }), 'registry-reference');
  assert.equal(classifyFailure({ stderr: '429 Too Many Requests' }), 'registry-rate-limit');
  assert.equal(classifyFailure({ stderr: 'TLS handshake timeout' }), 'external-network-possible');
  assert.equal(classifyFailure({ stderr: 'RUN npm ci exited with code 1' }), 'docker-command');
  assert.equal(classifyFailure({ error: { code: 'ENOENT' } }), 'docker-unavailable');
});

test('summary reports not-run cases when prerequisites fail instead of claiming success', () => temporary(destination => {
  const old = process.env.DOCKER_VALIDATION_ARTIFACTS;
  const oldSummary = process.env.GITHUB_STEP_SUMMARY;
  process.env.DOCKER_VALIDATION_ARTIFACTS = destination;
  process.env.GITHUB_STEP_SUMMARY = path.join(destination, 'github-summary.md');
  try {
    main(['--summary-only']);
    const text = fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8');
    for (const c of cases) assert.ok(text.includes(`| ${c.id} | NOT_RUN`));
    assert.match(text, /not-started|前提ステップ/);
  } finally {
    if (old === undefined) delete process.env.DOCKER_VALIDATION_ARTIFACTS; else process.env.DOCKER_VALIDATION_ARTIFACTS = old;
    if (oldSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY; else process.env.GITHUB_STEP_SUMMARY = oldSummary;
  }
}));

test('workflow uses manual dispatch only, read-only permissions and separate real Electron validation', () => {
  const doc = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/docker-validation.yml'), 'utf8'));
  assert.deepEqual(doc.permissions, { contents: 'read' });
  assert.equal(doc.on.push, undefined);
  assert.equal(doc.on.pull_request, undefined);
  assert.ok(Object.hasOwn(doc.on, 'workflow_dispatch'));
  assert.equal(Object.hasOwn(doc.on, 'pull_request_target'), false);
  assert.equal(doc.jobs['docker-validation']['runs-on'], 'ubuntu-24.04');
  assert.equal(doc.jobs['electron-regression']['runs-on'], 'windows-2025');
  assert.ok(doc.jobs['electron-regression'].steps.some(s => s.run?.includes('npm run test:electron')));
  for (const job of Object.values(doc.jobs)) {
    if(job.uses) {assert.equal(job.uses,'./.github/workflows/manual-recipes-validation.yml');continue;}
    assert.ok(job['timeout-minutes'] <= 35);
    for (const step of job.steps) {
      assert.equal(step['continue-on-error'], undefined);
      if (step.uses) assert.match(step.uses, /^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
      if (step.uses?.startsWith('actions/checkout')) assert.equal(step.with['persist-credentials'], false);
    }
  }
  assert.doesNotMatch(JSON.stringify(doc), /secrets\.|--no-sandbox|pull_request_target|npm audit fix/);
});

test('runtime start/response/cleanup failures cannot pass and teardown is always scoped to six owned projects', () => {
  for(const stage of ['up','response','down']) temporary(destination=>{
    const calls=[];
    const result=run({ mode:'docker', destination, invoke:simulatedDocker(calls,args=>args.includes(stage)),
      probe:()=>({ok:stage!=='response',reason:'simulated-'+stage}), pause:()=>{} });
    assert.ok(result.cases.every(c=>c.outcome==='FAIL'));
    const down=calls.filter(c=>c.args.includes('down'));
    assert.equal(down.length,6);
    for(const call of down){assert.ok(call.args.includes('-v'));assert.ok(call.args.includes('--remove-orphans'));assert.ok(call.args.includes('--project-name'));}
  });
});

test('fallback cleanup rejects changed Compose or unowned project names before Docker is invoked', () => temporary(destination=>{
  run({destination});
  const manifest=JSON.parse(fs.readFileSync(path.join(destination,'ownership.json')));
  manifest.cases[0].projectName='main-production';
  fs.writeFileSync(path.join(destination,'ownership.json'),JSON.stringify(manifest));
  assert.throws(()=>cleanupSaved(destination,()=>{throw new Error('Must not invoke Docker');}),/Unowned project/);
}));

test('runtime HTTP probe requires a successful expected response and loopback; Compose status JSON supports both formats', async()=>{
  const {probe}=require('../scripts/lib/http-probe.cjs');
  const server=require('node:http').createServer((_req,res)=>{res.end('runtime-fixture-expected');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/`;
    assert.equal((await probe(url,'runtime-fixture-expected')).status,200);
    await assert.rejects(probe(url,'incorrect-marker'));
    await assert.rejects(probe('https://example.invalid','x'));
  } finally { await new Promise(resolve=>server.close(resolve)); }
  assert.equal(parsePS('[{"Service":"test","State":"running"}]')[0].State,'running');
  assert.equal(parsePS('{"Service":"a"}\n{"Service":"b"}').length,2);
});

// 登録型モジュールをDOMなしで読み、本体の共通モデル/シリアライザーを呼ぶ。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const generation = require('../../app/src/project-generation');
const { renderComposeYaml } = require('../../app/src/compose-serialization');
const catalog = require('../../app/data/image-catalog.json');
const root = path.resolve(__dirname, '../..');
const cases = [
  { id: 'nginx', modules: ['nginx'], config: { nginx: { hostPort: 19080, dataStoreType: 'bind', dataStorePath: './fixture-web' } }, http: [{ module: 'nginx', port: 19080, expected: 'docker-builder-ci-static' }] },
  { id: 'apache', modules: ['apache'], config: { apache: { port: 19082, dataStoreType: 'bind', dataStorePath: './fixture-web' } }, http: [{ module: 'apache', port: 19082, expected: 'docker-builder-ci-static' }] },
  { id: 'nodejs', modules: ['nodejs'], config: { nodejs: { hostPort: 19300 } }, http: [{ module: 'nodejs', port: 19300, expected: '"fixture":"docker-builder-ci"' }] },
  { id: 'nginx-nodejs', modules: ['nginx', 'nodejs'], config: { nginx: { hostPort: 19480, dataStoreType: 'bind', dataStorePath: './fixture-web' }, nodejs: { hostPort: 19400 } }, http: [{ module: 'nginx', port: 19480, expected: 'docker-builder-ci-static' }, { module: 'nodejs', port: 19400, expected: '"fixture":"docker-builder-ci"' }] },
  { id: 'flask', modules: ['python-web'], config: { 'python-web': { framework: 'flask', hostPort: 19500, dataStoreType: 'bind', dataStorePath: './python-web' } }, http: [{ module: 'python-web', port: 19500, expected: '"fixture":"docker-builder-ci-flask"' }] },
  { id: 'postgres', modules: ['postgres'], config: { postgres: { port: 19532, dbName: 'ci_fixture', user: 'ci_fixture', password: 'ci-fixture-only-not-secret' } }, db: { port: 19532, database: 'ci_fixture', user: 'ci_fixture', password: 'ci-fixture-only-not-secret' } },
];
function loadModules() {
  const modules = [];
  const context = vm.createContext({ window: { ProjectGeneration: generation }, registerModule: mod => modules.push(mod) });
  for (const name of fs.readdirSync(path.join(root, 'app/src/modules')).sort()) {
    if (name.endsWith('.js')) vm.runInContext(fs.readFileSync(path.join(root, 'app/src/modules', name), 'utf8'), context, { filename: name, timeout: 1000 });
  }
  if (modules.length !== 19) throw new Error('Expected all 19 application modules');
  return modules;
}
function generateCase(id, projectName) {
  const definition = cases.find(c => c.id === id);
  if (!definition) throw new Error('Unknown validation case');
  if (!/^[a-z][a-z0-9-]{0,59}$/.test(projectName)) throw new Error('Invalid CI project name');
  const modules = loadModules().filter(m => definition.modules.includes(m.id));
  // テスト入力をUIの既存フィールドへ渡す。生成済みComposeの書換えは行わない。
  const configs = new Map(modules.map(m => [m.id, { ...Object.fromEntries((m.fields || []).map(f => [f.name, f.default ?? ''])), ...definition.config[m.id] }]));
  const model = generation.build({ modules, configs, catalog, projectName });
  if (model.errors.length) throw new Error(model.errors.join('\n'));
  return { definition, model, compose: renderComposeYaml(model) };
}
const fixtureFiles = ['package.json', 'package-lock.json', 'server.cjs'];
function writeCase(directory, generated) {
  fs.mkdirSync(directory, { recursive: true });
  // UIの個別保存とバイト単位でも一致させ、CI側だけ末尾改行を追加しない。
  fs.writeFileSync(path.join(directory, 'docker-compose.yml'), generated.compose);
  const saved = ['docker-compose.yml'];
  for (const file of generated.model.files) {
    const target = path.resolve(directory, file.relativePath);
    if (!target.startsWith(path.resolve(directory) + path.sep) || path.isAbsolute(file.relativePath) || file.relativePath.includes('\\')) throw new Error('Unsafe generated file path');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
    saved.push(file.relativePath);
  }
  if (generated.definition.modules.includes('nodejs')) for (const name of fixtureFiles) {
    fs.copyFileSync(path.join(root, 'test/fixtures/node-validation', name), path.join(directory, 'nodejs', name));
    saved.push(`nodejs/${name}`);
  }
  if (generated.definition.modules.some(id => ['nginx', 'apache'].includes(id))) {
    fs.mkdirSync(path.join(directory, 'fixture-web'), { recursive: true });
    fs.copyFileSync(path.join(root, 'test/fixtures/web-validation/index.html'), path.join(directory, 'fixture-web/index.html'));
    saved.push('fixture-web/index.html');
  }
  if (generated.definition.modules.includes('python-web')) for (const name of ['app.py', 'requirements.txt']) {
    fs.copyFileSync(path.join(root, 'test/fixtures/flask-validation', name), path.join(directory, 'python-web', name));
    saved.push(`python-web/${name}`);
  }
  return saved;
}
module.exports = { cases, generateCase, writeCase, fixtureFiles, loadModules };

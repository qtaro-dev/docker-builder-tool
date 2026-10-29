// GUIと同じ生成器で検証。旧配布例との差分はWeb追加ファイルに限定して照合する。
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {root} = require('./manual-recipe-plan.cjs');
const {loadModules} = require('./headless-generation.cjs');
const {build} = require('../../app/src/project-generation');
const {renderComposeYaml} = require('../../app/src/compose-serialization');
const catalog = require('../../app/data/image-catalog.json');
function files(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'Symlinks are not recipe fixtures');
    return entry.isDirectory() ? files(path.join(directory, entry.name), prefix + entry.name + '/') : [prefix + entry.name];
  });
}
function prepare(recipe, directory) {
  assert.match(recipe.id, /^[a-z0-9-]+$/);
  const order = [...fs.readFileSync(path.join(root, 'app/src/renderer.js'), 'utf8').matchAll(/import "\.\/modules\/([^"\n]+)"/g)].map(m => fs.readFileSync(path.join(root, 'app/src/modules', m[1]), 'utf8').match(/\bid:\s*"([^"]+)"/)[1]);
  const modules = loadModules().filter(m => recipe.modules.includes(m.id)).sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id));
  assert.equal(modules.length, recipe.modules.length);
  const model = build({modules, configs: new Map(Object.entries(recipe.configs)), catalog, projectName: recipe.projectName});
  assert.deepEqual(model.errors, []);
  const generated = [{relativePath: 'docker-compose.yml', content: renderComposeYaml(model)}, ...model.files];
  const source = path.join(root, 'docs/manual/examples', recipe.id);
  const yaml=require('js-yaml');
  const legacy=yaml.load(fs.readFileSync(path.join(source,'generated/docker-compose.yml'),'utf8'));
  const current=yaml.load(generated[0].content), comparable=structuredClone(current);
  for(const id of ['nginx','apache']) {
    const name=recipe.projectName+'-'+id,svc=comparable.services[name],old=legacy.services[name];if(!svc||!old)continue;
    assert.equal(recipe.configs[id]?.reverseProxy||'off','off','Legacy recipe proxy settings require explicit fixture updates');
    svc.volumes=svc.volumes.filter(v=>!v.startsWith('./'+id+'/conf/'));
    if(!old.build&&svc.build){assert.equal(svc.build.context,'./'+id);delete svc.build;svc.image=model.images.find(e=>e.moduleId===id).image;}
    if(id==='apache'&&!old.command)delete svc.command;
  }
  assert.deepEqual(comparable,legacy,recipe.id+' unexpected change outside Web support assets');
  fs.mkdirSync(directory, {recursive: true});
  for (const file of generated) {
    const prior=path.join(source,'generated',file.relativePath);
    if(file.relativePath!=='docker-compose.yml'&&fs.existsSync(prior))assert.equal(fs.readFileSync(prior,'utf8'),file.content,recipe.id+' distributed output differs from application');
    const target = path.join(directory, file.relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});fs.writeFileSync(target, file.content);
  }
  const additions = files(path.join(source, 'additions'));
  for (const file of additions) {
    const target = path.join(directory, file);
    // Webコンテンツの利用者置換だけ許可し、設定やComposeの上書きは従来どおり禁止する。
    assert.ok(!fs.existsSync(target)||generated.some(f=>f.relativePath===file&&f.filename==='index.html'),'Additional fixture overwrites generated output');
    fs.mkdirSync(path.dirname(target), {recursive: true});fs.copyFileSync(path.join(source, 'additions', file), target);
  }
  const ciFixture=[];
  if(recipe.modules.includes('laravel')) {
    const fixture=path.join(root,'test/fixtures/laravel-recipe');
    for(const file of files(fixture).filter(f=>f!=='README.md')) {
      const target=path.join(directory,'laravel',file);assert.ok(!fs.existsSync(target),'CI fixture overwrites recipe files');
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(fixture,file),target);ciFixture.push('laravel/'+file);
    }
    const env=fs.readFileSync(path.join(directory,'laravel/.env.example'),'utf8').replace(/^APP_KEY=.*$/m,'APP_KEY=base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    fs.writeFileSync(path.join(directory,'laravel/.env'),env);
    for(const sub of ['app','bootstrap/cache','storage/logs','storage/framework/views','storage/framework/sessions','storage/framework/cache'])fs.mkdirSync(path.join(directory,'laravel',sub),{recursive:true});
  }
  const document=yaml.load(generated[0].content);
  for(const service of Object.values(document.services)) if(service.build) {
    const dockerfile=path.resolve(directory,service.build.context,service.build.dockerfile);
    assert.ok(dockerfile.startsWith(path.resolve(directory)+path.sep),'Build path escapes workspace');
    assert.ok(fs.statSync(dockerfile).isFile());
  }
  if(additions.includes('compose.manual.yml')) {
    const overlay=yaml.load(fs.readFileSync(path.join(directory,'compose.manual.yml'),'utf8'));
    for(const [name,service] of Object.entries(overlay.services||{})) {
      assert.ok(document.services[name],'Overlay references missing generated service');
      for(const item of service.volumes||[]) if(typeof item==='string'&&item.startsWith('./')) assert.ok(fs.existsSync(path.join(directory,item.split(':')[0])),'Missing added mount');
      for(const name of Array.isArray(service.depends_on)?service.depends_on:Object.keys(service.depends_on||{})) assert.ok(document.services[name],'Missing dependency');
    }
  }
  return {model, generated: generated.map(f => f.relativePath), additions,ciFixture};
}
module.exports = {prepare, files};

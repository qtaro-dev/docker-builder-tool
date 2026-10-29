const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const {loadModules}=require(path.join(root,'scripts/lib/headless-generation.cjs'));
const {build}=require(path.join(root,'app/src/project-generation'));
const {renderComposeYaml}=require(path.join(root,'app/src/compose-serialization'));
const catalog=require(path.join(root,'app/data/image-catalog.json'));
const data=require(path.join(__dirname,'recipe-inputs.json'));
const order=[...fs.readFileSync(path.join(root,'app/src/renderer.js'),'utf8').matchAll(/import "\.\/modules\/([^"\n]+)"/g)].map(m=>fs.readFileSync(path.join(root,'app/src/modules',m[1]),'utf8').match(/\bid:\s*"([^"]+)"/)[1]);
const modules=loadModules().sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
for(const r of data){
 const configs=new Map(Object.entries(r.configs));
 const model=build({modules:modules.filter(m=>r.modules.includes(m.id)),configs,catalog,projectName:r.projectName});
 assert.deepEqual(model.errors,[],r.id);
 assert.equal(renderComposeYaml(model),fs.readFileSync(path.join(root,'docs/manual/examples',r.id,'generated/docker-compose.yml'),'utf8'),r.id);
 for(const f of model.files)assert.equal(f.content,fs.readFileSync(path.join(root,'docs/manual/examples',r.id,'generated',f.relativePath),'utf8'),r.id+' '+f.relativePath);
}
fs.writeFileSync(path.join(__dirname,'qa/generation-result.json'),JSON.stringify({recipes:data.length,matchedCurrentGenerator:true,dockerRun:false},null,2));
console.log('PASS',data.length,'distributed Compose/Dockerfile sets equal current application generator; no Docker execution');

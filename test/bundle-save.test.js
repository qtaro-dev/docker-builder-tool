const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),io=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {saveBundle,projectFolderName}=require('../app/bundle-save');
const {generateCase}=require('../scripts/lib/headless-generation.cjs');
const {renderComposeYaml}=require('../app/src/compose-serialization');
async function temporary(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbt-bundle-'));try{await fn(dir);}finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}}
const basic=[{relativePath:'docker-compose.yml',content:'new compose'},{relativePath:'nginx/conf/default.conf',content:'new conf'},{relativePath:'nginx/html/index.html',content:'new html'}];
const reject=()=>{throw new Error('Unexpected confirmation');};
test('bundle uses myapp and retains generated Nginx/Node files and Compose references',()=>temporary(async parent=>{
 const generated=generateCase('nginx-nodejs','myapp');
 const files=[{relativePath:'docker-compose.yml',content:renderComposeYaml(generated.model)},...generated.model.files];
 const result=await saveBundle({parent,projectName:'myapp',files,conflict:reject,overwrite:reject});
 assert.equal(result.path,path.join(parent,'myapp'));
 for(const file of files)assert.equal(fs.readFileSync(path.join(result.path,file.relativePath),'utf8'),file.content);
 const compose=require('js-yaml').load(fs.readFileSync(path.join(result.path,'docker-compose.yml'),'utf8'));
 for(const svc of Object.values(compose.services)){if(svc.build)assert.ok(fs.statSync(path.join(result.path,svc.build.context,svc.build.dockerfile)).isFile());for(const mount of svc.volumes||[])if(mount.startsWith('./')&&mount.includes('/conf/'))assert.ok(fs.statSync(path.join(result.path,mount.split(':')[0])).isFile());}
 assert.deepEqual(fs.readdirSync(parent),['myapp']);
}));
test('existing folder is unchanged on conflict or overwrite cancellation; alternative proposes next available suffix',()=>temporary(async parent=>{
 const root=path.join(parent,'myapp');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'docker-compose.yml'),'old');fs.mkdirSync(path.join(parent,'myapp-2'));
 let proposal;
 const args={parent,projectName:'myapp',files:basic,overwrite:reject};
 assert.deepEqual(await saveBundle({...args,conflict:async p=>{proposal=p;return 'cancel';}}),{canceled:true});
 assert.equal(proposal.alternative,path.join(parent,'myapp-3'));assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'old');
 let confirm;
 assert.deepEqual(await saveBundle({...args,conflict:async()=> 'existing',overwrite:async p=>{confirm=p;return false;}}),{canceled:true});
 assert.deepEqual(confirm.overwritten,['docker-compose.yml']);assert.equal(confirm.added.length,2);assert.equal(fs.existsSync(path.join(root,'nginx')),false);
 const alt=await saveBundle({...args,conflict:async()=> 'alternative'});assert.equal(alt.path,path.join(parent,'myapp-3'));assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'old');
}));
test('confirmed overwrite replaces only listed files and preserves application sources and unrelated data',()=>temporary(async parent=>{
 const root=path.join(parent,'myapp');fs.mkdirSync(path.join(root,'nodejs'),{recursive:true});fs.writeFileSync(path.join(root,'nodejs/server.cjs'),'user application');fs.writeFileSync(path.join(root,'docker-compose.yml'),'old');fs.writeFileSync(path.join(root,'notes.txt'),'keep');
 const result=await saveBundle({parent,projectName:'myapp',files:basic,conflict:async()=> 'existing',overwrite:async p=>{assert.deepEqual(p.overwritten,['docker-compose.yml']);return true;}});
 assert.equal(result.path,root);assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'new compose');assert.equal(fs.readFileSync(path.join(root,'nodejs/server.cjs'),'utf8'),'user application');assert.equal(fs.readFileSync(path.join(root,'notes.txt'),'utf8'),'keep');assert.deepEqual(fs.readdirSync(parent),['myapp']);
}));
test('staging failure leaves originals untouched and partial commit failure rolls every replaced file back',()=>temporary(async parent=>{
 const root=path.join(parent,'myapp');fs.mkdirSync(path.join(root,'nginx/conf'),{recursive:true});fs.writeFileSync(path.join(root,'docker-compose.yml'),'old compose');fs.writeFileSync(path.join(root,'nginx/conf/default.conf'),'old conf');
 const args={parent,projectName:'myapp',files:basic,conflict:async()=> 'existing',overwrite:async()=>true};
 await assert.rejects(saveBundle({...args,io:{...io,writeFile:async(p,...args)=>{if(path.basename(p)==='new-1')throw Object.assign(new Error('disk full'),{code:'ENOSPC'});return io.writeFile(p,...args);}}}),/disk full/);
 let failed=false;
 await assert.rejects(saveBundle({...args,io:{...io,rename:async(from,to)=>{if(!failed&&path.basename(from)==='new-1'){failed=true;throw new Error('simulated rename failure');}return io.rename(from,to);}}}),/rename failure/);
 assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'old compose');assert.equal(fs.readFileSync(path.join(root,'nginx/conf/default.conf'),'utf8'),'old conf');assert.equal(fs.existsSync(path.join(root,'nginx/html')),false);assert.deepEqual(fs.readdirSync(parent),['myapp']);
}));
test('changes after confirmation are not overwritten; links and reserved folder names are rejected',()=>temporary(async parent=>{
 for(const name of ['../x','a/b','C:\\x','CON','con','nul','com1','myapp.','my app','a:b','',undefined])assert.throws(()=>projectFolderName(name));
 assert.equal(projectFolderName('myapp_1'),'myapp_1');
 const root=path.join(parent,'myapp');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'docker-compose.yml'),'old');
 await assert.rejects(saveBundle({parent,projectName:'myapp',files:basic,conflict:async()=> 'existing',overwrite:async()=>{fs.writeFileSync(path.join(root,'docker-compose.yml'),'changed by another process');return true;}}),/変更/);
 assert.equal(fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8'),'changed by another process');
 const outside=path.join(parent,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,'nginx'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(saveBundle({parent,projectName:'myapp',files:basic,conflict:async()=> 'existing',overwrite:async()=>true}),/フォルダ/);assert.deepEqual(fs.readdirSync(outside),[]);
}));

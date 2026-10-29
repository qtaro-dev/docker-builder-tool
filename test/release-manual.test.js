const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {describeApp}=require('../app-info');
const {manualDirectory,openUserManual}=require('../user-manual');
const {pathToFileURL}=require('node:url');
test('SemVer and Release display are separate and title follows package metadata',()=>{
  const pkg=require('../package.json'),lock=require('../package-lock.json');
  assert.equal(pkg.version,'0.3.0');assert.equal(pkg.release.number,1);
  assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(describeApp().displayVersion,'0.3.0 Release 1');
  assert.equal(describeApp('0.3.1').title,'Docker Builder Tool 0.3.1 Release 1');
});
test('portable paths persist beside launcher rather than extracted executable and remain separate from installed profile',()=>{
  const {applicationPaths}=require('../app-paths');
  const base=path.resolve(os.tmpdir(),'dbt-paths');
  const input={isPackaged:true,exePath:path.join(base,'temp/extract/app.exe'),appDirectory:path.join(base,'temp/extract/resources/app.asar'),userDataDirectory:path.join(base,'roaming/docker-builder'),portableDirectory:path.join(base,'portable')};
  const portable=applicationPaths(input);assert.equal(portable.appRoot,input.portableDirectory);assert.equal(portable.userData,path.join(input.portableDirectory,'data'));
  const installed=applicationPaths({...input,portableDirectory:undefined});assert.equal(installed.appRoot,path.dirname(input.exePath));assert.equal(installed.userData,input.userDataDirectory);
  assert.equal(applicationPaths({...input,isPackaged:false}).appRoot,input.appDirectory);
});
test('log uses application root and falls back to userData when root cannot be used',()=>{
  const {writableLogPath}=require('../app-paths');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dbt-log-path-'));
  try {
    const appRoot=path.join(tmp,'app'),user=path.join(tmp,'data');assert.equal(writableLogPath(appRoot,user),path.join(appRoot,'docker-builder.log'));
    const unusable=path.join(tmp,'not-a-directory');fs.writeFileSync(unusable,'do not overwrite');assert.equal(writableLogPath(unusable,user),path.join(user,'docker-builder.log'));assert.equal(fs.readFileSync(unusable,'utf8'),'do not overwrite');
  } finally {assert.equal(path.dirname(tmp),path.resolve(os.tmpdir()));fs.rmSync(tmp,{recursive:true,force:true});}
});
test('portable manual cache retains relative assets after temporary resources are removed',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dbt-portable-manual-'));
  try {
    const resources=path.join(tmp,'unpacked/resources'),source=path.join(resources,'manual'),cache=path.join(tmp,'portable/data/manual/0.3.0-release1');fs.mkdirSync(path.join(source,'images'),{recursive:true});
    for(const [name,text] of [['index.html','<link href="manual.css"><img src="images/example.png">'],['manual.css','body{}'],['recipes.html','recipes'],['images/example.png','sample bytes']])fs.writeFileSync(path.join(source,name),text);
    const opened=[];await openUserManual({isPackaged:true,resourcesPath:resources,manualCacheDirectory:cache,shell:{openExternal:async url=>opened.push(url)}});
    assert.equal(opened[0],pathToFileURL(path.join(cache,'index.html')).href);
    fs.rmSync(path.join(tmp,'unpacked'),{recursive:true});
    assert.ok(fs.existsSync(path.join(cache,'manual.css')));assert.ok(fs.existsSync(path.join(cache,'recipes.html')));assert.equal(fs.readFileSync(path.join(cache,'images/example.png'),'utf8'),'sample bytes');
  } finally {assert.equal(path.dirname(tmp),path.resolve(os.tmpdir()));fs.rmSync(tmp,{recursive:true,force:true});}
});
test('installer and portable have distinct artifact names and junk exclusions',()=>{
  const build=require('../package.json').build;
  assert.deepEqual(build.win.target.map(t=>t.target),['nsis','portable']);assert.notEqual(build.nsis.artifactName,build.portable.artifactName);assert.equal(build.nsis.createStartMenuShortcut,true);
  assert.ok(build.extraResources[0].filter.includes('!**/Thumbs.db'));assert.ok(build.files.includes('!**/Thumbs.db'));
});
test('manual opens the fixed real index in dev and packaged resources, with safe file URL encoding',async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dbt-manual-path-'));
  try{
    for(const isPackaged of [false,true]){
      const options={isPackaged,resourcesPath:path.join(tmp,'配布 resources'),appDirectory:path.join(tmp,'開発 app')};
      const dir=manualDirectory(options);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),'<!doctype html>');
      const urls=[];await openUserManual({...options,shell:{openExternal:async url=>urls.push(url)}});
      assert.deepEqual(urls,[pathToFileURL(path.join(dir,'index.html')).href]);
      await assert.rejects(openUserManual({...options,shell:{openExternal:async()=>{throw new Error('no browser');}}}),/no browser/);
    }
    await assert.rejects(openUserManual({isPackaged:false,appDirectory:path.join(tmp,'missing'),shell:{openExternal:()=>assert.fail('must not open')}}),/ENOENT/);
  }finally{assert.equal(path.dirname(tmp),path.resolve(os.tmpdir()));fs.rmSync(tmp,{recursive:true,force:true});}
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

async function verify() {
const root = path.resolve(__dirname, '..');
const archive = path.resolve(process.argv[2] || path.join(root, 'release/win-unpacked/resources/app.asar'));
const entries = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
const files = entries.filter(name => !asar.statFile(archive, path.normalize(name)).files);
const expected = ['main.js', 'preload.js', 'security.js', 'image-catalog.js', 'app-info.js', 'app-paths.js', 'user-manual.js', 'package.json'];
const junk = relative => relative.split('/').some(p=>['thumbs.db','desktop.ini','.ds_store'].includes(p.toLowerCase()));
function walk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) walk(relative);
    else if(!junk(relative)) expected.push(relative);
  }
}
walk('app');
assert.deepEqual([...files].sort(), expected.sort(), 'Only application runtime files may be distributed');
for (const file of files.filter(name => name !== 'package.json')) {
  assert.deepEqual(asar.extractFile(archive, path.normalize(file)), fs.readFileSync(path.join(root, file)), `${file} differs from source`);
}
const manifest = JSON.parse(asar.extractFile(archive, 'package.json'));
const source = require('../package.json');
assert.equal(manifest.version, source.version);
assert.deepEqual(manifest.release, source.release);
assert.equal(manifest.main, 'main.js');
assert.equal(source.devDependencies.electron, '45.0.0');
assert.equal(files.filter(name => /^app\/src\/modules\/.*\.js$/.test(name)).length, 19);
const resources = fs.readdirSync(path.dirname(archive));
const expectedResources=['app.asar','manual'];
if(resources.includes('elevate.exe')) {
  assert.notEqual(process.argv[3],'installer','Installer has elevation helper disabled');
  // Portable/共有展開物ではビルダー標準ヘルパーが追加される。任意のEXEは許可しない。
  const cache=path.join(process.env.LOCALAPPDATA,'electron-builder','Cache');
  const candidates=[];
  for(const outer of fs.readdirSync(cache,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('nsis-'))) {
    const folder=path.join(cache,outer.name);
    for(const inner of fs.readdirSync(folder,{withFileTypes:true}).filter(e=>e.isDirectory())) {
      const file=path.join(folder,inner.name,'elevate.exe');if(fs.existsSync(file))candidates.push(file);
    }
  }
  const binary=fs.readFileSync(path.join(path.dirname(archive),'elevate.exe'));
  assert.ok(candidates.some(file=>binary.equals(fs.readFileSync(file))),'Only exact builder-provided cached elevation helper allowed');
  expectedResources.push('elevate.exe');
}
assert.deepEqual(resources.sort(), expectedResources.sort(), 'Only known runtime resources and official manual may be bundled');
const manualRoot=path.join(root,'docs/manual'),packagedManual=path.join(path.dirname(archive),'manual');
function walkFiles(directory,prefix='') {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walkFiles(path.join(directory,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);
}
const allowed=['index.html','recipes.html','manual.css','manual.js',...['art','images','icons','examples'].flatMap(dir=>walkFiles(path.join(manualRoot,dir),dir+'/'))].filter(f=>!junk(f)&&!f.endsWith('.log')&&!f.split('/').some(p=>['.env','node_modules','vendor'].includes(p)));
const bundled=walkFiles(packagedManual);assert.deepEqual(bundled.sort(),allowed.sort(),'No old/QA/ZIP or unrelated development files in manual');
for(const name of bundled)assert.deepEqual(fs.readFileSync(path.join(packagedManual,name)),fs.readFileSync(path.join(manualRoot,name)),name+' manual source bytes');
console.log(`PASS packaged ${manifest.version} Release ${manifest.release.number}: ${files.length} runtime files, ${bundled.length} manual files, 19 modules, exact source bytes; no settings/logs/tests/credentials/old manual/ZIP`);
}
verify().catch(error=>{console.error(error);process.exitCode=1;});

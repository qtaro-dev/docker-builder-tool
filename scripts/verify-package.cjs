const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const archive = path.resolve(process.argv[2] || path.join(root, 'release/win-unpacked/resources/app.asar'));
const entries = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
const files = entries.filter(name => !asar.statFile(archive, path.normalize(name)).files);
const expected = ['main.js', 'preload.js', 'security.js', 'image-catalog.js', 'package.json'];
function walk(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) walk(relative);
    else expected.push(relative);
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
assert.equal(manifest.main, 'main.js');
assert.equal(source.devDependencies.electron, '45.0.0');
assert.equal(files.filter(name => /^app\/src\/modules\/.*\.js$/.test(name)).length, 19);
const resources = fs.readdirSync(path.dirname(archive));
assert.deepEqual(resources.sort(), ['app.asar'], 'No extra files may be bundled beside app.asar');
console.log(`PASS packaged ${manifest.version}: ${files.length} runtime files, 19 modules, exact source bytes; no settings, logs, tests, credentials or dev dependencies`);

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const asar = require('@electron/asar');

test('About illustration stays byte-identical and its relative resource survives ASAR packaging', async () => {
  const root = path.resolve(__dirname, '..');
  const resource = fs.readFileSync(path.join(root, 'app/assets/about-penguin-whale.png'));
  assert.equal(require('node:crypto').createHash('sha256').update(resource).digest('hex'), '1690b43494ef7d3376065a176a4a30c869cb607d40d2373c82f8f08dbd3f0fa8', 'Do not process the supplied illustration');
  const manifest = require('../package.json');
  assert.ok(manifest.build.files.includes('app/**/*'), 'Illustration must use the packaged runtime subtree');
  const scratchRoot = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(scratchRoot, 'docker-builder-about-'));
  try {
    const archive = path.join(scratch, 'app-resources.asar');
    await asar.createPackage(path.join(root, 'app'), archive);
    const html = asar.extractFile(archive, 'index.html').toString('utf8');
    const imagePath = html.match(/class="about-illustration" src="([^"]+)"/)[1];
    assert.equal(imagePath, './assets/about-penguin-whale.png');
    assert.deepEqual(asar.extractFile(archive, path.normalize(imagePath)), resource);
  } finally {
    assert.equal(path.dirname(scratch), scratchRoot);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

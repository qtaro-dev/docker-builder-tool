// SemVerと画面用のリリース番号を分離する。About・ウィンドウタイトルで共通利用する。
const manifest = require('./package.json');
function describeApp(version = manifest.version) {
  const releaseNumber = manifest.release.number;
  if (!Number.isInteger(releaseNumber) || releaseNumber < 1) throw new Error('Invalid release number');
  const displayVersion = `${version} Release ${releaseNumber}`;
  return { version, releaseNumber, displayVersion, title: `Docker Builder Tool ${displayVersion}` };
}
module.exports = { describeApp };

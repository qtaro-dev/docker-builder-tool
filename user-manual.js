// ブラウザが読める実ファイルだけを使う。Rendererから任意パスやURLを受け取らない。
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
function manualDirectory({ isPackaged, resourcesPath, appDirectory }) {
  return isPackaged ? path.join(resourcesPath, 'manual') : path.join(appDirectory, 'docs', 'manual');
}
async function openUserManual({ isPackaged, resourcesPath, appDirectory, manualCacheDirectory, shell }) {
  let root = manualDirectory({ isPackaged, resourcesPath, appDirectory });
  if (isPackaged && manualCacheDirectory) {
    // Portable終了で展開先が消えても、ブラウザの画像・リンクが壊れないよう永続コピーを開く。
    await fs.promises.mkdir(manualCacheDirectory,{recursive:true});
    await fs.promises.cp(root,manualCacheDirectory,{recursive:true,force:true});
    root=manualCacheDirectory;
  }
  const index = path.join(root, 'index.html');
  if (!(await fs.promises.stat(index)).isFile()) throw new Error('User manual index.html is missing');
  await shell.openExternal(pathToFileURL(index).href);
}
module.exports = { manualDirectory, openUserManual };

// Portableランチャーの一時展開先と、永続データの場所を混同しない。
const fs = require('node:fs');
const path = require('node:path');
function applicationPaths({isPackaged,exePath,appDirectory,userDataDirectory,portableDirectory}) {
  const portable = Boolean(isPackaged && portableDirectory && path.isAbsolute(portableDirectory));
  const appRoot = portable ? path.resolve(portableDirectory) : isPackaged ? path.dirname(exePath) : appDirectory;
  return {portable, appRoot, userData: portable ? path.join(appRoot,'data') : userDataDirectory};
}
function writableLogPath(appRoot,userData) {
  // 設定と同様にルートを優先し、書けない場合だけuserDataへ退避する。
  for(const directory of [...new Set([appRoot,userData])]) {
    try {
      fs.mkdirSync(directory,{recursive:true});
      const file=path.join(directory,'docker-builder.log');
      const handle=fs.openSync(file,'a');fs.closeSync(handle);return file;
    } catch {}
  }
  throw new Error('ログの保存先に書き込めません。');
}
module.exports={applicationPaths,writableLogPath};

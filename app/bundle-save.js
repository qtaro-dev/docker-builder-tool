// 一式保存の衝突確認とトランザクション。既存の利用者ファイルを再帰削除しない。
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const locks = new Set();

function projectFolderName(value) {
  // rendererの既存sanitizeNameが返す形式を、IPC境界で厳密に検査する。
  if (typeof value !== 'string' || !/^[a-z0-9_-]{1,100}$/.test(value) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) {
    throw new TypeError('プロジェクト名に使用できないフォルダ名です。英数字・ハイフン・アンダースコアを使用し、Windows予約名を避けてください。');
  }
  return value;
}
const digest = content => crypto.createHash('sha256').update(content).digest('hex');
async function stat(io, target) {
  try { return await io.lstat(target); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function directory(io, target) {
  const s = await stat(io, target);
  if (!s || s.isSymbolicLink() || !s.isDirectory()) throw new Error('保存先または途中のフォルダが通常のフォルダではありません：' + target);
}
async function inspect(io, destination, files) {
  await directory(io, destination);
  const plan = [];
  for (const file of files) {
    const segments = file.relativePath.split('/');
    let folder = destination;
    for (const segment of segments.slice(0, -1)) {
      folder = path.join(folder, segment);
      const s = await stat(io, folder);
      if (s && (s.isSymbolicLink() || !s.isDirectory())) throw new Error('保存パスに通常のフォルダ以外が存在します：' + folder);
    }
    const target = path.join(destination, ...segments), s = await stat(io, target);
    if (s && (s.isSymbolicLink() || !s.isFile())) throw new Error('保存対象が通常のファイルではありません：' + target);
    plan.push({...file, target, before: s ? digest(await io.readFile(target)) : null});
  }
  return plan;
}
async function removeStage(io, stage, parent) {
  // Windowsの再帰削除は、実際に作成した一時フォルダの絶対パスだけに限定する。
  if (path.dirname(path.resolve(stage)) !== path.resolve(parent) || !path.basename(stage).startsWith('.docker-builder-save-')) throw new Error('Unsafe temporary directory');
  await io.rm(stage, {recursive:true, force:true});
}
async function writeTransaction({destination, files, existing, expected, io = fs}) {
  const key = path.resolve(destination).toLowerCase();
  if (locks.has(key)) throw new Error('この保存先には別の保存処理を実行中です。完了後に再試行してください。');
  locks.add(key);
  const parent = path.dirname(destination);
  let stage, createdRoot = false;
  const changed = [], directories = [];
  try {
    if (existing) await directory(io, destination);
    else { await io.mkdir(destination); createdRoot = true; }
    const plan = await inspect(io, destination, files);
    if (expected && plan.some((f, i) => f.before !== expected[i].before)) throw new Error('確認後に保存対象が変更されました。保存し直してください。');
    stage = await io.mkdtemp(path.join(parent, '.docker-builder-save-'));
    // 全内容を書き終えるまで既存ファイルには触れない。
    for (let i = 0; i < plan.length; i++) await io.writeFile(path.join(stage, 'new-' + i), plan[i].content, {encoding:'utf8',flag:'wx'});
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      const current = (await inspect(io, destination, [item]))[0];
      if (current.before !== item.before) throw new Error('保存処理中に対象ファイルが変更されました。保存し直してください。');
      let folder = destination;
      for (const segment of item.relativePath.split('/').slice(0, -1)) {
        folder = path.join(folder, segment);
        if (!(await stat(io, folder))) { await io.mkdir(folder); directories.push(folder); }
        await directory(io, folder);
      }
      const change = {target:item.target, backup:path.join(stage,'old-'+i), written:false, backedUp:false, hash:digest(item.content)};
      changed.push(change);
      if (item.before !== null) { await io.rename(item.target, change.backup); change.backedUp = true; }
      await io.rename(path.join(stage,'new-'+i), item.target); change.written = true;
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const item of changed.reverse()) {
      try {
        if (item.written) {
          const s = await stat(io, item.target);
          if (s) {
            if (s.isSymbolicLink() || !s.isFile() || digest(await io.readFile(item.target)) !== item.hash) throw new Error('保存後に別の変更があります');
            await io.unlink(item.target);
          }
        }
        if (item.backedUp) {
          if (await stat(io, item.target)) throw new Error('復元先が使用されています');
          await io.rename(item.backup, item.target);
        }
      } catch { rollbackFailed = true; }
    }
    for (const folder of directories.reverse()) { try { await io.rmdir(folder); } catch { /* 空でない利用者フォルダは保持。 */ } }
    if (createdRoot) { try { await io.rmdir(destination); } catch { /* 別プロセスが追加したファイルは削除しない。 */ } }
    if (stage && !rollbackFailed) { try { await removeStage(io,stage,parent); } catch { /* 原本の復元を優先。 */ } }
    if (rollbackFailed) throw new Error('保存に失敗し、一部の復元を完了できませんでした。退避データを保持しています：' + stage, {cause:error});
    throw error;
  } finally { locks.delete(key); }
  // 保存完了後の一時領域削除失敗は、保存そのものの失敗とは区別する。
  let warning = '';
  try { await removeStage(io,stage,parent); } catch { warning = '保存は完了しましたが、一時退避データを削除できませんでした：' + stage; }
  return {canceled:false,path:destination,warning};
}
async function saveBundle({parent, projectName, files, conflict, overwrite, io = fs}) {
  const name = projectFolderName(projectName);
  // 選択した親の実パスを基準にし、その下のリンク/ジャンクションは許可しない。
  parent = await io.realpath(parent); await directory(io,parent);
  const destination = path.join(parent,name);
  if (!(await stat(io,destination))) return writeTransaction({destination,files,existing:false,io});
  await directory(io,destination);
  let suffix=2, alternative;
  do { alternative=path.join(parent,name+'-'+suffix++); } while(await stat(io,alternative));
  const choice = await conflict({destination,alternative});
  if (choice === 'cancel') return {canceled:true};
  if (choice === 'alternative') return writeTransaction({destination:alternative,files,existing:false,io});
  if (choice !== 'existing') throw new Error('不正な保存先の選択です。');
  const plan = await inspect(io,destination,files);
  if (!(await overwrite({destination,overwritten:plan.filter(f=>f.before!==null).map(f=>f.relativePath),added:plan.filter(f=>f.before===null).map(f=>f.relativePath)}))) return {canceled:true};
  return writeTransaction({destination,files,existing:true,expected:plan,io});
}
module.exports = {saveBundle, projectFolderName};

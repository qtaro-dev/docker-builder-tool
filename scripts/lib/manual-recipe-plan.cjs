// マニュアルの入力定義を唯一の一覧として使い、6件ずつの検証計画を作る。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const recipes = require('../../tools/manual/recipe-inputs.json');
const BATCH_SIZE = 6;
function batches() {
  return Array.from({length: Math.ceil(recipes.length / BATCH_SIZE)}, (_, i) => ({
    batch: i + 1, recipes: recipes.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
  }));
}
function batch(number) {
  const selected = batches().find(b => b.batch === Number(number));
  assert.ok(selected, 'Unknown recipe batch');
  return selected.recipes;
}
function prerequisites(recipe, directory, {dependencies=false}={}) {
  // Laravelは利用者がフレームワーク本体を用意する仕様。架空の代替アプリで合格にしない。
  if (!recipe.modules.includes('laravel')) return [];
  return ['artisan', 'composer.json', '.env', 'routes/web.php',...(dependencies?['composer.lock','vendor/autoload.php']:[])].filter(p => !fs.existsSync(path.join(directory, 'laravel', p)));
}
function scope(recipe) {
  if (recipe.id === 'portainer-ui') return 'Portainer初期UI/API。Docker管理接続はレシピ自体の対象外';
  if (recipe.id === 'ollama-basic') return 'Ollama起動・API。モデル取得・推論はレシピ自体の対象外';
  if (recipe.id === 'jenkins-basic') return 'Jenkins起動・初期UI。プラグイン/管理者設定後のPipeline実行はこの起動検査の対象外';
  if (recipe.id === 'nginx-wordpress-mariadb-admin') return 'プロキシ・CMS/DB・管理UI・バックアップと別プロジェクトへの復旧';
  if (recipe.modules.includes('redis') && recipe.modules.includes('postgres')) return 'HTTP→プロキシ→アプリ→DB/Redis、更新・失効・TTL・障害/回復';
  if (recipe.modules.includes('laravel')) return '実LaravelのHTTP→DB接続（フレームワーク/依存の準備が必要）';
  return '全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携';
}
module.exports = { root, recipes, BATCH_SIZE, batches, batch, prerequisites, scope };

# 正規マニュアルの検査（開発者向け）

全レシピを最大6件ずつGitHubのDocker環境で構築する計画は[recipe-ci.md](recipe-ci.md)、初期チェックリストは[recipe-ci-checklist.md](recipe-ci-checklist.md)を参照してください。実Actions実行前の項目にはOKを付けません。

配布対象は `docs/manual/` 一式のみです。HTML2ページ、CSS・JavaScript、art・images・icons・examplesで構成されます。

- 操作ガイド表紙の「レシピ集を開く」で、キャラクター付きレシピ表紙へ移動します。
- レシピ表紙の「操作ガイドへ戻る」と両ページ末尾のリンクで往復できます。
- 元のdocs691ファイルは `docs/OLD/` へ無変更で退避しています。アーカイブのマニフェストは `docs/OLD/docs-archive-manifest-2026-10-27.json`。
- READMEの技術資料リンクはOLDへ、画面画像は現行マニュアルの画像へ更新しました。

リポジトリルートで実行します。

```powershell
python tools/manual/verify.py
node tools/manual/verify-generation.cjs
npm test
```

`verify-browser.cjs`はElectronでローカルHTMLを開く専用描画試験です。子プロセスのELECTRON_RUN_AS_NODEを除外して起動してください。証跡・隔離プロファイルはこのフォルダの`qa/`に保存し、公開用docsには置きません。

Chromiumでページ往復・レシピ側キャラクター・全画像・目次10章・全レシピの遷移・検索・初級/中級/上級の絞り込み・解除・拡大/閉じる/Esc・1280×720/560px・オフライン表示・A4印刷用CSSを検証します。PDFや実印刷は行いません。

公開UIにはレシピ件数の固定表示と検証区分バッジ・絞り込みを表示しません。必要な追加設定・利用上の注意は本文に残しています。


全ハイパーリンクの検査：`python tools/manual/audit-links.py`。HTMLサンプルを含む全HTMLを走査し、ファイルとフラグメントを確認します。`verify-link-targets.cjs`をElectronで起動すると、各実体ファイルが表示されるかダウンロードを開始するかも確認します（保存は取り消す）。HTMLサンプルの別画面表示と元マニュアルの維持も検証します。

## 難易度と上級サンプル

難易度は必要な追加設定・連携・切り分けの複雑さで分類し、各記事に理由を記載しています。現在の入力定義は`recipe-inputs.json`に保持します。生成確認は現行アプリの共通生成器を使用します。

追加した3例はNginx＋Node.js＋PostgreSQL＋Redis、Nginx＋Flask＋PostgreSQL＋Redis、Nginx＋WordPress＋MariaDB＋phpMyAdminです。アプリ生成物と利用者が準備する追加ファイルを分離しています。`extend-recipes.cjs`は一回限りの制作記録で、追加済みの場合は停止します。再生成用には実行しません。

```powershell
node tools/manual/verify-advanced.cjs
python tools/manual/verify-python-sample.py
node tools/manual/verify-advanced-ui.cjs
```

Node/Pythonのキャッシュ処理はDB・Redisの代替オブジェクトで、キャッシュヒット・TTL・更新・無効化・障害時処理を検証します。実DB・Redis接続ではありません。UI検査は隔離した実アプリコピーから3例を生成し、配布生成物との一致を確認します。PowerShellのバックアップは構文のみ検査し、バックアップ・復旧は実行していません。Docker起動・依存パッケージのインストール・HTTP/DB実接続は今回行っていません。

2026-10-27の検査：35例の共通生成器との一致、追加3例の実Electron UI生成、391リンク（実体155ファイル）、Chromiumの表示・検索・3難易度の絞り込み・印刷CSS、既存npmテスト39件と`npm run test:electron`が成功。証跡は`qa/`にあり、公開マニュアルには含めません。

# 35レシピのGitHub Actions実動作検証結果

確認日：2026-10-28（日本時間）

- 実行：[GitHub Actions 40524380569](https://github.com/qtaro-dev/docker-builder-tool/actions/runs/40524380569)
- 起動方法：workflow_dispatch（手動）
- 開発ブランチ：codex/appearance-theme-preview
- 検証コミット：50d2e76095a6330783c817101635376d5bb89070
- 結果：**OK 35／FAIL 0／BLOCKED 0／PARTIAL 0／NOT_RUN 0**
- 生成・準備・Compose構文・取得・起動・応答/連携・後片付け：各35件成功
- Dockerfileビルド：20件成功。既成イメージのみの15件は対象外
- [機械可読結果](recipe-ci-results.json)／[Artifactハッシュ一覧](recipe-ci-evidence.json)

## 特に確認した内容

- Laravel 12.70.1：正常HTTP応答、Laravel経由のMySQL/PostgreSQLへの一時テーブル書込・集計値42。検証専用アプリを使用し、生成物は変更していません。
- 上級Node.js／Flask：プロキシ→アプリ→PostgreSQL／Redis、更新・失効・TTL、Redis停止時のDBフォールバックと回復。
- 上級WordPress：実backup.ps1で取得し、別Composeプロジェクトへ復旧して記事表示を確認。
- 専用コンテナ・ネットワーク・ボリュームと構築イメージの後片付けに成功。他プロジェクトやグローバルpruneは操作していません。

## 初回の検証側問題と再確認

ワークフロー構文の変数スコープを修正する前に、GitHubが[構文エラーの記録40504632380](https://github.com/qtaro-dev/docker-builder-tool/actions/runs/40504632380)をpushイベントとして作成しています。この記録の実行ジョブは0件で、Dockerの自動検証は行われていません。実コンテナ検証の2回はいずれもworkflow_dispatchによる手動実行です。

初回実行[40504798855](https://github.com/qtaro-dev/docker-builder-tool/actions/runs/40504798855)はOK25、FAIL4、NOT_RUN6でした。非同期処理の完了前終了を防ぐイベントループ保持、RabbitMQの検査キュー指定（durable）、WordPressの検査用インストール処理を修正し、全35件を同じ修正コミットで再実行しました。初回の記録は保持しています。アプリ本体や生成Compose/Dockerfileの不具合を検証側で隠す修正はしていません。

## 検証範囲

今回の合格は下記の確認範囲に限ります。JenkinsのPipeline実行、Ollamaのモデル推論、PortainerのDocker管理接続は対象外です。コンテナ起動だけで複合構成の連携成功とは判定していません。負荷試験・脆弱性スキャン・本番運用保証は含みません。正式版HTML/PDFマニュアルへの結果反映は行っていません。

## マニュアルレシピ構築チェックリスト

モード: 実GitHub Actions（Ubuntu Docker）。OKは実Docker検証と後片付けが成功したものだけです。
各グループは最大6件。公開ポートの重複を避けるため1件ずつ起動し、検査後に専用リソースを削除します。

| チェック | グループ | レシピ | 生成 | 準備 | config | pull | build | 起動 | 応答/連携 | 後片付け | 結果・理由 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [x] OK | 1 | Nginx単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | nginx HTTP/proxy |
| [x] OK | 1 | Apache単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | apache HTTP/proxy |
| [x] OK | 1 | Node.js単体 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | nodejs HTTP/dependency response |
| [x] OK | 1 | Nginx＋Node.js（独立HTTP） | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | nodejs HTTP/dependency response; nginx independent HTTP |
| [x] OK | 1 | Python Flask単体 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | python-web HTTP/dependency response |
| [x] OK | 1 | PostgreSQL単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | postgres SQL write/read=42 |
| [x] OK | 2 | MySQL単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mysql SQL write/read=42 |
| [x] OK | 2 | MariaDB単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mariadb SQL write/read=42 |
| [x] OK | 2 | Redis単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | Redis SET/GET |
| [x] OK | 2 | Memcached単体 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | Memcached TCP SET/GET |
| [x] OK | 2 | RabbitMQ管理・キュー環境 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | RabbitMQ authenticated queue publish/get |
| [x] OK | 2 | Jenkins開発・検証環境 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Jenkins initial UI; Pipeline execution outside startup-test scope |
| [x] OK | 3 | Ollama APIの起動 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Ollama tags API (no inference) |
| [x] OK | 3 | Portainer初期画面 | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | Portainer HTTPS status API (no Docker management connection) |
| [x] OK | 3 | Nginx＋Node.js＋MySQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | mysql SQL write/read=42; nodejs HTTP/dependency response; nginx HTTP/proxy |
| [x] OK | 3 | Nginx＋Node.js＋MariaDB | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | mariadb SQL write/read=42; nodejs HTTP/dependency response; nginx HTTP/proxy |
| [x] OK | 3 | Apache＋Node.js＋MySQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | mysql SQL write/read=42; nodejs HTTP/dependency response; apache HTTP/proxy |
| [x] OK | 3 | Node.js＋PostgreSQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | postgres SQL write/read=42; nodejs HTTP/dependency response |
| [x] OK | 4 | Node.js＋Redis | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Redis SET/GET; nodejs HTTP/dependency response |
| [x] OK | 4 | Flask＋PostgreSQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | postgres SQL write/read=42; python-web HTTP/dependency response |
| [x] OK | 4 | Flask＋Redis | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Redis SET/GET; python-web HTTP/dependency response |
| [x] OK | 4 | WordPress＋MySQL | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mysql SQL write/read=42; WordPress install/post/query through configured HTTP→DB |
| [x] OK | 4 | WordPress＋MariaDB | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mariadb SQL write/read=42; WordPress install/post/query through configured HTTP→DB |
| [x] OK | 4 | Laravel＋MySQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | mysql SQL write/read=42; Laravel 12.70.1 real HTTP and application DB temporary-table insert/select sum=42 |
| [x] OK | 5 | Laravel＋PostgreSQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | postgres SQL write/read=42; Laravel 12.70.1 real HTTP and application DB temporary-table insert/select sum=42 |
| [x] OK | 5 | Redmine＋PostgreSQL | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | postgres SQL write/read=42; Redmine UI and application DB connection |
| [x] OK | 5 | Node.js＋MySQL | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | mysql SQL write/read=42; nodejs HTTP/dependency response |
| [x] OK | 5 | Node.js＋MariaDB | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | mariadb SQL write/read=42; nodejs HTTP/dependency response |
| [x] OK | 5 | MySQL＋phpMyAdmin | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mysql SQL write/read=42; phpMyAdmin UI and container→DB authenticated query |
| [x] OK | 5 | MariaDB＋phpMyAdmin | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mariadb SQL write/read=42; phpMyAdmin UI and container→DB authenticated query |
| [x] OK | 6 | Nginx＋Flask | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | python-web HTTP/dependency response; nginx HTTP/proxy |
| [x] OK | 6 | Apache＋Flask | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | python-web HTTP/dependency response; apache HTTP/proxy |
| [x] OK | 6 | Nginx＋Node.js＋PostgreSQL＋Redis | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | postgres SQL write/read=42; Redis SET/GET; nginx HTTP/proxy; proxy→app→DB/cache; write/read/invalidate/TTL; Redis outage/fallback/recovery |
| [x] OK | 6 | Nginx＋Flask＋PostgreSQL＋Redis | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | postgres SQL write/read=42; Redis SET/GET; nginx HTTP/proxy; proxy→app→DB/cache; write/read/invalidate/TTL; Redis outage/fallback/recovery |
| [x] OK | 6 | Nginx＋WordPress＋MariaDB＋phpMyAdmin | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | mariadb SQL write/read=42; phpMyAdmin UI and container→DB authenticated query; WordPress install/post/query through configured HTTP→DB; real backup.ps1 and restore into separate Compose project; restored post visible |

STATIC_ONLY=ローカル静的検査のみ、BLOCKED=必要な入力不足、PARTIAL=起動等の一部のみ確認、FAIL=失敗、NOT_RUN=未実施。これらはOKに数えません。

### 各レシピの確認範囲
- Nginx単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Apache単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Node.js単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Nginx＋Node.js（独立HTTP）: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Python Flask単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- PostgreSQL単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- MySQL単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- MariaDB単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Redis単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Memcached単体: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- RabbitMQ管理・キュー環境: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Jenkins開発・検証環境: Jenkins起動・初期UI。プラグイン/管理者設定後のPipeline実行はこの起動検査の対象外
- Ollama APIの起動: Ollama起動・API。モデル取得・推論はレシピ自体の対象外
- Portainer初期画面: Portainer初期UI/API。Docker管理接続はレシピ自体の対象外
- Nginx＋Node.js＋MySQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Nginx＋Node.js＋MariaDB: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Apache＋Node.js＋MySQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Node.js＋PostgreSQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Node.js＋Redis: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Flask＋PostgreSQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Flask＋Redis: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- WordPress＋MySQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- WordPress＋MariaDB: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Laravel＋MySQL: 実LaravelのHTTP→DB接続（フレームワーク/依存の準備が必要）
- Laravel＋PostgreSQL: 実LaravelのHTTP→DB接続（フレームワーク/依存の準備が必要）
- Redmine＋PostgreSQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Node.js＋MySQL: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Node.js＋MariaDB: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- MySQL＋phpMyAdmin: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- MariaDB＋phpMyAdmin: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Nginx＋Flask: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Apache＋Flask: 全サービスの起動、HTTPまたはDB/キャッシュ応答、レシピに記載した連携
- Nginx＋Node.js＋PostgreSQL＋Redis: HTTP→プロキシ→アプリ→DB/Redis、更新・失効・TTL・障害/回復
- Nginx＋Flask＋PostgreSQL＋Redis: HTTP→プロキシ→アプリ→DB/Redis、更新・失効・TTL・障害/回復
- Nginx＋WordPress＋MariaDB＋phpMyAdmin: プロキシ・CMS/DB・管理UI・バックアップと別プロジェクトへの復旧

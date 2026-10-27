## マニュアルレシピ構築チェックリスト

モード: 未実施（実Docker確認前）。OKは実Docker検証と後片付けが成功したものだけです。
各グループは最大6件。公開ポートの重複を避けるため1件ずつ起動し、検査後に専用リソースを削除します。

| チェック | グループ | レシピ | 生成 | 準備 | config | pull | build | 起動 | 応答/連携 | 後片付け | 結果・理由 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ ] NOT_RUN | 1 | Nginx単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 1 | Apache単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 1 | Node.js単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 1 | Nginx＋Node.js（独立HTTP） | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 1 | Python Flask単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 1 | PostgreSQL単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 2 | MySQL単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 2 | MariaDB単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 2 | Redis単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 2 | Memcached単体 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 2 | RabbitMQ管理・キュー環境 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 2 | Jenkins開発・検証環境 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 3 | Ollama APIの起動 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 3 | Portainer初期画面 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 3 | Nginx＋Node.js＋MySQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 3 | Nginx＋Node.js＋MariaDB | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 3 | Apache＋Node.js＋MySQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 3 | Node.js＋PostgreSQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 4 | Node.js＋Redis | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 4 | Flask＋PostgreSQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 4 | Flask＋Redis | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 4 | WordPress＋MySQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 4 | WordPress＋MariaDB | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 4 | Laravel＋MySQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 5 | Laravel＋PostgreSQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 5 | Redmine＋PostgreSQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 5 | Node.js＋MySQL | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 5 | Node.js＋MariaDB | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 5 | MySQL＋phpMyAdmin | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 5 | MariaDB＋phpMyAdmin | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 6 | Nginx＋Flask | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 6 | Apache＋Flask | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 6 | Nginx＋Node.js＋PostgreSQL＋Redis | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 6 | Nginx＋Flask＋PostgreSQL＋Redis | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |
| [ ] NOT_RUN | 6 | Nginx＋WordPress＋MariaDB＋phpMyAdmin | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | 未実施 |

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

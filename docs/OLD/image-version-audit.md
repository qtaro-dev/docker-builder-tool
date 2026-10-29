# Dockerイメージ・生成仕様調査（v0.3.0 Phase 1）

調査日：2026-10-26（日本時間）。この文書は調査と設計案であり、v0.3.0の実装完了報告ではない。

現行の[GitHub非連携方針](github-integration-policy.md)が優先する。以下のGitHubを含む配信方式比較は調査当時の記録であり、アプリからGitHubに接続する方式は採用しない。現在の更新先はDocker Hubのみ。

追記：保存方式とLaravel CLI移行の承認後に実装を進めた。以下は実装前の調査記録として保持する。現在の実装・検証・残存課題は[v0.3.0開発記録](v0.3.0-development.md)を参照。

## 対象と作業状態

- 基準HEAD：`79ddb24a2f898fc18a07572e8589d7c9617826c8`、公開版v0.2.2。作業ブランチ：`codex/appearance-theme-preview`。
- テーマ・設定画面・パス初期化の未コミット変更を保持して調査した。アプリコード、依存関係、バージョン、公開版、タグは今回変更していない。コミット・push・PR・Release公開なし。
- リポジトリと上位ディレクトリに適用対象の`AGENTS.md`は見つからなかった。
- `app/src/modules/*.js`の全19定義、既定フィールドを使った`buildCompose`/`buildDockerfile`の返値、`renderer/modules_ui.js`、`renderer/generate.js`、`renderer/ui.js`、`main.js`、`preload.js`、既存テストを調査した。
- 公式サイトで系列のサポート情報を確認した。レジストリmanifestによる個々のタグ・digest・対応CPUの存在確認とコンテナスキャンは未実施。以下の現在のタグを、そのまま「検証済み初期カタログ」として採用してはいけない。

## 先に判断が必要な仕様の衝突

1. **複数Dockerfileと単一ファイル保存が両立していない。** Node.js、Python、Laravel、Jenkins、Ollamaの5モジュールが非空のDockerfileを返す。現在はすべてを1つのテキストに連結し、保存可能な名前も`Dockerfile`のみ。独立したサービス用ファイルとしては使えず、複数`FROM`は各サービスのビルドを意味しない。Composeは全サービスが`image:`のみで、生成したDockerfileを参照しない。
2. **Laravelの実行方式が一致しない。** ComposeはBitnami Laravel・HTTP 8000、DockerfileはPHP-FPM・通常FastCGI 9000。単に`build:`を追加すると既存のポート・起動方法が変わる。Bitnamiの配布変更もあり、旧イメージを継続前提にできない。

ユーザー指示の「重大な衝突があればそこで止めて選択肢を報告」に従い、Phase 2以降の実装は保留する。未承認でZIP出力や一括保存を追加しない。

### 保存方式の選択肢

| 案 | 内容 | 利点・制約 |
| --- | --- | --- |
| A：ファイル別表示・個別保存（推奨） | 生成結果に対象ファイルの選択欄を追加し、`Dockerfile.nodejs`等を個別保存。各サービスのソースディレクトリをbuild contextとして明示 | 既存の表示・保存操作を拡張でき、ZIP依存なし。利用者が指定構造に保存する必要があり、必要な配置を画面にも表示する |
| B：プロジェクト一括保存 | 保存先配下へCompose・サービス別Dockerfile・説明をまとめて書く | 配置の不一致を減らせるが、既存ファイル衝突・上書き確認・部分失敗・リンク拒否など保存仕様を広く設計する必要がある |
| C：ZIP出力 | ディレクトリ構造をZIPで配布 | 移動しやすいが新しい出力形式と依存関係・UIが必要。現段階では推奨しない |

案Aの配置例（提案、未実装）：

```text
project/
  docker-compose.yml
  nodejs/
    Dockerfile.nodejs
    package.json / package-lock.json / アプリソース
  python-web/
    Dockerfile.python-web
    requirements.txt / アプリソース
```

Composeは`build.context: ./nodejs`、`build.dockerfile: Dockerfile.nodejs`とする。Dockerfileパスはcontext基準、contextはCompose配置ディレクトリ基準。ソースを別サービスへ混ぜず、アプリ本体や認証情報を自動コピーしない。既存のプロジェクト設定の保存先・フォルダ名を勝手に変更しない。[Compose公式仕様](https://docs.docker.com/reference/compose-file/build/)

Laravelは、案A/Bと合わせて**PHP公式ベースへ統一し、開発用途のHTTP起動方式・8000番ポートを維持する案**を推奨する。ただし依存インストール、PHP拡張、Laravel版ごとの要件、APP_KEY、ソース配置を検証してから採用する。FPMを維持するならNginx/ApacheとのFastCGI設定が別途必要になり、単独起動仕様が変わる。無断で移行しない。

## 全19モジュールの現状

すべて`image:`を出力し、`build:`は出力しない。完全なパッチ版とdigestの固定は全19件ともない。「系列」はメジャー/マイナーの追従タグで、再現可能な固定ではない。Dockerfile「なし」は関数自体があっても空文字の場合を含む。サポート状態と脆弱性状態は別であり、全件コンテナ脆弱性**未検査**。

| モジュールID／名称 | 現在のComposeイメージ | 固定度 | Dockerfileの実体 | 2026-10時点のサポート確認 |
| --- | --- | --- | --- | --- |
| nginx／Nginx | `nginx:latest` | 移動タグ | なし | 公式にstable/mainlineあり。現在のタグの実体・ベースOS・EOLは未確認 [S1] |
| apache／Apache | `httpd:alpine` | OS指定のみ | なし | 公式の現行安定系列は2.4。現在のタグの実体とAlpine版は未確認 [S2] |
| certbot／Certbot | `certbot/certbot:latest` | 移動タグ | なし | 公式Docker配布あり。タグの実体・系列別EOLは未確認 [S3] |
| nodejs／Node.jsアプリ | `node:20-alpine` | メジャー系列 | 同じFROM、COPY・npm install・dev起動 | **20は2026-04-30 EOL**。22/24はLTS、26のLTS予定日は10/28で調査日より後 [S4] |
| python-web／Pythonアプリ | `python:3.12-slim` | マイナー系列 | 同じFROM、COPY、依存インストールはコメント | 3.12はsecurity段階、EOL予定2028-10。Django/Flask自体の版は未指定・未確認 [S5] |
| laravel／Laravel | `bitnami/laravel:latest` | 移動タグ | `php:8.2-fpm-alpine`、`COPY --from=composer:2` | PHP8.2はsecurityのみ、2026-12-31終了予定。Laravel/Composerの実体・タグ提供は未確認。Bitnami配布変更要対応 [S6,S7] |
| wordpress／WordPress | `wordpress:latest` | 移動タグ | なし | 公式DB要件は確認。タグ内のWordPress/PHP/OS版・その保守状態は未確認 [S8] |
| redmine／Redmine | `redmine:latest` | 移動タグ | なし | 公式インストール要件あり。タグ内Redmine/Ruby版・EOLは未確認 [S9] |
| mysql／MySQL | `mysql:8.0` | マイナー系列 | なし | **8.0は2026-04 EOL**。Oracle Sustaining Supportと通常の修正提供を混同しない。8.4LTS等への互換性検証が必要 [S10] |
| mariadb／MariaDB | `mariadb:latest` | 移動タグ | なし | 10.11/11.4等の保守方針あり。10.6は2026-07-06コミュニティ保守終了。現在のlatestの系列は未確認 [S11] |
| postgres／PostgreSQL | `postgres:16-alpine` | メジャー系列 | なし | 16はサポート中、終了予定2028-11-09。Alpine版の保守状態は未確認 [S12] |
| phpmyadmin／phpMyAdmin | `phpmyadmin/phpmyadmin:latest` | 移動タグ | なし | MySQL/MariaDB管理用。完全タグ・内包PHP・系列別保守は未確認 [S13] |
| redis／Redis | `redis:7-alpine` | メジャー系列 | なし | 7.2/7.4の公式方針あり。ただし7タグの実体を特定できずサポート判定は未確認 [S14] |
| memcached／Memcached | `memcached:1.6-alpine` | マイナー系列 | なし | 公式安定リリースに1.6系列あり。個別タグ・Alpine版・EOL日は未確認 [S15] |
| rabbitmq／RabbitMQ | `rabbitmq:3-management` | メジャー系列＋機能 | なし | 3.13のコミュニティ保守は2024-09-30終了。旧系列の有償延長を一般の3タグへ適用しない。タグ実体は未確認 [S16] |
| jenkins／Jenkins | `jenkins/jenkins:lts-jdk17` | LTS追従＋JDK | 同じFROM、コメントのみ | Java17対応の最終LTSは2.541.3。現行の対応Javaは21/25。旧タグのJenkins版・保守は未確認 [S17] |
| ollama／Ollama | `ollama/ollama`（暗黙latest） | 未固定 | 同じFROM、コメントのみ | 公式イメージ名は確認。タグ実体・EOL方針は未確認 [S18] |
| portainer／Portainer | `portainer/portainer-ce:latest` | 移動タグ | なし | 公式にLTS案内あり。CE latestの実体・適用される保守期間は未確認 [S19] |
| steamcmd／SteamCMD | `steamcmd/steamcmd:latest` | 移動タグ | なし | この名前の配布者をValve公式として確認できていない。タグ存在・由来・サポートは未確認。初期候補へ無条件登録不可 |

## 起動条件・依存関係・個別問題

既存の`requires: ["db"]`はLaravel/WordPress/Redmine/phpMyAdminにあるが、検証は「何らかのDBを選んだか」だけ。DB製品・接続先・資格情報の整合性は見ていない。通常の`depends_on`にはDBの受付準備を待つ保証もない。DBの既存データの移行・削除は今回実施していない。

| モジュール | 必要なファイル・設定／依存 | 生成コードから確認した問題・注意点 |
| --- | --- | --- |
| Nginx | 静的コンテンツ、プロキシ用途ならnginx.conf、対象アプリ | 現状は80番公開とdocrootマウントのみ。リバースプロキシ設定を生成しない |
| Apache | htdocs、プロキシ/FastCGI用途ならhttpd設定 | 現在は静的HTTPサーバ。PHPを選ぶだけで実行できる構成ではない |
| Certbot | 所有するドメイン、ACME到達性、Webサーバと共有するchallenge領域、証明書配置 | 既定ドメインは空。単独では証明書を取得できない。Webサーバ側のchallenge配信・証明書参照・更新後reloadは未生成。今回は外部ACMEへ接続していない |
| Node.js | package.json、依存lock、ソース、devスクリプト、0.0.0.0でのlisten | モデルの`working_dir: /app`がYAMLで消える。空のnamed volumeだけではソースがなく起動不可。Dockerfileはnpm installを使い、lockに基づく再現性の検証なし |
| Python | Djangoならmanage.py/settings、Flaskならエントリポイント、requirements、ソース、listen設定 | working_dirが消える。既定`python app.py`は一般的なDjango構造と一致しない。requirementsインストールがコメント。コマンドの空白splitでは引用符を正しく扱えない |
| Laravel | composer.json/lock、ソース、.env、APP_KEY、対応DB、必要ならmigration | ComposeとFROM/HTTP/FPMが不一致。ソースCOPYとcomposer installはコメント。DB_CONNECTION=mysql/3306固定でPostgreSQL選択に追従しない。APP_DEBUG=true・secret等は開発既定値 |
| WordPress | 対応MySQL/MariaDB、同じDB名・ユーザー・パスワード | 接続先既定はproject-mysqlで、UIにはDBホスト項目がない。MariaDBだけ選択しても切り替わらない。Nginxと既定8080が衝突 |
| Redmine | 対応DB、redmine DB/ユーザー、ファイル領域 | 接続先既定はproject-mariadb、DB/ユーザーはredmine。他DBモジュールの既定appdb/appuserと一致しない。MySQL系環境変数だけでPostgreSQLには切り替わらない。Node.jsと既定3000が衝突 |
| MySQL | DB名・資格情報、永続領域、更新時バックアップ/移行 | 8.0 EOL。secretの開発既定値。既存ボリュームをそのまま別メジャーへ付け替える移行は不可 |
| MariaDB | DB名・資格情報、永続領域、移行計画 | latestで意図せず系列が変わる。MySQLと互換と決めつけて既存データを流用しない |
| PostgreSQL | POSTGRES_DB/USER/PASSWORD、永続領域 | 16向けデータパス。別メジャーへの変更ではデータ移行が必要。DB必須アプリ側は自動対応しない |
| phpMyAdmin | MySQL/MariaDBサービスと一致するPMA_HOST/資格情報 | 既定はproject-mysql。dbHostは手動指定可。PostgreSQLでも汎用DBチェックを通るが管理対象として非対応 |
| Redis | 接続元・必要な認証/永続化方針 | ポート公開あり、認証未設定。/dataをマウントするだけで要求する永続性が保証されるわけではない |
| Memcached | 接続元、メモリ量、公開範囲 | /dataマウントはキャッシュの永続化保証にならない。公開ポート11211の到達範囲確認が必要 |
| RabbitMQ | 利用ユーザー・パスワード、AMQP/管理UIの公開範囲 | 資格情報を生成しない。既定guestの接続制約を含め確認が必要。3系列を新規既定候補にしない |
| Jenkins | 初期管理者設定、プラグイン、ジョブ、ホーム領域 | JDK17追従タグは現在のJava要件と不一致。FROMだけのDockerfileは通常不要。8080はNginx/WordPress等と衝突 |
| Ollama | モデル取得、容量/RAM、必要ならGPUランタイム | `ollama serve`や任意モデル取得のshコマンドとイメージENTRYPOINTの組合せは実機未検証。entrypointは未出力。外部モデル取得は実施せず |
| Portainer | 管理対象endpoint（agent等）、初期管理者、データ領域 | 現状は/dataと9000/9443公開のみ。Dockerソケットもagent接続もなく、ローカルDocker管理が完成していない。ソケットを無断追加しない |
| SteamCMD | 有効なApp ID、利用条件、必要なら認証、ゲーム別ポート/設定 | environmentが配列だが共通シリアライザーはオブジェクト前提で、APP_ID指定時に`0=APP_ID=...`になる。`${APP_ID}`はCompose側の補間も考慮が必要。ゲームサーバ起動/ポートは未生成 |

### 共通生成・保存・入力保持の問題

- `renderComposeYaml()`は`build`と`working_dir`を出力せず、将来必要な`entrypoint`、healthcheck条件なども現在非対応。
- `image:`に公式ベースイメージを残したまま`build:`だけ追加する案は不可。pull/buildの選択規則により意図した自作イメージにならない場合がある。ビルドするサービスは`build`を主とし、必要なローカル名は公式イメージと区別する。
- `dockerfileSnippets.join("\n\n")`は独立サービスの複数Dockerfileを表現しない。結果モデルをファイル一覧にする必要がある。
- mainの`file:saveGenerated`は`docker-compose.yml`/`Dockerfile`だけを許可し、ネイティブの個別保存ダイアログで保存する。自由なパス書込みIPCを追加して解決してはいけない。
- 設定画面のcomposeDir/DockerfileDirは現在の保存ダイアログのdefaultPathへ接続されていない。保存構造の変更には既存設定との対応を明示する必要がある。
- `renderConfigSections()`はモジュール切替時に設定カード全体を再生成するため、他カードで入力した値を失う可能性がある。バージョン選択を追加する際は共通の入力状態保持が必須。
- デフォルト生成の既存単体テストは返値の形を検証するもので、ソース不足・DB接続・コンテナ起動成功を保証しない。

## 組み合わせの調査

| 組み合わせ | 現状 | 必要な対応・未解決事項 |
| --- | --- | --- |
| Nginx + Node.js | 別HTTPサービスとして並ぶだけ | upstreamをComposeサービス名:3000に向けるproxy設定、listen、必要なソースと依存、サービス別context |
| Nginx + Python | 同上、Nginxから接続設定なし | Django/Flaskの起動方法・WSGI/ASGI・listenとupstreamを合わせる。Laravelと既定8000も衝突 |
| Apache + PHP系 | httpdにPHP実行環境なし | FastCGI接続設定と共有docroot、またはPHP Apache型。方式を混在させない |
| WordPress + MySQL/MariaDB | MySQL既定名へ固定 | 対応DB選択と資格情報同期。WordPressの最低DB要件を満たしていてもDBがEOLなら通常生成対象にしない |
| Laravel + DB | mysqlドライバー/3306固定 | MariaDB対応・PostgreSQL用ドライバー/ポート/拡張、DB資格情報、APP_KEY、ソース。PHP/Laravel対応表が必要 |
| Redmine + DB | MariaDB既定名・redmineユーザー固定 | DB製品別環境変数・DB/ユーザー作成・資格情報・対応Ruby/Redmine版 |
| phpMyAdmin + MySQL/MariaDB | 手動ホスト指定可 | 実在する選択サービスへ限定し、PostgreSQLは非対応として拒否 |
| Certbot + Nginx/Apache | webrootと証明書共有の連携なし | challengeパス配信、ドメイン必須、外部80番到達性、証明書参照、renewとreload。無断で本番ACMEへ接続しない |

Composeの既定ネットワークでサービス名解決は可能だが、接続先設定・アプリ側のlisten・準備完了待ちまでは補わない。上表はコードと公式要件による静的調査で、組み合わせの起動検証は未実施。

## 共通基盤の設計案（未実装）

### カタログと選択

全モジュール共通のカタログを使い、モジュール側には選択したレコードを渡す。タグを系列文字列から合成しない。Node.js/Python/Nginxで先行検証後、残る16へ展開する。

レコードはmoduleId、repository、series、**確認済み完全tag**、variant、platformごとのdigest、default候補、support状態、eolとその日付精度、source URL、checkedAt、tag確認日時、scan状態/日時/対象digest/scanner/DB日時/High・Critical詳細、警告を持つ。ファイル全体にschemaVersion・revision・生成日時・有効期限を持たせる。月までしか公表されないEOLを適当な日付へ変換しない。

上流ランタイム、ベースOS、内包PHP/JDK等の保守を別々に記録する。タグが同じでもdigestが変われば以前のスキャン結果を引き継がない。アーキテクチャ差も別扱いとする。初期データも公式manifestの存在確認と出所確認を経て同梱し、未確認タグを確認済み扱いしない。

### 更新方式比較

| 方式 | 利点 | 制約 |
| --- | --- | --- |
| アプリが公式へ直接取得 | 公式registryのタグ/digest存在を直接確かめられる | 各言語の保守方針・OS・CVEはregistryだけでは分からない。19製品分のHTML/API変更・rate limit・認証を各アプリで管理する必要がある |
| 管理されたカタログ配信（推奨） | CIで公式情報・manifest・Trivy結果を統合し、アプリの検証形式を固定できる | 配信ワークフローと出所証明の運用が必要。JSONと同じ場所のハッシュだけでは改ざん検知の信頼根拠にならない |

推奨は**検証済みオフラインカタログ＋管理された配信物の更新**。CIで公式情報とレジストリを取得し、差分レビューを経たカタログを作る。出所検証は、許可したリポジトリ・workflow・refを固定したSigstore/GitHubのattestation等を候補とする。検証ライブラリー・信頼根・失効/期限・リプレイ防止を実装し、署名検証の試験を通してから利用する。署名鍵や配信基盤は今回作成していない。

配信URLはプロジェクト管理下の固定HTTPS endpointのみ。現時点で実在するカタログ配信先・検証identityは未設定のため、オンライン更新が稼働しているとは扱わない。URL・任意ヘッダー・トークン・shellコマンドをRendererから受け取らない。

mainのみが取得・検証・キャッシュを担当し、preloadは読み込み/更新の固定操作だけ公開する。IPC送信元検証、contextIsolation、sandbox、CSPの`connect-src 'none'`を維持する。ネットワークtimeout、最大byte数（展開後も制限）、許可されたredirect先、件数・深さ・文字列長、既知キー、moduleIdとrepositoryの対応、tag/digest構文、日時、重複/未知variant等を検証。HTMLやコードは表示・実行しない。

検証完了後だけ`app.getPath('userData')`へ一時ファイルから原子的に入替える。過去revisionへのrollback、未来日時、期限切れを検出する。失敗時は前回の有効キャッシュ、なければ同梱カタログを保持する。更新失敗を空カタログや「脆弱性なし」に置き換えない。選択中のタグを更新で勝手に変更しない。

### セキュリティ判定とUI

- support、tag存在、scanは独立した軸。サポート中を「安全」の意味で表示しない。
- EOLと既知High/Criticalは通常生成を制限。例外は対象サービス・理由・CVEを読める検証用途の明示操作とし、生成ごとに確認、永続的な全件解除はしない。
- 不存在tagは例外でも生成禁止。候補をカタログの確認済みレコードに限定。古い存在確認と実際の404を区別する。
- support不明、未検査、古いスキャン、オフラインはそれぞれ日時と日本語警告を表示。既存データの範囲で使用できる。scanの鮮度基準は設定ではなく共通ポリシーで管理する。
- TrivyはCI側でdigest単位に実行し、検査日時・DB日時・platform・対象digestを保存する案。DB全体をアプリに同梱しない。Trivyを起動していない現在は全件「未検査」。[Trivy公式](https://trivy.dev/docs/latest/scanner/vulnerability/)
- 既存カード内に系列/variant/完全タグ/状態を追加し、他項目の入力を保持する。9テーマ・設定保存・モジュール選択は維持。独立サービス間でDB製品・ホスト・資格情報の整合性も検証する。

## 検証結果と次の作業

調査時の既存コードに対する結果（2026-10-26）：

| 検証 | 結果 |
| --- | --- |
| `npm test` | 成功：8件、失敗0。全19モジュールの既定返値、YAML文字列処理、IPC境界、テーマ等 |
| `npm run test:electron` | 成功：起動、19モジュール、構成生成/保存、設定/初期化、9テーマ、キャンセル/閉じる/Escape、再起動後保存、CSP/IPC等。拒否・保存失敗の注入時ログは意図したもの |
| `npm audit --json` | 終了0、脆弱性0（High/Critical含む）。npm依存の結果でありDockerイメージやDependabot全件の評価ではない |
| `docker compose config -q` | 未実施：この環境でDocker CLIを検出できない |
| Dockerfile build/コンテナ起動/Trivy | 未実施。既存Dockerリソースへの操作なし |
| v0.3.0の候補選択・更新・生成ポリシー試験 | 未実施：機能自体が未実装 |

次は保存方式とLaravel実行方式を確認する。その後、完全タグ/manifest/由来を検証した初期カタログ、更新の真正性検証、共通選択・判定、UI・生成モデル・保存IPC、DB互換性の順に進める。正常/不正/過大/期限切れ/rollback更新、オフライン、未適用更新による入力保持、全候補FROM/Compose一致、複数context、既存テーマとElectron境界の回帰テストを追加する。Dockerが利用可能な隔離環境で構文・build・起動検証を行うまで「起動確認済み」と表示しない。

## 公式情報源

以下は調査日に閲覧した情報。タグの実在や個別イメージのCVE検査の代わりではない。系列や日付を取得できなかった箇所は上表で未確認とした。

- S1：[Nginx公式](https://nginx.org/index.html)
- S2：[Apache HTTP Server公式](https://httpd.apache.org/)、[公式配布一覧](https://downloads.apache.org/httpd/)
- S3：[Certbot公式利用説明](https://github.com/certbot/certbot/blob/main/certbot/docs/using.rst)
- S4：[Node.js公式リリース一覧](https://nodejs.org/en/about/previous-releases)、[公式スケジュール](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)
- S5：[Python公式保守一覧](https://devguide.python.org/versions/)
- S6：[PHP公式サポート表](https://www.php.net/supported-versions.php)
- S7：[Bitnami公式カタログ変更告知](https://github.com/bitnami/containers/issues/83267)
- S8：[WordPress公式要件](https://wordpress.org/about/requirements/)
- S9：[Redmine公式INSTALL](https://github.com/redmine/redmine/blob/master/doc/INSTALL)
- S10：[MySQL 8.0公式リリースノート](https://dev.mysql.com/doc/relnotes/mysql/8.0/en/)、[公式EOL告知](https://www.mysql.com/support/eol-notice.html)
- S11：[MariaDB公式保守方針](https://mariadb.org/about/#maintenance-policy)
- S12：[PostgreSQL公式保守方針](https://www.postgresql.org/support/versioning/)
- S13：[phpMyAdmin公式](https://www.phpmyadmin.net/)
- S14：[Redis公式保守方針](https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/)、[公式security policy](https://github.com/redis/redis/security)
- S15：[Memcached公式配布](https://www.memcached.org/downloads)
- S16：[RabbitMQ公式サポート表](https://www.rabbitmq.com/release-information)
- S17：[Jenkins公式Javaサポート方針](https://www.jenkins.io/doc/book/platform-information/support-policy-java/)
- S18：[Ollama公式リポジトリ](https://github.com/ollama/ollama)
- S19：[Portainer公式LTS案内](https://portainer.io/blog/portainer-2-45-lts-release)

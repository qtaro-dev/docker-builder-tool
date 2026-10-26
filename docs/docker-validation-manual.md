# Docker構成生成：6パターンのUI操作・検証記録

対象：v0.3.0-dev.0。確認日：2026-10-26。GitHub側の結果は後段の実行記録に追記する。

## 確認方法とUI名称

隔離した実Electronアプリで6構成を自動操作した。以下のタブ移動・モジュール選択・入力・生成・ファイル切替を実行し、同じprojectName/入力値を渡した本体のヘッドレス生成とCompose/Dockerfileが完全一致することを確認した。保存は本物のpreload/IPC/ファイル書込みを通したが、OSの保存先選択ダイアログだけはテスト側で置換した。人間が保存ダイアログをクリックした、またはローカルDockerで起動したという記録ではない。

タブの実名は「モジュール」「構成入力」「生成結果」。モジュール画面の見出しは「利用するモジュール」。専用の「永続化」タブはなく、各カードの「データ保存方式」（Node.jsは「アプリの配置方式（データ保存方式）」）で設定する。モジュール選択はチェックボックスではなく行をクリックする。TCP/UDP用の独立した切替は現在の入力UIに表示されず、今回の生成は全てTCP。PythonだけDjango/Flaskトグルがある。

## 起動・共通操作

1. D:\Dev\docker-builder-toolを作業フォルダとして、初回は`npm ci`、続いて`npm start`を実行する。配布済みv0.2.2のexeは今回の開発ソースを含まない。
2. アプリの「ファイル」→「新規構成」を押し、前の選択・入力・生成結果を初期化する。
3. 「モジュール」タブを押し、各節で指定した行をクリックする。選択された行が強調表示されることを確認する。
4. 「構成入力」タブを押し、「共通設定 / 構成実行」の「プロジェクト名」に各節の値を入力する。
5. 各カードのバージョン系列・イメージ形式は以下の確認済み値を選ぶ。オンライン更新は押さない。将来の更新で候補が変わった場合は完全タグ/digestを本記録と照合する。
6. 下記の表の全項目を確認する。「初期値」は入力を変えない。データ保存方式を変更すると表示されるホストパス欄へ指定値を入力する。非表示になる名前付きボリューム名の値も表に記録している。
7. 「構成を実行」ボタンを押す。警告がある場合は内容を確認する。EOL例外は今回使わない。
8. 「生成結果」タブを押し、左の「生成された docker-compose.yml」と右の「サービス別 Dockerfile / ビルド設定」を確認する。サービス名、完全image/FROM、ポート、volumes、build.context/dockerfile、commandを下記と照合する。
9. 「構成ファイルの配置・起動ガイド」を押し、A/B/Cの説明を確認して「閉じる」またはEscapeで戻る。
10. 左の「ダウンロード」を押し、OS保存ダイアログで各節の保存フォルダを作成/選択し、`docker-compose.yml`という名前で保存する。
11. Dockerfileがある場合は右の「表示・保存するファイル」選択欄で各ファイルを選び、右の「ダウンロード」を押す。下記のサブフォルダを作り、ファイル名を変えずに個別保存する。Dockerfile/ignoreは同じcontextへ保存する。フォルダ一括保存やZIP出力はない。
12. 「テスト追加」ファイルだけを別途コピーする。これらはアプリが生成したものではない。

## 手動とCIの一致範囲

手動再現例の保存先は`D:\Dev\docker-builder-validation-manual\<case>\`（アプリリポジトリ外の任意フォルダ）。実機自動テストでは一時アプリコピーの`manual-exports/<case>/`へ保存し、終了時に削除した。記録のためのJSON/画像は無視対象`release/theme-previews/manual-ui-evidence.json`と`manual-<case>.png`へ保存した。

CIは同じ既存フィールドに同じ値を渡す。相違はCIの固有projectName（`dbt-<ランダム8桁>-<case>`）のみで、サービス名・名前付きvolumeのプレフィックスが連動する。Composeを生成後に書き換えない。UIとCIの保存で末尾改行も追加せず一致させた。Nginx＋Node.jsのリバースプロキシは未実装のため、両方の独立したHTTP応答だけを合格条件とする。

## Nginx単体

### 操作手順

1. 共通手順1〜2を実行し、「モジュール」タブで「Nginx（Web サーバ）」の行だけをクリックする。
2. 「構成入力」でプロジェクト名に`manual-nginx`を入力する。
3. 次の設定値表どおり入力する。
4. 「構成を実行」→「生成結果」を押し、下記の生成内容と照合する。
5. 共通手順9〜12に従い、下記の全生成ファイルを個別に保存し、fixtureを追加する。

### 設定値

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| Nginx（Web サーバ） | バージョン系列 | 1.30 | 初期候補 |
| Nginx（Web サーバ） | イメージ形式 | debian | 初期候補 |
| Nginx（Web サーバ） | 公開ポート（ホスト側） | `19080` | 変更（初期値：8080） |
| Nginx（Web サーバ） | データ保存方式 | バインドマウント（ホストパス）（`bind`） | 変更（初期値：named） |
| Nginx（Web サーバ） | ネームボリューム名 | `nginx-html` | 初期値 |
| Nginx（Web サーバ） | バインドマウント（ホストパス） | `./fixture-web` | 変更（初期値：./src） |

選択イメージ：`nginx:1.30.6-trixie@sha256:a7675fcee220f59b4a99f7098c06a0d5d999c2c0ee37c0211efb780536e5cb20`。TCP（UIの初期設定）、UDPへの変更なし。

### 生成ファイルと配置

```text
nginx/
  docker-compose.yml
  fixture-web/index.html  [テスト追加：固定応答の静的コンテンツ]
```

テスト追加ファイルのコピー元：`test/fixtures/web-validation/`、`node-validation/`、`flask-validation/`のうち、この構成に必要なものだけ。PostgreSQLはテスト用DB名/ユーザー/ダミーパスワードを入力し、実パスワードを使用しない。

生成Compose（UI自動操作・ヘッドレス生成で一致確認済み）：

```yaml
version: "3.9"
services:
  "manual-nginx-nginx":
    image: "nginx:1.30.6-trixie@sha256:a7675fcee220f59b4a99f7098c06a0d5d999c2c0ee37c0211efb780536e5cb20"
    restart: "always"
    ports:
      - "19080:80"
    volumes:
      - "./fixture-web:/usr/share/nginx/html:ro"
```

### GitHub Actionsでの検証結果

初回実行前：未実施。実行URL、pull/build、起動、HTTP/DB、cleanup結果は末尾の実行記録へ追記する。

## Apache単体

### 操作手順

1. 共通手順1〜2を実行し、「モジュール」タブで「Apache（Web サーバ）」の行だけをクリックする。
2. 「構成入力」でプロジェクト名に`manual-apache`を入力する。
3. 次の設定値表どおり入力する。
4. 「構成を実行」→「生成結果」を押し、下記の生成内容と照合する。
5. 共通手順9〜12に従い、下記の全生成ファイルを個別に保存し、fixtureを追加する。

### 設定値

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| Apache（Web サーバ） | バージョン系列 | 2.4 | 初期候補 |
| Apache（Web サーバ） | イメージ形式 | alpine | 初期候補 |
| Apache（Web サーバ） | 公開ポート（ホスト側） | `19082` | 変更（初期値：8082） |
| Apache（Web サーバ） | データ保存方式 | バインドマウント（ホストパス）（`bind`） | 変更（初期値：named） |
| Apache（Web サーバ） | ネームボリューム名 | `apache-docroot` | 初期値 |
| Apache（Web サーバ） | バインドマウント（ホストパス） | `./fixture-web` | 変更（初期値：./src） |

選択イメージ：`httpd:2.4.69-alpine@sha256:070da7661f0be8a05430b2c125c0cde9e53176b4048c813024021969a0e3893c`。TCP（UIの初期設定）、UDPへの変更なし。

### 生成ファイルと配置

```text
apache/
  docker-compose.yml
  fixture-web/index.html  [テスト追加：固定応答の静的コンテンツ]
```

テスト追加ファイルのコピー元：`test/fixtures/web-validation/`、`node-validation/`、`flask-validation/`のうち、この構成に必要なものだけ。PostgreSQLはテスト用DB名/ユーザー/ダミーパスワードを入力し、実パスワードを使用しない。

生成Compose（UI自動操作・ヘッドレス生成で一致確認済み）：

```yaml
version: "3.9"
services:
  "manual-apache-apache":
    image: "httpd:2.4.69-alpine@sha256:070da7661f0be8a05430b2c125c0cde9e53176b4048c813024021969a0e3893c"
    restart: "always"
    ports:
      - "19082:80"
    volumes:
      - "./fixture-web:/usr/local/apache2/htdocs/"
```

### GitHub Actionsでの検証結果

初回実行前：未実施。実行URL、pull/build、起動、HTTP/DB、cleanup結果は末尾の実行記録へ追記する。

## Node.js単体

### 操作手順

1. 共通手順1〜2を実行し、「モジュール」タブで「Node.js アプリ」の行だけをクリックする。
2. 「構成入力」でプロジェクト名に`manual-nodejs`を入力する。
3. 次の設定値表どおり入力する。
4. 「構成を実行」→「生成結果」を押し、下記の生成内容と照合する。
5. 共通手順9〜12に従い、下記の全生成ファイルを個別に保存し、fixtureを追加する。

### 設定値

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| Node.js アプリ | バージョン系列 | 24 | 初期候補 |
| Node.js アプリ | イメージ形式 | bookworm-slim | 初期候補 |
| Node.js アプリ | 公開ポート（ホスト側） | `19300` | 変更（初期値：3000） |
| Node.js アプリ | アプリの配置方式（データ保存方式） | イメージ内に含める（標準・ソースを隠さない）（`image`） | 初期値 |
| Node.js アプリ | ネームボリューム名 | `node-app` | 初期値 |
| Node.js アプリ | バインドマウント（ホストパス） | `./nodejs` | 初期値 |
| Node.js アプリ | 起動コマンド（sh -c で実行） | `npm run dev` | 初期値 |

選択イメージ：`node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`。TCP（UIの初期設定）、UDPへの変更なし。

### 生成ファイルと配置

```text
nodejs/
  docker-compose.yml
  nodejs/Dockerfile.nodejs  [アプリ生成]
  nodejs/Dockerfile.nodejs.dockerignore  [アプリ生成]
  nodejs/package.json  [テスト追加：devスクリプト]
  nodejs/package-lock.json  [テスト追加：外部npm依存なし]
  nodejs/server.cjs  [テスト追加：0.0.0.0:3000 HTTPサーバー]
```

テスト追加ファイルのコピー元：`test/fixtures/web-validation/`、`node-validation/`、`flask-validation/`のうち、この構成に必要なものだけ。PostgreSQLはテスト用DB名/ユーザー/ダミーパスワードを入力し、実パスワードを使用しない。

生成Compose（UI自動操作・ヘッドレス生成で一致確認済み）：

```yaml
version: "3.9"
services:
  "manual-nodejs-nodejs":
    build:
      context: "./nodejs"
      dockerfile: "Dockerfile.nodejs"
    working_dir: "/app"
    restart: "always"
    ports:
      - "19300:3000"
    command: ["sh","-c","npm run dev"]
```

生成ファイル：`nodejs/Dockerfile.nodejs`

```dockerfile
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["sh","-c","npm run dev"]
```

生成ファイル：`nodejs/Dockerfile.nodejs.dockerignore`

```text
.git
.env
.env.*
*.pem
*.key
node_modules
vendor
__pycache__
*.pyc
*.log
.npmrc
.npm
coverage
```

### GitHub Actionsでの検証結果

初回実行前：未実施。実行URL、pull/build、起動、HTTP/DB、cleanup結果は末尾の実行記録へ追記する。

## Nginx＋Node.js

### 操作手順

1. 共通手順1〜2を実行し、「モジュール」タブで「Nginx（Web サーバ）」と「Node.js アプリ」の行だけをクリックする。
2. 「構成入力」でプロジェクト名に`manual-nginx-nodejs`を入力する。
3. 次の設定値表どおり入力する。
4. 「構成を実行」→「生成結果」を押し、下記の生成内容と照合する。
5. 共通手順9〜12に従い、下記の全生成ファイルを個別に保存し、fixtureを追加する。

### 設定値

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| Nginx（Web サーバ） | バージョン系列 | 1.30 | 初期候補 |
| Nginx（Web サーバ） | イメージ形式 | debian | 初期候補 |
| Nginx（Web サーバ） | 公開ポート（ホスト側） | `19480` | 変更（初期値：8080） |
| Nginx（Web サーバ） | データ保存方式 | バインドマウント（ホストパス）（`bind`） | 変更（初期値：named） |
| Nginx（Web サーバ） | ネームボリューム名 | `nginx-html` | 初期値 |
| Nginx（Web サーバ） | バインドマウント（ホストパス） | `./fixture-web` | 変更（初期値：./src） |

選択イメージ：`nginx:1.30.6-trixie@sha256:a7675fcee220f59b4a99f7098c06a0d5d999c2c0ee37c0211efb780536e5cb20`。TCP（UIの初期設定）、UDPへの変更なし。

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| Node.js アプリ | バージョン系列 | 24 | 初期候補 |
| Node.js アプリ | イメージ形式 | bookworm-slim | 初期候補 |
| Node.js アプリ | 公開ポート（ホスト側） | `19400` | 変更（初期値：3000） |
| Node.js アプリ | アプリの配置方式（データ保存方式） | イメージ内に含める（標準・ソースを隠さない）（`image`） | 初期値 |
| Node.js アプリ | ネームボリューム名 | `node-app` | 初期値 |
| Node.js アプリ | バインドマウント（ホストパス） | `./nodejs` | 初期値 |
| Node.js アプリ | 起動コマンド（sh -c で実行） | `npm run dev` | 初期値 |

選択イメージ：`node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205`。TCP（UIの初期設定）、UDPへの変更なし。

### 生成ファイルと配置

```text
nginx-nodejs/
  docker-compose.yml
  nodejs/Dockerfile.nodejs  [アプリ生成]
  nodejs/Dockerfile.nodejs.dockerignore  [アプリ生成]
  fixture-web/index.html  [テスト追加：固定応答の静的コンテンツ]
  nodejs/package.json  [テスト追加：devスクリプト]
  nodejs/package-lock.json  [テスト追加：外部npm依存なし]
  nodejs/server.cjs  [テスト追加：0.0.0.0:3000 HTTPサーバー]
```

テスト追加ファイルのコピー元：`test/fixtures/web-validation/`、`node-validation/`、`flask-validation/`のうち、この構成に必要なものだけ。PostgreSQLはテスト用DB名/ユーザー/ダミーパスワードを入力し、実パスワードを使用しない。

生成Compose（UI自動操作・ヘッドレス生成で一致確認済み）：

```yaml
version: "3.9"
services:
  "manual-nginx-nodejs-nginx":
    image: "nginx:1.30.6-trixie@sha256:a7675fcee220f59b4a99f7098c06a0d5d999c2c0ee37c0211efb780536e5cb20"
    restart: "always"
    ports:
      - "19480:80"
    volumes:
      - "./fixture-web:/usr/share/nginx/html:ro"
  "manual-nginx-nodejs-nodejs":
    build:
      context: "./nodejs"
      dockerfile: "Dockerfile.nodejs"
    working_dir: "/app"
    restart: "always"
    ports:
      - "19400:3000"
    command: ["sh","-c","npm run dev"]
```

生成ファイル：`nodejs/Dockerfile.nodejs`

```dockerfile
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["sh","-c","npm run dev"]
```

生成ファイル：`nodejs/Dockerfile.nodejs.dockerignore`

```text
.git
.env
.env.*
*.pem
*.key
node_modules
vendor
__pycache__
*.pyc
*.log
.npmrc
.npm
coverage
```

### GitHub Actionsでの検証結果

初回実行前：未実施。実行URL、pull/build、起動、HTTP/DB、cleanup結果は末尾の実行記録へ追記する。

## Python Flask単体

### 操作手順

1. 共通手順1〜2を実行し、「モジュール」タブで「Python アプリ（Django / Flask）」の行だけをクリックする。
2. 「構成入力」でプロジェクト名に`manual-flask`を入力する。
3. 「フレームワーク種別」のトグルをFlask側へ切り替え、表示が「Flask」になることを確認し、次の設定値表どおり入力する。
4. 「構成を実行」→「生成結果」を押し、下記の生成内容と照合する。
5. 共通手順9〜12に従い、下記の全生成ファイルを個別に保存し、fixtureを追加する。

### 設定値

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| Python アプリ（Django / Flask） | バージョン系列 | 3.14 | 初期候補 |
| Python アプリ（Django / Flask） | イメージ形式 | slim-bookworm | 初期候補 |
| Python アプリ（Django / Flask） | フレームワーク種別 | `flask` | 変更（初期値：django） |
| Python アプリ（Django / Flask） | 公開ポート（ホスト側） | `19500` | 変更（初期値：8000） |
| Python アプリ（Django / Flask） | データ保存方式 | バインドマウント（ホストパス）（`bind`） | 変更（初期値：named） |
| Python アプリ（Django / Flask） | ネームボリューム名 | `python-app` | 初期値 |
| Python アプリ（Django / Flask） | バインドマウント（ホストパス） | `./python-web` | 変更（初期値：./app） |
| Python アプリ（Django / Flask） | 起動コマンド | `（空欄）` | 初期値 |

選択イメージ：`python:3.14.9-slim-bookworm@sha256:945c2676dc2b18e0c1f16879244122c57c0ffede60006bf3df159c507a31bcae`。TCP（UIの初期設定）、UDPへの変更なし。

### 生成ファイルと配置

```text
flask/
  docker-compose.yml
  python-web/Dockerfile.python-web  [アプリ生成]
  python-web/Dockerfile.python-web.dockerignore  [アプリ生成]
  python-web/requirements.txt  [テスト追加：PyPI照合済みの版/ハッシュ]
  python-web/app.py  [テスト追加：Flask HTTPアプリ]
```

テスト追加ファイルのコピー元：`test/fixtures/web-validation/`、`node-validation/`、`flask-validation/`のうち、この構成に必要なものだけ。PostgreSQLはテスト用DB名/ユーザー/ダミーパスワードを入力し、実パスワードを使用しない。

生成Compose（UI自動操作・ヘッドレス生成で一致確認済み）：

```yaml
version: "3.9"
services:
  "manual-flask-flask":
    build:
      context: "./python-web"
      dockerfile: "Dockerfile.python-web"
    working_dir: "/app"
    restart: "always"
    ports:
      - "19500:5000"
    volumes:
      - "./python-web:/app"
    environment:
      - "FRAMEWORK=flask"
    command: ["sh","-c","flask run --host=0.0.0.0 --port=5000"]
```

生成ファイル：`python-web/Dockerfile.python-web`

```dockerfile
# Framework: Flask
FROM python:3.14.9-slim-bookworm@sha256:945c2676dc2b18e0c1f16879244122c57c0ffede60006bf3df159c507a31bcae
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV FRAMEWORK=flask
EXPOSE 5000
CMD ["sh","-c","flask run --host=0.0.0.0 --port=5000"]
```

生成ファイル：`python-web/Dockerfile.python-web.dockerignore`

```text
.git
.env
.env.*
*.pem
*.key
node_modules
vendor
__pycache__
*.pyc
*.log
```

### GitHub Actionsでの検証結果

初回実行前：未実施。実行URL、pull/build、起動、HTTP/DB、cleanup結果は末尾の実行記録へ追記する。

## PostgreSQL単体

### 操作手順

1. 共通手順1〜2を実行し、「モジュール」タブで「PostgreSQL（DB サーバ）」の行だけをクリックする。
2. 「構成入力」でプロジェクト名に`manual-postgres`を入力する。
3. 次の設定値表どおり入力する。
4. 「構成を実行」→「生成結果」を押し、下記の生成内容と照合する。
5. 共通手順9〜12に従い、下記の全生成ファイルを個別に保存し、fixtureを追加する。

### 設定値

| カード | 設定項目（実装の名称） | 値 | 初期値からの変更 |
| --- | --- | --- | --- |
| PostgreSQL（DB サーバ） | バージョン系列 | 16 | 初期候補 |
| PostgreSQL（DB サーバ） | イメージ形式 | bookworm | 初期候補 |
| PostgreSQL（DB サーバ） | 公開ポート（ホスト側） | `19532` | 変更（初期値：5432） |
| PostgreSQL（DB サーバ） | DB 名 | `ci_fixture` | 変更（初期値：appdb） |
| PostgreSQL（DB サーバ） | ユーザー名 | `ci_fixture` | 変更（初期値：appuser） |
| PostgreSQL（DB サーバ） | パスワード | `ci-fixture-only-not-secret` | 変更（初期値：secret） |
| PostgreSQL（DB サーバ） | データ保存方式 | 名前付きボリューム（推奨）（`named`） | 初期値 |
| PostgreSQL（DB サーバ） | ネームボリューム名 | `postgres-data` | 初期値 |
| PostgreSQL（DB サーバ） | バインドマウント（ホストパス） | `./pg-data` | 初期値 |

選択イメージ：`postgres:16.15-bookworm@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0`。TCP（UIの初期設定）、UDPへの変更なし。

### 生成ファイルと配置

```text
postgres/
  docker-compose.yml
```

テスト追加ファイルのコピー元：`test/fixtures/web-validation/`、`node-validation/`、`flask-validation/`のうち、この構成に必要なものだけ。PostgreSQLはテスト用DB名/ユーザー/ダミーパスワードを入力し、実パスワードを使用しない。

生成Compose（UI自動操作・ヘッドレス生成で一致確認済み）：

```yaml
version: "3.9"
services:
  "manual-postgres-postgres":
    image: "postgres:16.15-bookworm@sha256:d81f7b51697014367236d07ec58b54153fc28f828b72bf247fe5c7487520bcb0"
    restart: "always"
    ports:
      - "19532:5432"
    volumes:
      - "manual-postgres-postgres-data:/var/lib/postgresql/data"
    environment:
      - "POSTGRES_DB=ci_fixture"
      - "POSTGRES_USER=ci_fixture"
      - "POSTGRES_PASSWORD=ci-fixture-only-not-secret"
volumes:
  "manual-postgres-postgres-data":
```

### GitHub Actionsでの検証結果

初回実行前：未実施。実行URL、pull/build、起動、HTTP/DB、cleanup結果は末尾の実行記録へ追記する。

## 実機確認範囲

6パターン全てで実Electron画面のタブ・選択行・既存入力・生成ボタン・生成結果切替を自動操作し、Composeと全Dockerfile/ignoreの一致、ローカル保存IPCの書込みを確認した。OS保存ダイアログの人手操作は未実施。手順のタブ名・項目名・非表示初期値はUIソースと実DOMを照合した。ローカルDocker起動は未実施。GitHub上の起動/応答確認は実行記録で別に報告する。

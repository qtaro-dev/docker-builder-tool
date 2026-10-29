# Webサーバー構築支援の実装・検証記録

2026-10-29。アプリ本体の構築支援のみを拡張。Docker実行・稼働監視・管理APIは製品には追加していません。コミット・push・公開なし。

## 操作

1. NginxまたはApacheを選択し、既存の基本入力・永続化設定を行います。
2. 転送が必要な場合は「詳細設定（リバースプロキシ）」を開き、OFFからONへ変更します。
3. 選択中のHTTP対応モジュールから転送先を選び、転送元パスを`/`または`/api/`などで指定します。末尾の`/`は必須です。内部サービス名とポートは既存モジュール定義から決定し、DBなどの非HTTPサービスは候補に出しません。
4. 設定確認チェックを行い「構成を実行」。設定変更は従来どおり確認状態を解除します。
5. 「生成ファイル一式を保存」で保存先の親フォルダを選択します。既存ファイルを上書きしない新しい`docker-builder-<ランダム値>`フォルダを作成し、相対パスを維持して保存します。既存の個別表示・編集・ダウンロードも残しています。
6. そのフォルダで`docker compose up -d`。名前付きボリュームの場合は、初回に生成Dockerfileからイメージがビルドされます。

## 既定の名前付きボリュームの場合

```text
docker-builder-xxxxxx/
├─ docker-compose.yml
├─ nginx/                         # 選択した場合
│  ├─ Dockerfile.nginx
│  ├─ Dockerfile.nginx.dockerignore
│  ├─ conf/default.conf
│  ├─ html/index.html
│  └─ setting.html                # 公開フォルダ外。ローカルで開く
└─ apache/                        # 選択した場合
   ├─ Dockerfile.apache
   ├─ Dockerfile.apache.dockerignore
   ├─ conf/httpd-support.conf
   ├─ html/index.html
   └─ setting.html
```

`index.html`は「構築完了テストページ」。新規名前付きボリュームは、固定digestの公式ベースイメージに追加した初期HTMLから初期化します。既存の名前付きボリュームは上書きしません。ビルドコンテキストではHTML以外をdockerignoreで除外し、管理HTMLをイメージへ含めません。

バインドマウントで`./public`を指定した場合は、`public/index.html`を生成し、元のバインド指定を保持します。Web用Dockerfileは不要です。絶対パス等で保存先外を指定した場合は`nginx/html/index.html`等を別途コピーする必要があり、配置ガイドで明示します。未配置のまま動くとは扱いません。公開マウントがsetting.htmlを含む配置、パスの重複、不正な保存パスは生成エラーにします。

## リバースプロキシ

- 初期値OFF。通常のWebサーバーとして初期HTMLを配信。
- ONは選択済みHTTP対応モジュールだけ。転送先未指定、不正/予約パス、内部ポート不整合、HTTP用ポートがUDPの場合を拒否。
- `/api/`はバックエンドの`/`へ転送（接頭辞除去）。`/`の転送は初期HTMLより優先します。
- 転送先のアプリ・package/lock・ソース・DB接続設定は利用者が用意します。アプリを自動生成したり、準備済みと表示したりしません。
- depends_onは起動順のみ。バックエンドの準備待ち、アプリ固有のbase path・WebSocket・HTTPS・証明書設定は今回の自動生成対象外です。
- Node.js等の既存ホスト公開ポートは勝手に変更しません。外部への公開範囲は起動前に確認してください。

## 管理HTMLと保存の安全性

setting.htmlは生成時のWeb種類・固定イメージ・選択モジュール・公開/内部ポート・転送設定だけを許可リストで表示します。入力設定全体や環境変数は出力せず、秘密値は含めません。表示値はHTMLエスケープします。

setting.htmlはコンテンツマウント元の外へ保存し、HTTPでもNginxは404、Apacheは403で拒否します。Apacheの403確認時のAH01630は拒否テストに対応する想定ログです。

一式保存は既存の信頼済みmain-frame IPC検査を使用し、ネイティブダイアログで選択した保存先の新規フォルダだけに書き込みます。相対パス・ファイル名・件数・合計サイズ・重複・Windows予約名を検証し、パストラバーサルや実行ファイル保存を拒否します。Electronのsandbox/contextIsolation/CSPは変更していません。保存失敗時には未完了であることを表示します。

## 検証

- `npm test`：62件成功、失敗/スキップ0。既存35レシピの全グループの生成・模擬実行検査も含む。
- `npm run test:electron`：成功。19モジュール、9テーマ、確認チェック、秘密値保護、既存保存機能、新規Web詳細設定、HTTP限定候補、生成内容、確認解除、一式保存の実書き込み、危険な保存パス拒否を確認。
- 保存先のネイティブ選択ダイアログはテスト境界でスタブ。IPC・ファイル作成・相対配置・内容照合は実処理。手動のOSダイアログ操作は未確認。
- 新規詳細設定も全9テーマ・1280×720の横はみ出しなし。ライト・ダークの実Electronキャプチャを目視確認。

Docker Desktopのdesktop-linux（Windows/WSL 2）で、本体の生成処理から変更せず作成した8構成を実検証：

| 構成 | 初期ページ/転送 | 管理HTML HTTP | cleanup |
| --- | --- | --- | --- |
| Nginx単体・名前付き | 200・初期ページ | 404 | 成功 |
| Apache単体・名前付き | 200・初期ページ | 403 | 成功 |
| Nginx→Node.js `/api/` | 初期ページとNode応答200 | 404 | 成功 |
| Apache→Node.js `/api/` | 初期ページとNode応答200 | 403 | 成功 |
| Nginx単体・bind | 200・初期ページ | 404 | 成功 |
| Apache単体・bind | 200・初期ページ | 403 | 成功 |
| Nginx→Node.js `/` | Node応答200・初期ページより優先 | 404 | 成功 |
| Apache→Node.js `/` | Node応答200・初期ページより優先 | 403 | 成功 |

全件でconfig・pull/build・up・HTTP本文照合・setting内容照合・専用downを実行。Node.jsのソースは既存test/fixtures/node-validationを追加し、本体生成物と区別しています。専用プロジェクトごとのコンテナ・ネットワーク・ボリューム残存0を確認。取得/ビルドしたイメージとビルドキャッシュは保持しています。

ログ：`release/web-support-unit.log`、`release/web-support-electron.log`。
実Docker結果と生成物：`release/web-support-7akLNm/results.json`と各ケースのフォルダ。
実画面：`release/web-support-ui/advanced-light.png`、`advanced-dark.png`。
再実行：`node scripts/web-support-validation.cjs`（専用リソースで実Dockerを操作する開発者用スクリプト）。

Composeの既存version属性について非推奨警告があります。互換性維持のため共通シリアライザーの仕様は今回変更していません。

35レシピすべてのDocker実動作を今回再実行したものではありません。旧マニュアル例のCompose照合は、Web追加設定マウント・Web初期化ビルド・Apache include起動指定だけを許容する構造比較にし、それ以外の既存サービス設定/アプリDockerfileは引き続き一致検査します。追加fixtureによるindex.html置換は利用者コンテンツとして明示的に許容し、他の生成ファイルの上書きは禁止のままです。公開マニュアル・既存Actionsの検証結果は更新していません。

最終Docker一覧確認時点では今回の検証リソースを含めコンテナ0件。前回の8080/54717環境も存在しませんでした。本作業の停止/削除コマンドは今回作成した一意のdbt-web-*プロジェクトだけを対象とし、前回環境の再作成や変更は行っていません。

## 主な変更ファイル

- `app/src/module-assets.js`：追加生成物・安全な管理HTML・Web設定とマウント。
- `app/src/project-generation.js`：共通model.filesへの追加生成物の統合。
- `app/src/modules/nginx.js`、`apache.js`：詳細設定の定義。
- `app/src/renderer.js`、`renderer/modules_ui.js`、`app/src/style.css`：読み込み・詳細設定・候補UI。
- `app/index.html`、`renderer/generated-files.js`、`renderer/ui.js`：追加ファイル表示・一式保存。
- `app/src/generation-guide.js`：相対配置と一式保存/前提条件の説明。
- `main.js`、`preload.js`、`security.js`：用途限定の一式保存IPCと入力検証。
- `scripts/lib/manual-recipe-generation.cjs`：旧35レシピとの差分を限定した照合。
- `scripts/web-support-validation.cjs`：分離した実Docker検証。
- `test/web-support.test.js`、`web-support-smoke.cjs`：新規回帰テスト。既存の生成/ガイド/保存/許可APIテストとrunnerも新仕様に合わせて更新。

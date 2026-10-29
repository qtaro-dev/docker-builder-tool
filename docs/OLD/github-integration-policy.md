# アプリ本体のGitHub非連携方針

確定日・調査日：2026-10-26。対象：v0.3.0-dev.0の現在の開発ソース。

**アプリ本体からGitHub/GitHub Actionsへ接続・認証・生成物の送信・ジョブ起動を行う機能は実装しない。** GitHub OAuth、GitHub App、PATの入力/保存/読取り、GitHub APIによるリポジトリ操作も追加しない。

## 調査結果

| 確認項目 | 結果・根拠 |
| --- | --- |
| OAuth / GitHub App / PAT認証 | 実装なし。main/preload/Rendererの起動・メニュー・UI・通信処理を確認 |
| GitHubトークン入力・保存・読取り | 専用UI・設定キー・環境変数/認証ストア読取りなし。設定は既存の名前・テーマ・固定パスキーだけを許可し、未知のキーを拒否 |
| リポジトリ操作 / Actions起動 | APIクライアント・起動IPC・実装なし。preloadの公開操作12個にGitHub操作も汎用HTTP/IPCもない |
| Compose / Dockerfile自動送信 | 実装なし。ファイル保存はネイティブ保存ダイアログで利用者が選んだローカルファイルへの書込み。コピーはローカルのクリップボード |
| 関連する不要UI・IPC・依存 | 見つからず。削除対象なし。production依存は空、GitHub認証/操作SDKの導入なし |

確認範囲：`main.js`、`preload.js`、`security.js`、`image-catalog.js`、`app/`配下のHTML/Renderer/全モジュール/カタログ、package.json/lockfileの依存区分と実際のnpmツリー、開発スクリプトとCIの区別。

アプリ本体の通信処理はmain側のDocker Hubメタデータ取得。取得先は固定された`https://hub.docker.com/v2/namespaces/…`、GETのみ、任意URL・トークン・リクエスト本文をRendererから受け取らない。GitHub等の別ホストはHTTPS要求開始前に拒否し、redirectも追跡しない。この既存処理を維持する。

RendererのCSPは`connect-src 'none'`、外部ナビゲーション/新規ウィンドウは禁止。`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、IPC送信元検証を変更していない。

## 維持するGitHub関連の記載・開発ファイル

- `app/src/image-versions.js`のOllama公式リポジトリURLは**情報源として表示する文字列**。取得先URLではなく、GitHubへ自動接続する処理はないため残す。
- `.github/workflows/docker-validation.yml`、`scripts/docker-validation.cjs`、ヘッドレス生成・テストfixture・関連テスト/ドキュメントは、GitHub側で実行する開発用検証であり維持する。アプリから起動/送信する導線は追加しない。
- ドキュメント中の`gh workflow run`は開発者が手動で実行する説明であり、アプリのコードから呼び出していない。
- Electron開発バイナリの取得ツール`@electron/get`や、electron-builderの推移的dev依存`electron-publish`/`builder-util-runtime`にはGitHub配布に関するコードがある。開発時の起動・インストーラー生成で正当に使われる依存なので削除しない。アプリ本体からこれらのGitHub機能を呼び出す処理はない。
- ビルド対象は既存の実行用許可リスト（main/preload/security/image-catalog/package.json/app配下）。scripts/test/.githubは含めない。`publish: null`と`--publish never`を維持する。今回は新しい配布物の生成・内容検証までは行っていない。

GitHub側CIのArtifactアップロードはGitHub runner側の開発用処理であり、アプリが利用者の生成物を送信する機能とは別。今回CIファイルを削除・実行・公開していない。

## 回帰検証

`test/github-policy.test.js`で次を確認する：

- GitHub OAuth/API/Actions dispatch/contents/uploads/rawのURLが通信開始前に拒否され、実際のHTTPS要求が0回であること。
- 全カタログポリシーの更新先がDocker Hubへ固定されていること。
- GitHub認証・Actions用の設定キーを既存スキーマが拒否すること。
- preloadの公開操作が既存の12個だけで、更新へ渡したURL/認証引数をIPCへ転送しないこと。

Electron回帰テストでも、トークン用設定キーをsaveSettingsへ渡すと拒否され、設定ファイルが変わらないことを確認する。入力は固定の無害なプレースホルダーであり、本物のトークンは使用しない。既存の19モジュール・設定/テーマ・生成/保存・Docker Hub更新・CSP/IPC等のテストも維持する。

アプリ機能・UI・IPC・依存を削除する変更は不要だった。今回の変更は方針文書と回帰テストのみ。既存の未コミット作業とローカル設定を保持し、コミット・pushは行わない。

実行結果：`npm test` 32件成功、`npm run test:electron`成功、`npm audit --json`は0件。GitHubへの実接続・認証・送信・Actions起動は実施していない。Docker実動作とGitHub側CIの初回実行は今回の検証対象外で、未検証のまま。

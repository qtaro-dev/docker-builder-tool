# セキュリティ修正・検証記録

確認日: 2026-10-24（日本時間）

## 調査結果

- 直接依存は開発用の Electron。更新前のロックファイルは Electron 39.2.4。
- 更新前の `npm audit --json`: High 3件（electron、extract-zip、http-cache-semantics）。これは脆弱なパッケージの集計で、個別アドバイザリの件数とは異なる。
- renderer は `nodeIntegration: true`、`contextIsolation: false` で、Node.js の `fs` と Electron IPC を直接使用していた。既存の preload.js は BrowserWindow に設定されていなかった。
- IPC に送信元・引数の検証がなく、CSP、ナビゲーション、新規ウィンドウ、権限要求の制限もなかった。
- 生成時のメッセージに入力由来の文字列を `innerHTML` で渡していた。Compose の値も YAML に直接連結されていた。

## 修正

- Electron を **45.0.0** に固定し、package-lock.json を更新。Node.js の必要条件は **22.12.0 以上**（検証環境は22.18.0）。`npm audit fix --force` は使用していない。
- `extract-zip@2.0.1` は上流の `@electron-internal/extract-zip@1.0.6` に置き換わり、`http-cache-semantics` を含む古いダウンロード依存ツリーは除去された。独自の overrides は追加していない。
- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`、`webviewTag: false` を明示。
- preload から設定取得・保存、ディレクトリ検証・選択、ログ、バージョン、生成ファイル保存、メニュー通知だけを公開。任意の IPC チャンネル、Node.js、Electron のイベントオブジェクトは公開しない。
- main 側で、送信元がアプリのウィンドウ・メインフレーム・正確な index.html URL であることを検証。設定のキー・テーマ・型、文字列長、NUL、保存対象名を検証する。ログ内の改行も除去する。
- 保存は従来の「ダウンロード」ボタンから OS の保存ダイアログを開く。renderer は保存先パスを指定できず、ユーザーが選択した保存先に main が UTF-8 で書き込む。保存対象は docker-compose.yml / Dockerfile に限定。キャンセルは書き込みを行わない。
- CSP でローカルスクリプト・CSS・画像だけを許可。外部通信、フレーム、インラインスクリプト等を拒否する。ページ遷移、新規ウィンドウ、webview を拒否し、権限はアプリのメインフレームからのクリップボードへのテキスト書き込みだけを許可する。
- メッセージを `textContent` に変更し、複数行の表示は CSS で維持。Compose の値とキーは JSON 形式の YAML 値でエスケープし、配列の command は配列として保持する。
- 入力欄とラベルの両方に同じ data-field-name があったため、生成処理がラベルを拾う既存不具合を修正。
- 全モジュールの回帰検証で見つかった Ollama の未定義変数、名前付きボリュームの未出力、保存方式の初期値・パス参照属性を修正。モジュール・UI は削除していない。
- Ollama の初回モデル取得スクリプトでモデル名をシェル引数として引用し、オプション形式の入力を拒否。モデル名を通じたコマンド挿入を防ぐ。
- 設定パス検証を非同期 IPC に変更。設定の書き込み失敗は呼び出し側へ返し、失敗時にメモリ上の設定だけが更新されないようにした。

## 検証

実行コマンド:

```powershell
npm ci
npm test
npm run test:electron
npm audit --json
```

- `npm test`: 6テスト成功。全19モジュールのデフォルト生成・バインドマウント生成、Compose のエスケープと command 配列、Ollamaのモデル名のシェル引用・オプション拒否、IPC送信元検証、不正な設定・引数拒否、preload の公開範囲とイベント除去を確認。
- `npm run test:electron`: 実際の Electron 45.0.0 で main.js / preload / HTML / renderer を読み込み、起動、19モジュールの一覧、権限設定、バージョン取得、Nginx の選択・ポート入力・Compose生成、Node.jsのDockerfile生成、2種類のファイル保存、コピー、フォルダ参照、ディレクトリ検証、設定の保存・再読み込み、メニューの新規・生成・クリア・設定・Aboutを確認。
- 保存キャンセル、別ウィンドウからのIPC拒否、不正なIPC引数拒否、ログ改行対策、HTMLを含むエラー表示、CSPによるスクリプト・通信の拒否、新規ウィンドウと外部遷移の拒否も確認。
- 実機テストは一時ディレクトリへアプリをコピーし、設定・ログ・プロファイル・出力を分離する。OSのフォルダ・保存ダイアログの戻り値だけをテスト内で置き換え、preload/IPC経由の処理と実ファイルの保存内容を検証する。OSダイアログ自体の手動操作はこの自動テストの対象外。
- テストで意図的に送る不正なIPCについては、Electronのコンソールに拒否エラーが出る。正常系のrenderer/preloadエラーは発生していない。
- Windowsの実機テストは、制限付き実行環境では起動直後に終了したため、通常のデスクトップ実行環境で実施した。

## 残存する脆弱性と検証範囲

- 修正後の `npm audit --json`: **0件**（High / Critical / Moderate / Low すべて0件）。開発依存も含めて監査した。
- GitHub反映前のDependabot Alertsを認証付きAPIで全件取得（ページングなし）: 未解決42件。Electron 38件、extract-zip 2件、http-cache-semantics 1件、sprintf-js 1件。重大度はHigh 15件、Medium 21件、Low 6件。sprintf-jsの1件は撤回済みアドバイザリ（GHSA-hp3w-g68c-fv3c）として表示されていた。
- Electron 45.0.0への更新と依存ツリーの置換により、上記パッケージの旧バージョンは更新または除去されている。GitHub側の解消件数は、mainへのマージ後にAPIで再確認する。アラートの手動dismissは行わない。
- Dockerコンテナの起動、生成された構成での外部サービス接続、配布パッケージの作成・署名は実施していない。テストは構成の生成とアプリ内の機能・権限境界を検証している。

参照: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)

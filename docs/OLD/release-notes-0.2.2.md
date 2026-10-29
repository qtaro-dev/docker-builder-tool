# Docker Builder Tool 0.2.2

Windows x64用インストーラーを公開します。

## 変更内容

- Electron 39.2.4から45.0.0へ更新し、既知の脆弱性を修正。
- rendererのNode.js連携を無効化し、contextIsolation・sandboxを有効化。OS操作は用途を限定したpreload/IPC経由へ移行。
- IPC送信元・引数の検証、CSP、画面遷移・権限制限、HTML/YAML挿入対策を追加。
- 既存UIと19種類のモジュールを維持。設定保存、Compose/Dockerfile生成、コピー、ファイル保存に対応。
- 入力欄の値の読み取りとOllamaの生成処理にあった不具合を修正。モデル名を通じたコマンド挿入も防止。
- Windows配布用のビルド設定と、配布内容・インストール後の機能を確認するスクリプトを追加。

## 配布ファイル

- `Docker.Builder.Tool.Setup.0.2.2.x64.exe`
- Windows x64用、ユーザー単位のNSISインストーラー。
- SHA-256は添付の`SHA256SUMS.txt`を参照。

**コード署名はありません（未署名）。Windows SmartScreenの警告が表示される可能性があります。**

## 検証結果

- Windows 11 x64（OSビルド26200）でビルド、実インストール、起動、アンインストールを確認。
- インストール後のexeで、19モジュール、入力変更、Compose/Dockerfile生成、設定の保存・再起動後の反映、preload/IPC、権限分離、CSPを自動検証。
- `npm ci`、`npm test`（6件）、`npm run test:electron`、配布ファイル検査が成功。
- `npm audit`: ビルド用の開発依存を含め、全重大度0件。
- 配布アーカイブには実行に必要な51ファイルだけを同梱。設定、ログ、認証情報、テスト、開発依存は含めていない。

未検証: OSダイアログとインストールウィザードの手動操作、通常起動時の視覚的な画面確認、旧0.2.1からの上書き更新、Windowsの別ビルド・別ユーザー環境。Dockerコンテナや外部サービスの起動は行っていません。

旧`v0.2.1`リリースと実行ファイルは維持しています。GitHub Dependabot Alertsは手動dismissしていません。

[変更履歴](https://github.com/qtaro-dev/docker-builder-tool/compare/v0.2.1...v0.2.2)

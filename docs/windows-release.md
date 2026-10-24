# Windows配布のビルドと検証

## ビルド

Windows x64、Node.js 22.12.0以上を使用する。0.2.2の検証環境はWindows 11 x64（OSビルド26200）、Node.js 22.18.0、npm 10.9.3。

```powershell
npm ci
npm audit
npm test
npm run test:electron
npm run build:win
npm run verify:package
```

electron-builder 26.18.0とElectron 45.0.0をロックファイルで固定。`build:win`はローカルのNSISビルドだけを実行し、GitHubへ自動公開しない。初回はElectronとNSISのビルド用バイナリがダウンロードされる。

出力: `release/Docker.Builder.Tool.Setup.0.2.2.x64.exe`

ユーザー単位のインストールとし、インストール先を選択できる。管理者権限への昇格・昇格ヘルパー・自動更新機能は使用しない。証明書は用意せず、`signExecutable: false`で未署名としてビルドする。署名検証やElectronの実行時セキュリティ設定を無効化する変更はしていない。

## 配布内容

ASAR内は`main.js`、`preload.js`、`security.js`、製品メタデータと`app/`配下のJS・HTML・CSS・画像だけ。`verify:package`で全51ファイル、19モジュール、ソースとのバイト一致を確認する。

ローカルの`settings.json`、ログ、テスト、検証用スクリプト、docs、Git情報、開発依存、認証情報は同梱しない。パッケージ内のpackage.jsonからもビルド設定・開発スクリプト・開発依存が除去される。Electronのランタイム・Chromiumのライセンス情報は配布する。

## 0.2.2の検証結果

確認日: 2026-10-24（日本時間）。

| 確認 | 結果 |
| --- | --- |
| `npm ci` | 成功 |
| `npm audit --json` | 全重大度0件。ビルド用の開発依存を含む |
| `npm test` | 既存6テスト成功。全19モジュールのデフォルト・バインドマウント生成を含む |
| `npm run test:electron` | 成功。生成・保存・コピー・設定・メニュー・IPC拒否・CSP等を確認 |
| `npm run build:win` | Windows x64 NSISインストーラー生成に成功 |
| `npm run verify:package` | 成功。配布対象と元ソースを照合 |
| 実インストール | 専用の空フォルダへ`/S /D=...`で実施、終了コード0。Windowsへの登録とバージョン0.2.2を確認 |
| インストール後の内容 | インストール済みapp.asarにも同じ配布ファイル検査が成功 |
| インストール後の機能 | 下記スクリプトで2回の起動・正常終了、Electron 45.0.0、ASAR内preload/IPC、19モジュール、入力変更、Compose/Dockerfile生成、設定保存・再起動後の反映、ディレクトリ検証、権限分離・CSPを確認 |
| デバッグオプションなしの起動 | 別途起動プロセスを確認。画面操作は未検証 |
| 実アンインストール | `/S /currentuser`で実施、終了コード0。インストール済みexeとアプリ登録の削除を確認 |
| Authenticode | インストーラーは`NotSigned` |

インストール後の自動検証:

```powershell
node scripts/verify-package.cjs "C:\path\to\installed\resources\app.asar"
node scripts/smoke-installed.cjs "C:\path\to\installed\Docker Builder Tool.exe"
```

`smoke-installed.cjs`はテスト実行時だけループバックの一時的なChromiumデバッグ接続を使い、アプリの設定を最後に元へ戻す。デバッグオプションやテストフックは製品コードへ追加していない。`test:electron`は一時コピーで実行し、OSダイアログの戻り値だけを置き換えて実際のIPC・保存内容を検証する。

未検証: OSダイアログ・インストールウィザードの手動操作、通常起動時の視覚的な画面確認、旧0.2.1からの上書き更新、Windowsの別ビルド・別ユーザー環境。画面確認はcomputer-useのアプリ操作許可がタイムアウトしたため完了していない。Dockerコンテナ・外部サービスは起動していない。

## 既存リリースと署名

旧`v0.2.1`の`Docker.Builder.Tool.Setup.0.2.1.exe`は読み取り専用で調査した。NSIS-3 Unicode形式・64bitアプリ入り・未署名であり、当時のビルド設定はGit履歴に残っていない。旧リリースのexeのSHA-256はGitHubのdigestと一致しており、削除・上書きしない。

0.2.2も未署名のため、ダウンロード・実行時にWindows SmartScreenの警告が表示される可能性がある。配布するexeのSHA-256はReleaseの`SHA256SUMS.txt`で確認する。

Dependabot Alertsの手動dismissは行わない。`npm audit`の件数とGitHubのAlertsの表示は別々に確認する。

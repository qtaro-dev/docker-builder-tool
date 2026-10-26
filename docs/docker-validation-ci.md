# 現行CI：6構成の実動作検証

ユーザー承認により、下記の当初build-only仕様を拡張した。現在の対象はNginx、Apache、Node.js、Nginx＋Node.js、Flask、PostgreSQL。Ubuntu 24.04で本体生成→config -q→pull/build→up -d --build→running状態とHTTP/認証付きDB TCP接続・SQL→ログ採取→down -v --remove-orphansを行う。6ケースの操作値・生成物・実行URLと結果は[操作・検証記録](docker-validation-manual.md)を参照。

ケース固有のproject名・ポート・ディレクトリを使う。起動/応答失敗を成功へ変更せず、最大30回/90秒の待機を行う。正常/異常いずれも自分のprojectだけを削除し、alwaysステップは保存Composeのハッシュ・project名を照合して中断後のcleanupを再試行する。全体25分、検証step28分、Ubuntu job35分。cleanupには独立した期限を与える。Artifactにはup/response/containers/cleanupログも含む。コンテナ起動はCIのみ許可し、ローカルのgenerate-onlyはDockerを呼ばない。

PostgreSQLは公開して問題ないダミーのCI専用資格情報のみを使い、ホストのpsqlから127.0.0.1へTCP接続して一時テーブルへのINSERT/SELECT（合計42）を確認する。FlaskのPyPI依存は版とwheel hashを固定する。Nginx＋Node.jsのプロキシ連携とイメージCVE検査は対象外。

既存のアプリ単体/実機テストは維持する。main・Release・タグ・Dependabot設定は変更しない。実際のActions成功が得られるまでは、模擬テストだけでDocker動作成功と報告しない。

## 以下は初回CI導入時の記録（build-only）

# v0.3.0 Docker生成構成のCI検証

ワークフロー：`.github/workflows/docker-validation.yml`（Actions表示名：**Docker validation (v0.3.0)**）。現在の開発ブランチ`codex/appearance-theme-preview`を対象に設定した。ローカルの既存ワークフローはなかった。公開済みv0.2.2のRelease・タグ・配布物は変更しない。

**実装とローカル検証まで実施済み。GitHub Actionsでの初回実行、Docker構文コマンド、Dockerfile実ビルドは未確認。** コミット・push・PR・公開を行っていないため、CI成功を確認した状態ではない。

## 実行契機と初回実行

- `codex/appearance-theme-preview`へのpush。
- **ベースブランチ**が`codex/appearance-theme-preview`のPull Request。`pull_request_target`は使わない。
- `workflow_dispatch`による手動実行。

初回は次の順序で行う（実施にはユーザー承認が必要）：

1. 現在の未コミット変更をレビューする。CI追加ファイルだけでなく、依存するv0.3.0本体の共通生成・カタログ等の変更もリモートに必要。`node_modules`、`release/`、ログ、認証情報、`settings.json`のローカル変更は含めない。
2. 承認後、必要な変更をコミットし、開発ブランチへ通常pushする。強制pushは不要。
3. リポジトリのActionsから**Docker validation (v0.3.0)**を開く。push対象SHAと実行ブランチを確認する。Actionsが無効化されている場合やfork PRの承認待ちでは、リポジトリ管理者が設定/実行を承認する。
4. UbuntuのDocker検証とWindowsのElectron回帰が両方成功したか確認する。初回の実際の結果に応じて修正する。現時点ではこの確認を行っていない。

### 手動実行時のGitHubの制約

`workflow_dispatch`を発火させるには、ワークフローが**デフォルトブランチにも存在する必要がある**。開発ブランチにだけ追加した初回は、Run workflowが表示されない/実行できない場合がある。その場合はまず上記push起動を使用し、手動実行のためだけに無断でmainへマージしない。

承認された手順でデフォルトブランチへ登録された後は、Actions → 対象workflow → **Run workflow** → Branchに`codex/appearance-theme-preview`を選択して実行する。GitHub CLIを使う場合：

```bash
gh workflow run docker-validation.yml --repo qtaro-dev/docker-builder-tool --ref codex/appearance-theme-preview
```

CLIもデフォルトブランチ登録の制約を回避するものではない。[GitHub公式の手動実行説明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## 検証対象と方法

| ケース | Compose構文 | Dockerfile build | コンテナ起動 |
| --- | --- | --- | --- |
| Nginx単体 | `docker compose config -q` | 対象外（既成imageのみ） | 行わない |
| Node.js単体 | 同上 | `docker compose build` | 行わない |
| Nginx＋Node.js | 同上 | Node.jsのみbuild | 行わない |

GitHub-hosted **ubuntu-24.04** runnerのDocker Engine/Composeを利用する。開発PCにDocker Desktopをインストールする必要はない。Node.jsはプロジェクトの`>=22.12.0`に合わせて22系列を使用し、`npm ci`・`npm test`・`npm audit`も実行する。

`scripts/lib/headless-generation.cjs`は、アプリの登録型19モジュールをDOMなしでロードし、既存の`ProjectGeneration.build()`と共通`ComposeSerialization.renderComposeYaml()`を呼ぶ。CI用のCompose/本番ロジックを別途手書きしていない。カタログは同梱データを使用し、オンライン更新を実行しない。

ケースごとに独立した一時ディレクトリとランダムなプロジェクト名を使用し、本体が返したCompose、Dockerfile、専用dockerignoreを保存する。Node.jsのcontextにだけ`test/fixtures/node-validation/`のpackage.json・lockfile・server.cjsをコピーする。これは外部npm依存を持たない**テスト専用fixture**で、利用者向けアプリを自動生成する機能ではない。

構文検証の前に、YAML、サービス名/件数、build.contextとbuild.dockerfile、ディレクトリ外参照/リンク拒否、Dockerfile/ignoreの実在、完全タグ/digestとFROMの一致、CMD/command、ポート、Node.jsの/app非マウント、Nginxボリューム宣言、fixture lockfile等を検証する。

**`config -q`はComposeを検証するが、DockerfileのRUN/COPYが成功することは保証しない。** そこでNode.jsケースでは実ビルドも実行する。build成功は起動/通信/アプリ要件の充足や脆弱性がないことまでは保証しない。Nginx＋Node.jsのリバースプロキシは自動生成しない既存仕様を維持する。

### Electronテストの分離

既存のElectron GUI回帰はWindowsで検証されているため、**windows-2025**の独立ジョブで`npm ci`と`npm run test:electron`を実行する。インストール済みElectron 45のコードを確認したところ、バイナリは必要時（require時）に取得される。Ubuntuの単体/生成検証ではElectron本体をrequireせず、実機ジョブで実行する。GUIテストを無条件にスキップして成功扱いにはしない。Windowsジョブの失敗はworkflow全体の失敗になる。

`--no-sandbox`やcontextIsolation/CSPの緩和は追加しない。既存の使い捨てアプリコピーとuserDataで、19モジュール・設定・テーマ・更新・保存・ガイド・IPC/CSPを実機検証する。GitHubのWindowsセッション上で動くかは初回実行で確認が必要。

## 結果・ログの確認

UbuntuジョブのSummaryに各ケースの以下を表示する：

- 本体生成/静的検証、Compose構文、Dockerfile buildの成否。
- 実行結果と失敗理由。
- `NOT_RUN`（未実施）と`NOT_APPLICABLE`（Nginxのbuild対象外）の区別。

依存インストール/既存テスト/監査で先に失敗した場合も、常時実行のサマリーステップで未実施理由を表示する。途中中断時に確定していないケースを成功扱いにしない。

Artifact **docker-validation-<run_id>-<attempt>**（保存期間7日）には以下だけを格納する：

```text
results.json / summary.md
docker-environment.log          # Docker/Compose前提条件（実行時のみ）
registry-preflight.log          # Nodeベース取得（実行時のみ）
nginx/
  docker-compose.yml / generation.log / compose.log / build.log
nodejs/                         # ケース名。さらに中のnodejs/がbuild context
  docker-compose.yml / generation.log / compose.log / build.log
  nodejs/
    Dockerfile.nodejs / Dockerfile.nodejs.dockerignore
    package.json / package-lock.json / server.cjs
nginx-nodejs/
  ...同様の生成物とログ
```

Electronジョブのログは別Artifact **electron-regression-<run_id>-<attempt>**。認証ファイル、ローカル設定、実ユーザーのソース、本番DBデータは収集しない。Ubuntuは生成物/fixtureの許可リストだけを保存し、リポジトリやHOME全体をアップロードしない。

失敗調査は`generation.log` → `compose.log` → `registry-preflight.log` → `build.log`の順で行う。Nodeベースイメージ取得を事前段階に分け、同一ベースは3ケース内で1回だけpullする。Nginxの実イメージは構文検証に不要なのでpullしない。

分類例：`registry-reference`はタグ/digestの参照不成立（削除・誤ったデータ等）、`registry-rate-limit`/`registry-auth`は配布元制限や認証、`external-network-possible`はDNS/TLS等のログから推定した通信障害。RUN/COPY等の不具合は通常`compose-build (docker-command)`に記録する。分類はログに基づく補助判断であり、外部障害と断定しない。どの場合もCIを失敗させ、黙って成功にしない。

## 実行コストと権限

- `contents: read`のみ。checkoutの認証情報を作業ツリーへ残さず、公式3アクションは確認したcommit SHAに固定する。
- Secretsは使用しない。PRコードへ書込み権限を渡さず、`pull_request_target`も使わない。
- Docker子プロセスは任意のDOCKER_HOST/CONTEXT・認証変数を引き継がず、空の専用DOCKER_CONFIGとenv-fileを使用する。
- Ubuntuジョブ20分、検証ステップ14分、検証スクリプト全体12分。各config等は最大60秒、pull4分、build5分（残りの全体期限を上限とする）。Windowsジョブ15分、既存テスト内にもプロセス期限がある。
- 実行ログはコマンドごとに最大8MiB。生成物とコマンド開始記録を先にArtifact対象へ書き、終了/タイムアウト時に出力を追記する。強制中断時は最後の開始コマンドと確定済みの結果を確認する（終了前のバッファ出力まで必ず保存できるわけではない）。
- 起動・通信・DB・全19モジュールのDockerビルド・Trivy等は対象外。`up`/`run`/`down`/`prune`を実行しない。Dockerリソースを全体削除せず、生成したイメージは使い捨てrunner終了時に破棄される。一時ファイルだけを自身の検証ディレクトリから削除する。

## Dockerなしでローカル確認

```bash
npm ci
npm test
npm run test:electron
npm audit
npm run test:docker:generate
```

最後のコマンドはDockerを一切呼ばず、3ケースの生成・静的検証だけを実行する。出力は無視対象の`release/docker-validation/`。`STATIC_ONLY`/`NOT_RUN`はDocker検証成功の意味ではない。`npm run test:docker`はDockerを呼ぶCI用コマンドで、この開発PCでは実行しない。

ローカル確認結果（2026-10-26）：npm ci成功、29単体テスト成功（Dockerコマンド分岐の試験はmock）、3構成の実生成/静的検証成功、fixtureのnpm ci成功。既存Electron実機テスト成功、npm auditは0件。**Ubuntu/Windowsの実際のActions実行結果を確認してから、CI導入完了と判断する。**

## 今回の変更ファイル

- `.github/workflows/docker-validation.yml`
- `scripts/docker-validation.cjs`、`scripts/lib/headless-generation.cjs`
- `app/src/compose-serialization.js`（既存関数の移動）、`app/src/renderer.js`、`app/src/renderer/generate.js`
- `test/docker-validation.test.js`、`test/generation.test.js`
- `test/fixtures/node-validation/package.json`、`package-lock.json`、`server.cjs`、`README.md`
- `package.json`（検証用npm scriptsのみ）
- `README.md`、`docs/docker-validation-ci.md`、`docs/v0.3.0-development.md`

既存の未コミットv0.3.0/テーマ変更とローカル設定差分を保持し、この作業でそれらをコミット・公開していない。

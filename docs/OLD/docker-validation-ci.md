# v0.3.0：生成Docker構成の実動作検証CI

ワークフロー：`.github/workflows/docker-validation.yml`（表示名：**Docker validation (v0.3.0)**）。
UIで再現する具体的な操作、設定値、全生成ファイル、実際の結果は[操作・検証記録](docker-validation-manual.md)を参照。
開発PCへのDocker Desktop導入は不要。Docker操作はGitHub-hosted Ubuntu 24.04だけで行う。

## 起動方法

- 開発ブランチ`codex/appearance-theme-preview`へのpushで自動実行する。
- 同ブランチをベースにするPull Requestでも実行する。`pull_request_target`は使用しない。
- `workflow_dispatch`を定義しているが、GitHubではworkflowがデフォルトブランチにも存在する必要がある。開発ブランチだけに置く現段階はpush起動を使う。手動実行のためにmainを変更しない。
- 将来、承認された形でデフォルトブランチにも登録された後は、Actions → Docker validation (v0.3.0) → Run workflow → 開発ブランチを選択する。[GitHub公式説明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

アプリ本体にはGitHub認証、トークン、API操作、自動送信、Actions起動機能を持たせない。CIは開発用の独立した仕組み。

## 検証内容

Node.js 22（プロジェクト要件は22.12以上）で`npm ci`、既存の`npm test`、`npm audit`を実行する。
`scripts/lib/headless-generation.cjs`が登録型モジュールをDOMなしでロードし、本体の`ProjectGeneration.build()`と`ComposeSerialization.renderComposeYaml()`を呼ぶ。別のCompose生成実装や手書きComposeは使わない。カタログは同梱データを使用し、CI中のオンライン更新はしない。

| ケース | config -q | build | 起動・確認 | ホストTCPポート |
| --- | --- | --- | --- | --- |
| Nginx | 実行 | 対象外（既成image） | HTTP・固定HTML | 19080 |
| Apache | 実行 | 対象外 | HTTP・固定HTML | 19082 |
| Node.js | 実行 | 実行 | HTTP・Node専用JSON | 19300 |
| Nginx＋Node.js | 実行 | Nodeのみ | 両方の独立HTTP応答 | 19480 / 19400 |
| Python Flask | 実行 | 実行 | HTTP・Flask専用JSON | 19500 |
| PostgreSQL | 実行 | 対象外 | ホストpsqlから認証付き接続・SQL合計42 | 19532 |

`config -q`はCompose構文を検証するが、Dockerfileビルドやサービス応答を保証しない。そのため生成モデルとYAMLのサービス・ポート・volume・command・build.context/dockerfile・相対パス・実ファイル・FROM・lockfile等も比較し、実際のpull/build、`up -d --build`、running状態、HTTP/DB応答を続けて確認する。Node/Flaskのソースは明示したfixtureだけを追加し、生成済みComposeは変更しない。

各ケースは固有のCompose project名、作業ディレクトリ、ポートを使う。依存イメージは事前pullし同じ参照を再利用する。応答は最大30回/90秒、2秒間隔で再試行する。PostgreSQLは公開可能なダミー資格情報を使い、psqlで一時テーブルを作成・INSERT・SELECT・ROLLBACKする。Flaskは固定版・wheel hashを持つrequirementsを使う。

成否を問わず状態・ログを採取し、`down -v --remove-orphans --timeout 10`で自身のprojectを削除する。alwaysステップも保存ComposeのSHA-256と固有project名を照合して、中断時のcleanupを再試行する。全体pruneは行わない。

## 結果・ログ

Actionsの対象実行を開き、UbuntuとWindowsの両ジョブの結果を確認する。Ubuntuのジョブサマリーに6ケースの生成/config/pull/build/up/HTTP・DB/cleanupの成否と失敗理由を表示する。

Artifact `docker-validation-<run_id>-<attempt>`に`results.json`、`summary.md`、所有projectの記録、生成Compose/Dockerfile/ignore、許可したfixture、generation/compose/registry-preflight/build/up/response/containers/cleanupログを保存する。保持は7日。失敗時もアップロードする。ローカル設定、認証情報、ユーザーのソース、本番データを含めない。

失敗はgeneration→compose→registry-preflight→build→up→response→containers→cleanupの順で調べる。`registry-reference`はタグ/digest参照不成立、`registry-rate-limit/auth`は配布元制限や認証、`external-network-possible`はDNS/TLS等から推定した通信障害。分類は補助判断であり、外部障害と断定しない。失敗を無視・スキップして合格にしない。

Windows 2025の別ジョブで`npm run test:electron`を実行する。OS保存ダイアログだけ置換した実画面操作を含む。ElectronのIPC、sandbox、contextIsolation、CSP、19モジュール、テーマ、保存・再起動と6構成のUI/ヘッドレス生成一致を確認する。ログは`electron-regression-<run_id>-<attempt>`に保存する。

## 権限・期限

`contents: read`のみ。Secretsなし。checkoutの認証情報を残さず、公式checkout/setup-node/upload-artifactは確認済みSHA固定。Docker子プロセスは任意のDOCKER_HOST/CONTEXTや認証環境変数を引き継がず、空の専用DOCKER_CONFIGとenv-fileを使う。

Ubuntu job35分、検証step28分、スクリプト全体25分。個別pull180秒、build240秒、up120秒、通常コマンド60秒を上限とし、残り全体期限も考慮する。cleanupは独立した期限。Windows job15分。ログはコマンドごと最大8MiB。開始記録は先に保存するが、強制終了時の未回収出力まで保証するものではない。

## ローカル確認

```powershell
npm ci
npm test
npm run test:electron
npm audit
npm run test:docker:generate
```

最後のコマンドは6構成の生成・静的検証だけを実施し、`release/docker-validation/`に出力する。`STATIC_ONLY`/`NOT_RUN`をDocker成功と扱わない。`npm run test:docker`はLinux CI専用。

実Docker検証の結果と対象コミットは[実行記録](docker-validation-manual.md#github-actionsの実行記録2026-10-26)を参照。全19モジュール、Nginxリバースプロキシ連携、本番ソース、CVEスキャンは未検証。main、公開版v0.2.2、Release、タグ、Dependabot設定は変更しない。

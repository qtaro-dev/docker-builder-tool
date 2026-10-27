# マニュアルレシピの実構築検証（開発者向け）

公開マニュアルとは分離した検証手順です。アプリ本体からGitHubへ接続する処理は追加していません。

## 進め方

`recipe-inputs.json`を一覧の原本とし、掲載順に最大6件ずつへ分けます。現在は6・6・6・6・6・5件です。レシピ追加時はグループ数も自動で増えます。

1. アプリ本体の共通生成器から生成し、マニュアル配布例と完全一致を確認する。
2. `generated/`と`additions/`の中身を専用一時フォルダへ配置する。追加ファイルが生成物を上書きしたら停止する。
3. `docker compose config -q`、イメージ取得、必要なDockerfileビルド、`up -d --build`を実行する。
4. 起動待ちとリトライ後、HTTP・SQL・キャッシュ・複合構成の連携を検査する。
5. ログとチェックリストを保存する。
6. そのケースの専用Composeプロジェクトだけを`down -v --rmi local --remove-orphans`で片付け、一時ファイルも削除する。
7. 次のケースへ進む。6件分が終わったら次のグループを新しいUbuntu runnerで実行する。

同じ公開ポートを使うレシピがあるため、6件を同時に起動しません。`max-parallel: 1`で1グループだけ動かし、各ケースも逐次実行します。グループのスケジュール順に依存せず、重複のない全件を集約します。失敗しても残りのケース・グループを続け、成功記録と失敗理由を消しません。

## 結果の読み方

- **OK**：記載した範囲の実Docker検証・応答検査・後片付けまで成功。チェックを付ける。
- **FAIL**：構成・ビルド・起動・応答・後片付け等が失敗。ログを調べる。
- **BLOCKED**：構築に必要な利用者入力がない。代替の架空アプリを作って合格にしない。
- **PARTIAL**：一部の操作のみ確認できた。OKには数えない。
- **NOT_RUN**：その実行では未実施。前提ステップの失敗・中断・欠落したグループもこの状態。
- **STATIC_ONLY**：ローカルでの生成一致・配置検査のみ。実Docker成功とは扱わない。

集約ジョブは全件OKにならなければ失敗します。静的結果・別コミットの結果・重複結果・証拠が不足するOKを受け付けません。過去の6ケースの成功を、そのまま現在の全レシピのOKへ転記しません。

## 現在の準備不足と確認範囲

Laravelの2レシピには`test/fixtures/laravel-recipe/`の検証専用アプリを一時配置します。実Laravel 12.70.1を使用し、生成Dockerfileが指定するComposerイメージで依存とlockfileを準備します。HTTP正常応答とLaravel経由のMySQL/PostgreSQLへの一時テーブル書込・集計値42を確認します。生成物の書換えは行いません。Composer依存等の外部準備ができなければBLOCKEDとして記録します。利用者向けマニュアルへの検証結果の反映は、実行結果を確認するまで行いません。

Jenkinsは初期ログイン画面まで、OllamaはモデルなしAPIまで、Portainerは初期HTTPS APIまでが今回の起動検査の範囲です。それぞれPipeline実行、推論、Docker管理接続を確認したとは扱いません。Portainer自身の自己署名証明書は、使い捨てrunnerの127.0.0.1に限定して許容します。アプリ本体のTLS設定は変更しません。

DBは認証付きTCP接続で一時テーブルへ書込み・読出し、RedisとMemcachedはSET/GET、RabbitMQは管理ユーザー初期化とキューへのpublish/getを検査します。単独Nginx＋Node.jsのレシピは独立HTTPで、プロキシ成功と表示しません。

DB連携アプリは実際の追加サンプルを使用します。上級のPostgreSQL＋Redis構成は、プロキシ経由のDB読出し・キャッシュヒット・更新・失効・TTL・Redis停止時のDBフォールバック・再起動後の回復を確認します。上級WordPressは初期セットアップと記事保存後、実際の`backup.ps1`を実行し、別Composeプロジェクトへ復旧して記事を再確認します。WordPressの初期セットアップは専用環境でAPIから行い、手作業のセットアップ画面を検証したとは扱いません。

## 実行方法

開発ブランチの`.github/workflows/manual-recipes-validation.yml`で実行します。既存の`docker-validation.yml`（6ケース＋Windows Electron回帰）は維持しています。

初回はpush/PR時の自動起動を無効にし、workflow_dispatchだけで開始します。GitHubのActions → **Manual recipes runtime validation** → **Run workflow**で開発ブランチを選択します。新規ワークフローが未登録の場合は、登録済みの **Docker validation (v0.3.0)** を開発ブランチ指定・suite=manual-recipesで手動開始し、同じワークフローをreusable workflowとして呼び出します。six-casesを選べば既存6ケースとWindows Electron検証を手動実行できます。mainやReleaseは変更しません。

結果は **Complete recipe checklist** ジョブのサマリーと`manual-recipe-checklist` Artifactに全件分が載ります。各`recipe-batch-*` Artifactには生成物・追加設定・入力記録・再現用lockfile・構築/起動/応答/後片付けログが残ります。失敗時は該当グループのDockerログを確認します。生成サンプルを修正した場合は、影響範囲を見て再実行し、最終的には同じコミットの全件結果で判定します。

DBダンプ、バックアップtar、`.env`、node_modules、vendor、Docker認証設定、利用者設定はArtifactへ含めません。ダミー資格情報だけを使用し、Secrets、Dockerソケット共有、グローバルpruneは使用しません。

ローカルでDockerを動かさずに確認する場合：

```powershell
node scripts/manual-recipes-validation.cjs --plan
node scripts/manual-recipes-validation.cjs --static 1
node --test test/manual-recipes-validation.test.js
npm test
```

`--static 1`の番号を変更すると各グループを確認できます。生成物・結果は既定で`release/manual-recipes/`へ出力されるため、グループごとに`MANUAL_RECIPE_ARTIFACTS`で出力先を分けてください。Laravelを含むグループは不足を報告して非ゼロ終了します。ローカルからの`--run`は禁止し、実コンテナ操作はGitHub Linux CIに限定しています。

## ローカルで確認した内容

全レシピのアプリ生成器との一致、グループ分割、失敗後の継続、毎回の後片付け、OKの証拠検査、結果集約、変更されたComposeや所有外プロジェクトへの削除拒否を自動テストで確認します。制御試験のDocker実行器は模擬で、実ビルド・HTTP/DB接続の成功を証明するものではありません。

実GitHub Actions実行前は全件をNOT_RUNと記録し、実結果を取得した後だけチェックリストを更新します。`recipe-ci-checklist.md`と`recipe-ci-results.json`に2026-10-28の確定結果を保存しました。開発ブランチへの必要変更のコミット・pushと手動Actions実行はユーザーから許可されています。

2026-10-27のローカル確認：`npm test`は49件成功（追加の検証制御テスト10件を含む）。全35例の生成器との一致、6グループ分割、失敗/欠落/後片付け/集約、配布Nodeサンプルを使うローカルHTTP検査が通りました。HTTP検査もDocker内の実行ではありません。既存アプリと保存設定、旧資料691ファイルのハッシュが維持されていることも確認しました。

2026-10-28の確定結果：実Actions実行[40524380569](https://github.com/qtaro-dev/docker-builder-tool/actions/runs/40524380569)、検証コミット`50d2e76095a6330783c817101635376d5bb89070`、35件OK・FAIL/BLOCKED/PARTIAL/NOT_RUN各0件。Dockerfileのビルド20件成功、既成イメージのみ15件は対象外。生成・準備・config・pull・起動・応答/連携・後片付けは各35件成功。Laravel 12.70.1のHTTPとMySQL/PostgreSQLへの書込・集計値42も成功。ローカル自動テストは検証側修正後52件成功（制御試験等13件を含む）。

初回実行40504798855では25件OK・4件FAIL・6件NOT_RUNでした。検証プロセスの非同期完了待ち、RabbitMQ検査キューのdurable指定、WordPress検査用初期セットアップを修正し、同一コミットの全35件を再実行しました。アプリ本体・生成Compose/Dockerfileは修正していません。初回の失敗記録も削除していません。

構文修正前のpushイベント失敗40504632380はGitHubの構文検査記録で、ジョブ0件・実Docker検証なしです。実コンテナ検証は上記2回のworkflow_dispatchだけです。現在のワークフローにはpush/PR起動条件がありません。

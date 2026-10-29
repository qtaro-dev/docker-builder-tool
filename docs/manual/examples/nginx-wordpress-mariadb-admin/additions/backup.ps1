# 構成フォルダで実行する学習用バックアップ。操作・アクセスを止めてから取得する。
$ErrorActionPreference = 'Stop'
$recipeComposeArgs = @('-f', 'docker-compose.yml', '-f', 'compose.manual.yml')
function Invoke-RecipeCompose {
    & docker compose @recipeComposeArgs @args
    if ($LASTEXITCODE -ne 0) { throw 'Docker Composeの操作に失敗しました。' }
}
New-Item -ItemType Directory -Path backup -Force | Out-Null
# ホストの文字コード変換を避け、コンテナ内でSQLを作ってからコピーする。
Invoke-RecipeCompose exec -T nginx-wordpress-mariadb-admin-mariadb sh -c 'mariadb-dump --single-transaction --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" > /tmp/manual-db.sql'
Invoke-RecipeCompose cp nginx-wordpress-mariadb-admin-mariadb:/tmp/manual-db.sql ./backup/database.sql
Invoke-RecipeCompose exec -T nginx-wordpress-mariadb-admin-wordpress tar -C /var/www/html -czf /tmp/manual-wordpress.tar.gz .
Invoke-RecipeCompose cp nginx-wordpress-mariadb-admin-wordpress:/tmp/manual-wordpress.tar.gz ./backup/wordpress-files.tar.gz
Write-Output 'backupフォルダにDBとWordPressファイルを保存しました。機密情報を含むため公開しないでください。'

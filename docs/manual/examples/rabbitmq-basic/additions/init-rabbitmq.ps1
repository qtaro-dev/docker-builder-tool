# 学習用ユーザーの初回作成。再実行時のalready existsは既存ユーザーを確認する。
docker compose exec rabbitmq-basic-rabbitmq rabbitmqctl add_user recipeuser demo-recipe-only-42
if ($LASTEXITCODE -ne 0) { throw 'User creation failed; inspect existing users' }
docker compose exec rabbitmq-basic-rabbitmq rabbitmqctl set_user_tags recipeuser administrator
if ($LASTEXITCODE -ne 0) { throw 'User tag failed' }
docker compose exec rabbitmq-basic-rabbitmq rabbitmqctl set_permissions -p / recipeuser ".*" ".*" ".*"
if ($LASTEXITCODE -ne 0) { throw 'Permission setting failed' }

// 現行アプリの共通生成器で上級例の土台を作る。追加設定は別ファイルへ分離する。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),yaml=require('js-yaml');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'docs/manual');
// 一度だけ実施した拡張の制作記録。既存の記事や入力例を重複作成しない。
if (fs.readFileSync(path.join(base,'recipes.html'),'utf8').includes('id="recipe-nginx-nodejs-postgresql-redis"')) throw new Error('上級レシピは追加済みです。この一回限りの制作スクリプトは再実行しません。');
const {loadModules}=require(path.join(root,'scripts/lib/headless-generation.cjs'));
const {build}=require(path.join(root,'app/src/project-generation'));
const {renderComposeYaml}=require(path.join(root,'app/src/compose-serialization'));
const old=require(path.join(root,'docs/OLD/manual/current-draft/recipes-current.json'));
const catalog=require(path.join(root,'app/data/image-catalog.json'));
const order=[...fs.readFileSync(path.join(root,'app/src/renderer.js'),'utf8').matchAll(/import "\.\/modules\/([^"\n]+)"/g)].map(m=>fs.readFileSync(path.join(root,'app/src/modules',m[1]),'utf8').match(/\bid:\s*"([^"]+)"/)[1]);
const modules=loadModules().sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
const initial=new Set(['nginx-basic','apache-basic','nodejs-basic','nginx-nodejs','flask-basic','postgresql-basic','mysql-basic','mariadb-basic','redis-basic']);
const advanced=new Set(['nginx-nodejs-mysql','nginx-nodejs-mariadb','apache-nodejs-mysql','laravel-mysql','laravel-postgresql']);
const reasons={
 'nginx-basic':'静的HTMLの配置と公開ポートを確認する構成で、アプリ間の接続コードを追加しません。',
 'apache-basic':'静的HTMLの配置とHTTP応答を確認する構成で、アプリ間の接続コードを追加しません。',
 'nodejs-basic':'付属の最小アプリを使い、package.json・lockfileの配置とHTTP応答を学びます。DB連携は扱いません。',
 'nginx-nodejs':'NginxとNode.jsを独立して動かす例です。リバースプロキシやDB連携は行いません。',
 'flask-basic':'付属の最小Flaskアプリと依存定義を配置し、単体のHTTP応答を確認します。',
 'postgresql-basic':'接続用の値と保存先を指定し、SQLの基本応答を確認する構成です。',
 'mysql-basic':'接続用の値と保存先を指定し、DB単体の基本操作を学びます。',
 'mariadb-basic':'接続用の値と保存先を指定し、DB単体の基本操作を学びます。',
 'redis-basic':'単体のキー保存・読出しと永続化の基礎を学ぶ構成です。',
 'memcached-basic':'TCP接続用スクリプトと応答形式を扱い、キャッシュが揮発性であることを理解する必要があります。',
 'rabbitmq-basic':'管理用ユーザーの初期化と権限、管理UIとキューの違いを理解する必要があります。',
 'jenkins-basic':'初期管理者の設定とPipelineスクリプトを扱い、ジョブログから失敗箇所を調べます。',
 'ollama-basic':'APIと保存領域を扱い、モデル利用へ進む際の容量・メモリなどの条件を判断します。',
 'portainer-ui':'管理者の初期化と証明書・接続方式を扱います。初期UIの表示とDocker環境への管理接続を区別します。',
 'nginx-nodejs-mysql':'Nginx・アプリ・DBの3層を通し、プロキシ設定、接続コード、環境変数を横断して調整します。',
 'nginx-nodejs-mariadb':'Nginx・アプリ・DBの3層を通し、プロキシ設定、接続コード、環境変数を横断して調整します。',
 'apache-nodejs-mysql':'Apacheのプロキシ設定とNode.jsのSQL接続を組み合わせ、3層の通信経路を切り分けます。',
 'laravel-mysql':'既存Laravelのソース、Composer依存、.env、APP_KEY、マイグレーション、書き込み権限を整える必要があります。',
 'laravel-postgresql':'既存Laravelの依存と初期化に加え、PostgreSQL向けの接続設定やマイグレーションを扱います。',
};
const defs=old.recipes.map(r=>({id:r.id,title:r.title,modules:r.modules,projectName:r.projectName,configs:Object.fromEntries(r.fields.map(g=>[g.id,Object.fromEntries(g.values.map(f=>[f.name,f.value]))])),level:initial.has(r.id)?'初級':advanced.has(r.id)?'上級':'中級',reason:reasons[r.id]||'サービス名による接続、環境変数、追加コードまたはプロキシ設定を扱い、サービス間の応答を確認します。'}));
const sharedPg={port:15442,dbName:'appdb',user:'appuser',password:'demo-recipe-only-42',dataStoreType:'named'};
const extra=[
 {id:'nginx-nodejs-postgresql-redis',title:'Nginx＋Node.js＋PostgreSQL＋Redis',modules:['nginx','nodejs','postgres','redis'],kind:'node',port:18180,appPort:13100,dbPort:15442,redisPort:16380,reason:'リバースプロキシ、DB更新、キャッシュの失効とTTL、依存サービスの準備待ちを横断して扱います。'},
 {id:'nginx-flask-postgresql-redis',title:'Nginx＋Flask＋PostgreSQL＋Redis',modules:['nginx','python-web','postgres','redis'],kind:'flask',port:18280,appPort:15100,dbPort:15443,redisPort:16381,reason:'Pythonアプリ・DB・Redisの接続、DB更新後のキャッシュ失効、プロキシと準備待ちを横断して扱います。'},
 {id:'nginx-wordpress-mariadb-admin',title:'Nginx＋WordPress＋MariaDB＋phpMyAdmin',modules:['nginx','wordpress','mariadb','phpmyadmin'],kind:'cms',port:18380,reason:'公開URLとプロキシの整合、DB管理、DBとWordPressファイルの両方のバックアップ・別環境への復旧を扱います。'}
];
function defaults(id){const mod=modules.find(m=>m.id===id);return Object.fromEntries(mod.fields.map(f=>[f.name,f.default??'']));}
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const code=v=>`<code>${e(v)}</code>`;
const list=items=>'<ul>'+items.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const articles=[],cards=[];
for(const r of extra){
 r.projectName=r.id;r.level='上級';r.configs=Object.fromEntries(r.modules.map(id=>[id,defaults(id)]));
 Object.assign(r.configs.nginx,{hostPort:r.port,dataStoreType:'bind',dataStorePath:'./fixture-web'});
 if(r.kind==='cms'){
  Object.assign(r.configs.wordpress,{port:18092});Object.assign(r.configs.mariadb,{port:13309,dbName:'appdb',user:'appuser',password:'demo-recipe-only-42'});
  Object.assign(r.configs.phpmyadmin,{port:18083,dbHost:r.id+'-mariadb',dbUser:'appuser',dbPassword:'demo-recipe-only-42'});
 }else{
  Object.assign(r.configs.postgres,sharedPg,{port:r.dbPort});Object.assign(r.configs.redis,{port:r.redisPort});
  Object.assign(r.configs[r.kind==='node'?'nodejs':'python-web'],r.kind==='node'?{hostPort:r.appPort,dataStoreType:'image'}:{framework:'flask',hostPort:r.appPort,dataStoreType:'bind',dataStorePath:'./python-web'});
 }
 const model=build({modules:modules.filter(m=>r.modules.includes(m.id)),configs:new Map(Object.entries(r.configs)),catalog,projectName:r.id});assert.deepEqual(model.errors,[],r.id);
 const dir=path.join(base,'examples',r.id),generated=path.join(dir,'generated'),added=path.join(dir,'additions');fs.mkdirSync(generated,{recursive:true});
 const compose=renderComposeYaml(model);fs.writeFileSync(path.join(generated,'docker-compose.yml'),compose);
 for(const file of model.files){const dest=path.join(generated,file.relativePath);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,file.content);}
 const additions=[];
 const put=(file,content,purpose)=>{const dest=path.join(added,file);assert.ok(dest.startsWith(added+path.sep));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);additions.push({file,purpose});};
 const template=name=>fs.readFileSync(path.join(__dirname,'templates',name),'utf8');
 const backend=r.kind==='cms'?r.id+'-wordpress':r.id+(r.kind==='node'?'-nodejs':'-flask');const backendPort=r.kind==='cms'?80:r.kind==='node'?3000:5000;
 put('config/nginx.conf',`events {}\nhttp {\n  server {\n    listen 80;\n    location / {\n      proxy_pass http://${backend}:${backendPort};\n      proxy_set_header Host $http_host;\n      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n      proxy_set_header X-Forwarded-Proto $scheme;\n      proxy_connect_timeout 5s;\n      proxy_read_timeout 10s;\n    }\n  }\n}\n`,'利用者が追加するリバースプロキシ設定。アプリは生成しません。');
 put('fixture-web/index.html','<!doctype html><meta charset="utf-8"><p>この構成ではNginxのプロキシ経由でアプリの応答を確認してください。</p>\n','生成Composeのバインド先も用意するための補助HTML。');
 const services={};
 if(r.kind!=='cms'){
  const db=r.id+'-postgres',redis=r.id+'-redis',app=r.id+(r.kind==='node'?'-nodejs':'-flask');
  services[db]={volumes:['./postgresql/init.sql:/docker-entrypoint-initdb.d/001-recipe.sql:ro'],healthcheck:{test:['CMD-SHELL','pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'],interval:'5s',timeout:'3s',retries:20,start_period:'10s'}};
  services[redis]={healthcheck:{test:['CMD','redis-cli','ping'],interval:'5s',timeout:'3s',retries:20}};
  services[app]={environment:{DB_HOST:db,DB_NAME:'appdb',DB_USER:'appuser',DB_PASSWORD:'demo-recipe-only-42',REDIS_URL:'redis://'+redis+':6379'},depends_on:{[db]:{condition:'service_healthy'},[redis]:{condition:'service_healthy'}}};
  put('postgresql/init.sql',template('init.sql'),'値を保存するテーブルと初期値42を作成。既存の行は上書きしません。');
  if(r.kind==='node'){
   const pg=JSON.parse(fs.readFileSync(path.join(base,'examples/nodejs-postgresql/additions/nodejs/package.json'))).dependencies.pg;
   const redisVersion=JSON.parse(fs.readFileSync(path.join(base,'examples/nodejs-redis/additions/nodejs/package.json'))).dependencies.redis;
   put('nodejs/package.json',JSON.stringify({name:r.id,version:'1.0.0',private:true,scripts:{dev:'node server.cjs'},dependencies:{pg,redis:redisVersion}},null,2)+'\n','既存レシピと同じpg・redisの版を指定。lockfileは利用者が作成します。');
   put('nodejs/server.cjs',template('cache-server.cjs'),'SQL読出し・更新とRedisのキャッシュ／失効を行う学習用API。');
  }else{
   const requirements=[...new Set([fs.readFileSync(path.join(base,'examples/flask-postgresql/additions/python-web/requirements.txt'),'utf8'),fs.readFileSync(path.join(base,'examples/flask-redis/additions/python-web/requirements.txt'),'utf8')].join('\n').split(/\r?\n/).filter(Boolean))].join('\n')+'\n';
   put('python-web/requirements.txt',requirements,'既存レシピのFlask・psycopg・redisと同じ版。');
   put('python-web/app.py',template('cache-app.py'),'DB接続、FlaskのHTTPルート、秘密値を含めないエラー応答。');
   put('python-web/cache_service.py',template('cache_service.py'),'TTL付きキャッシュとDB更新後の失効処理。');
  }
  services[r.id+'-nginx']={volumes:['./config/nginx.conf:/etc/nginx/nginx.conf:ro'],depends_on:{[app]:{condition:'service_started'}}};
 }else{
  services[backend]={environment:{WORDPRESS_CONFIG_EXTRA:`define('WP_HOME', 'http://localhost:${r.port}');\ndefine('WP_SITEURL', 'http://localhost:${r.port}');`}};
  services[r.id+'-nginx']={volumes:['./config/nginx.conf:/etc/nginx/nginx.conf:ro'],depends_on:{[backend]:{condition:'service_started'}}};
  put('backup.ps1',`# 構成フォルダで実行する学習用バックアップ。操作・アクセスを止めてから取得する。\n$ErrorActionPreference = 'Stop'\n$recipeComposeArgs = @('-f', 'docker-compose.yml', '-f', 'compose.manual.yml')\nfunction Invoke-RecipeCompose {\n    & docker compose @recipeComposeArgs @args\n    if ($LASTEXITCODE -ne 0) { throw 'Docker Composeの操作に失敗しました。' }\n}\nNew-Item -ItemType Directory -Path backup -Force | Out-Null\n# ホストの文字コード変換を避け、コンテナ内でSQLを作ってからコピーする。\nInvoke-RecipeCompose exec -T ${r.id}-mariadb sh -c 'mariadb-dump --single-transaction --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" > /tmp/manual-db.sql'\nInvoke-RecipeCompose cp ${r.id}-mariadb:/tmp/manual-db.sql ./backup/database.sql\nInvoke-RecipeCompose exec -T ${r.id}-wordpress tar -C /var/www/html -czf /tmp/manual-wordpress.tar.gz .\nInvoke-RecipeCompose cp ${r.id}-wordpress:/tmp/manual-wordpress.tar.gz ./backup/wordpress-files.tar.gz\nWrite-Output 'backupフォルダにDBとWordPressファイルを保存しました。機密情報を含むため公開しないでください。'\n`,'DBとWordPressファイルを取得。生成物ではなく利用者追加のPowerShell例。');
 }
 put('compose.manual.yml',yaml.dump({services},{lineWidth:-1}),'プロキシ・環境変数・起動待ち等の利用者追加設定。生成Composeとは別ファイルです。');
 const generatedFiles=['docker-compose.yml',...model.files.map(f=>f.relativePath)];
 const fields=r.modules.flatMap(id=>modules.find(m=>m.id===id).fields.map(f=>[e(modules.find(m=>m.id===id).label)+'<br>'+e(f.label),code(r.configs[id][f.name]),code(f.default??''),String(r.configs[id][f.name])===String(f.default??'')?'初期値':'変更']));
 const commands=`docker compose -f docker-compose.yml -f compose.manual.yml config -q\ndocker compose -f docker-compose.yml -f compose.manual.yml up -d --build\ndocker compose -f docker-compose.yml -f compose.manual.yml ps\ndocker compose -f docker-compose.yml -f compose.manual.yml logs --tail=100\ndocker compose -f docker-compose.yml -f compose.manual.yml down`;
 let prep='',checks='',notes='';
 if(r.kind!=='cms'){
  prep=(r.kind==='node'?'<p>Node.jsを使える端末で '+code('nodejs/')+' に移動し、'+code('npm install --package-lock-only --ignore-scripts')+' を実行してpackage-lock.jsonを作成します。Dockerfileはpackage.jsonと整合するlockfileを要求します。</p>':'<p>追加例のapp.py・cache_service.py・requirements.txtを '+code('python-web/')+' に配置します。生成Dockerfileが依存関係をインストールします。フレームワーク種別はFlaskです。</p>')+'<p>init.sqlは新しいPostgreSQLボリュームの初回起動で実行されます。既存ボリュームでは自動再実行されません。テーブルがない場合は、データを削除せず、'+code('docker compose -f docker-compose.yml -f compose.manual.yml exec -T '+r.id+'-postgres psql -U appuser -d appdb -f /docker-entrypoint-initdb.d/001-recipe.sql')+' で適用できます。</p>';
  checks='<ol><li>PowerShellで '+code(`Invoke-RestMethod http://localhost:${r.port}/health`)+' を実行し、okがtrueになるまでログを見ながら待ちます。起動直後だけの503を恒常エラーと判断しないでください。</li><li>'+code(`Invoke-RestMethod http://localhost:${r.port}/value`)+' を繰り返します。初回はvalueが42、sourceがdatabaseとなり、キャッシュ有効中はsourceがcacheになります。</li><li>'+code(`Invoke-RestMethod -Method Post -Uri http://localhost:${r.port}/value -ContentType 'application/json' -Body '{"value":43}'`)+' を実行します。DB更新後、cacheがinvalidatedになることを確認します。</li><li>再びGETし、valueが43になることを確認します。DBへの書き込みとキャッシュの失効を別々に追ってください。</li><li>任意の障害学習として '+code('docker compose -f docker-compose.yml -f compose.manual.yml stop '+r.id+'-redis')+' を行い、GETがDBへフォールバックし、/healthが503になることを確認します。その後 '+code('docker compose -f docker-compose.yml -f compose.manual.yml start '+r.id+'-redis')+' で戻します。利用中の他環境では行わないでください。</li></ol>';
  notes='<p>Redisは正本ではなくキャッシュです。更新とキャッシュ削除の間の競合、削除失敗ではTTLの10秒程度、古い値が返ることがあります。厳密な整合性や耐障害性を保証する設計ではありません。DB障害でもキャッシュが残っていればGETが値を返す場合があるため、/healthと合わせて判断します。FlaskとNode.jsのHTTPサーバーは学習用途で、本番向けサーバー構成ではありません。</p>';
 }else{
  prep='<p>WordPressは既存の対応DBから接続値を受け取ります。Nginxのプロキシ設定とWordPressの公開URLは追加Composeで設定します。ブラウザから利用するURLを変える場合は、WP_HOMEとWP_SITEURLの両方を同じ公開URLへ変更してください。</p>';
  checks='<ol><li>'+code('http://localhost:18380/')+' を開いてWordPressの初期設定を行い、投稿と画像アップロードを1件ずつ作成します。'+code('http://localhost:18083/')+' は別ポートのphpMyAdminで、Nginx配下へ自動統合する構成ではありません。</li><li>phpMyAdminで対象DBとWordPressのテーブルを確認します。管理画面の公開範囲と権限を見直してください。</li><li>投稿・アップロード等の操作と外部からのアクセスを止め、PowerShellで '+code('./backup.ps1')+' を実行します。'+code('backup/database.sql')+' と '+code('backup/wordpress-files.tar.gz')+' の両方を保存します。SQLだけでは画像ファイルを復元できません。</li><li>復旧の練習は元の環境を '+code('down')+' で停止し、'+code('-p manual-recovery')+' などの別Composeプロジェクト名で新しいボリュームを作って行います。元のボリュームを消す '+code('down -v')+' は使いません。同じポートを使うため元の環境とは同時起動しません。</li><li>新しいプロジェクトでMariaDBを起動し、SQLをコンテナへコピーしてインポートします。次にWordPressを起動してファイルを戻し、Nginxを起動します。以下の具体例を参照し、失敗時は後続へ進まないでください。</li><li>復旧後、同じ投稿と画像が開けること、管理者でログインできることを確認します。ファイルが存在するだけで復旧成功とは判断しません。</li></ol><details class="input-details"><summary>別プロジェクトへの復旧コマンド例（PowerShell）</summary><pre>'+e(`$restoreArgs = @('-p','manual-recovery','-f','docker-compose.yml','-f','compose.manual.yml')
# 元のプロジェクトをdownで停止した後、新しいDBを起動する。
docker compose @restoreArgs up -d ${r.id}-mariadb
# DBの準備完了をlogsで確認してからインポートする。
docker compose @restoreArgs logs --tail=100 ${r.id}-mariadb
docker compose @restoreArgs cp ./backup/database.sql ${r.id}-mariadb:/tmp/restore.sql
docker compose @restoreArgs exec -T ${r.id}-mariadb sh -c 'mariadb --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/restore.sql'
docker compose @restoreArgs up -d ${r.id}-wordpress
docker compose @restoreArgs cp ./backup/wordpress-files.tar.gz ${r.id}-wordpress:/tmp/restore-files.tar.gz
# Nginxをまだ起動せず、WordPressへアクセスしない状態で展開する。
docker compose @restoreArgs exec -T ${r.id}-wordpress tar -C /var/www/html -xzf /tmp/restore-files.tar.gz
docker compose @restoreArgs up -d ${r.id}-nginx ${r.id}-phpmyadmin` )+'</pre></details>';
  notes='<p>バックアップにはユーザー情報・設定・DBパスワード等が含まれます。公開しないでください。DBとファイルの取得は原子的ではないため、この例は更新を止めた学習環境向けです。公開URLや認証が異なる環境への移行では、URL置換・認証情報・権限等を追加で設計する必要があります。</p>';
 }
 const purpose=r.kind==='cms'?'CMSのプロキシ公開とDB管理、バックアップ・復旧を学ぶ':'DBを正とするAPIとRedisキャッシュ、更新後の失効・障害時の切り分けを学ぶ';
 const diagram=r.modules.map(id=>`<span><img src="icons/${id}.png" alt="" width="44" height="44">${e(modules.find(m=>m.id===id).label)}</span>`).join('');
 const links=generatedFiles.map(f=>`<li><a href="examples/${r.id}/generated/${f}">${e(f)}</a> <span class="tag">アプリ生成</span></li>`).join('');
 const addLinks=additions.map(f=>`<li><a href="examples/${r.id}/additions/${f.file}"${f.file.endsWith('.html')?' target="_blank" rel="noopener"':''}>${e(f.file)}</a> — ${e(f.purpose)}</li>`).join('');
 const tree=`DockerProjects/\n└── ${r.id}/\n${generatedFiles.map(f=>'    '+f+'  [アプリ生成]').join('\n')}\n${additions.map(f=>'    '+f.file+'  [利用者追加]').join('\n')}`;
 const article=`<article class="recipe" id="recipe-${r.id}" data-search="${e([r.title,purpose,'上級',...r.modules].join(' ').toLowerCase())}" data-level="上級"><header><span class="eyebrow">応用構成 / 上級</span><h2>${e(r.title)}</h2><p>${purpose}</p><p class="difficulty-reason"><strong>難易度の理由：</strong>${e(r.reason)} <a href="#difficulty">級の目安</a></p></header><div class="diagram">${diagram}</div><p>通信経路：ブラウザ → Nginx → ${r.kind==='cms'?'WordPress → MariaDB。管理用ブラウザ → phpMyAdmin → MariaDB。':r.kind==='node'?'Node.js → PostgreSQL／Redis。':'Flask → PostgreSQL／Redis。'}</p><p>追加ファイルは利用者が準備する学習用サンプルです。アプリがプロキシや接続コードを自動生成するものではありません。必要な設定をそろえ、利用するDocker環境で起動・接続を確認してください。</p><p>保存例：${code('%USERPROFILE%\\Documents\\DockerProjects\\'+r.id+'\\')}。実際のドキュメントの場所を確認し、任意の保存先を使えます。</p><h3>アプリでの操作</h3><ol><li>「ファイル」→「新規構成」を押します。</li><li>「モジュール」で ${r.modules.map(id=>'「'+e(modules.find(m=>m.id===id).label)+'」').join('、')} を選択します。</li><li>「構成入力」のプロジェクト名に ${code(r.id)} を入力します。</li><li>各パネルを開き、下表の入力値・保存方式を設定します。バージョン系列・イメージ形式は下の完全イメージ参照と照合します。</li><li>全モジュールの「設定確認」を手動でチェックし、「構成を実行」を押します。</li><li>「生成結果」でComposeとサービス別ファイルを個別保存し、下記の相対配置に合わせます。</li></ol><details class="input-details"><summary>全設定値と初期値</summary>${table(['モジュール／項目','入力値','初期値','操作'],fields)}<p>非表示項目は保存方式等の条件に応じて使われます。秘密値は学習用ダミーです。</p></details><details class="input-details"><summary>イメージ・サービス・ポート・永続化</summary>${table(['サービス','イメージ／ビルド','ポート・保存先・コマンド'],model.services.map(s=>[code(s.name),code(s.image||JSON.stringify(s.build)),['ports','volumes','command'].filter(k=>s[k]).map(k=>e(k)+': '+code(JSON.stringify(s[k]))).join('<br>')]))}</details><h3>ファイルの配置</h3><pre>${e(tree)}</pre><p>generated/とadditions/の<strong>中身</strong>を同じ構成フォルダへ置きます。余分なgenerated/・additions/階層は作りません。生成物の内容は変更せず、追加分はcompose.manual.ymlで併用します。</p><ul class="files">${links}</ul><details class="input-details"><summary>利用者が追加するファイルと目的</summary><ul class="files">${addLinks}</ul></details><h3>追加準備</h3>${prep}<h3>起動・停止</h3><pre>${e(commands)}</pre><p>全コマンドで2つのComposeファイルを指定します。DB・管理画面等のホストポートも公開される学習用構成です。インターネットへそのまま公開せず、接続元と認証を管理できる環境で使用してください。</p><h3>動作の確かめ方と切り分け</h3>${checks}<h3>この設計で理解すること</h3>${notes}<p>停止時はデータを残すdownを使い、値が残ることも確認してください。共通のエラー対処は<a href="index.html#trouble">操作ガイド</a>を参照できます。</p><a class="back" href="#contents">レシピ一覧へ戻る ↑</a></article>`;
 articles.push(article);
 cards.push(`<a class="recipe-card" href="#recipe-${r.id}" data-ref="recipe-${r.id}"><span class="eyebrow">応用構成 / 上級</span><strong>${e(r.title)}</strong><span class="card-icons">${r.modules.map(id=>`<img src="icons/${id}.png" alt="${e(modules.find(m=>m.id===id).label)}" width="30" height="30">`).join('')}</span><span>${purpose}</span></a>`);
 defs.push({id:r.id,title:r.title,modules:r.modules,projectName:r.id,configs:r.configs,level:'上級',reason:r.reason});
}
// 既存レシピを同じ基準で再分類する。生成例・過去資料は変更しない。
let html=fs.readFileSync(path.join(base,'recipes.html'),'utf8');
for(const d of defs.slice(0,old.recipes.length)){
 const patch=block=>block.replace(/(class="eyebrow">[^<]+ \/ )(?:初級|中級|上級)/,'$1'+d.level);
 const article=new RegExp('<article class="recipe" id="recipe-'+d.id+'"[\\s\\S]*?</article>');
 html=html.replace(article,block=>{
  block=patch(block).replace(/data-level="[^"]+"/,'data-level="'+d.level+'"');
  block=block.replace(/(<header>[\s\S]*?)(<\/header>)/,(_m,a,b)=>a+`<p class="difficulty-reason"><strong>難易度の理由：</strong>${e(d.reason)} <a href="#difficulty">級の目安</a></p>`+b);
  return block;
 });
 const card=new RegExp('<a class="recipe-card"[^>]*data-ref="recipe-'+d.id+'"[\\s\\S]*?</a>');html=html.replace(card,patch);
}
const difficulty=`<section id="difficulty" class="difficulty-guide"><span class="eyebrow">選ぶ前に</span><h2>難易度は、何を自分で扱うかで決めます</h2><p>級は学習順序の目安です。コンテナの数や性能の順位ではなく、この説明を再現するために必要な知識・追加設定・切り分けの複雑さで判断します。複数の条件に当てはまる場合は、より難しい側に合わせます。</p>${table(['級','必要な知識・作業','選ぶ目安'],[['初級','設定値の入力、ファイル配置、単体または独立したサービスの基本応答。提供サンプルをそのまま使い、独自の連携コードは追加しません。','Docker構成の生成・保存から学びたい方。'],['中級','DB／キャッシュ接続、環境変数、依存パッケージ、1段のプロキシ、管理UIの初期化。サービス名やログから接続先を切り分けます。','単体サービスを扱えて、サービス間の連携へ進みたい方。'],['上級','3層以上の通信、DBとキャッシュの整合、既存フレームワークの依存・初期化、複数のデータ領域のバックアップと復旧。設定・コードを横断して調べます。','複数サービスの起動後の問題や、データの扱いまで学びたい方。']])}<p>たとえばNginx＋Node.jsの独立HTTPは初級ですが、Nginx→Node.js→MySQLと通信をつなぐ構成は上級です。Laravelのようにソース・依存・初期化が必要な例も上級としています。各レシピの「難易度の理由」を確認してください。</p><a href="#contents">難易度で絞り込んで探す ↓</a></section>`;
html=html.replace('<nav id="contents" class="contents">',difficulty+'<nav id="contents" class="contents">');
html=html.replace('<a href="#recipe-list">構成別の詳細</a>','<a href="#difficulty">難易度の目安</a><a href="#recipe-list">構成別の詳細</a>');
html=html.replace('<option>中級</option>','<option>中級</option><option>上級</option>');
const gridEnd=html.indexOf('</div></nav><section id="recipe-list">');assert.ok(gridEnd>0);
html=html.slice(0,gridEnd)+cards.join('')+html.slice(gridEnd);
html=html.replace('</section><footer class="page-footer">',articles.join('')+'</section><footer class="page-footer">');
fs.writeFileSync(path.join(base,'recipes.html'),html);
let index=fs.readFileSync(path.join(base,'index.html'),'utf8');
index=index.replace(/(<section class="chapter" id="combinations">[\s\S]*?)(<a class="back" href="#contents">目次へ戻る ↑<\/a><\/section>)/,(_m,a,b)=>a+'<h3>上級へ進む構成例</h3><p>級の判断基準は<a href="recipes.html#difficulty">難易度の目安</a>を参照してください。</p>'+table(['構成例','学ぶこと'],extra.map(r=>[`<a href="recipes.html#recipe-${r.id}">${e(r.title)}</a>`,e(r.reason)]))+b);
fs.writeFileSync(path.join(base,'index.html'),index);
fs.writeFileSync(path.join(__dirname,'recipe-inputs.json'),JSON.stringify(defs,null,2));
console.log('Added advanced recipes:',extra.map(r=>r.id).join(', '));console.log('Levels:',defs.reduce((a,r)=>(a[r.level]=(a[r.level]||0)+1,a),{}));

// レシピ由来のループバックHTTPとCompose execだけを使う実応答検査。
const assert = require('node:assert/strict');
const net = require('node:net');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const {parsePS} = require('./runtime-checks.cjs');
function envOf(service) {
  return Array.isArray(service.environment) ? Object.fromEntries(service.environment.map(v => {const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];})) : service.environment || {};
}
function portOf(service, internal) {
  // Compose config --format jsonは短縮文字列をtarget/publishedオブジェクトへ正規化する。
  const value = (service.ports || []).find(p => Number(typeof p==='object'?p.target:String(p).split(':').at(-1)) === internal);
  assert.ok(value, 'Missing public port ' + internal);
  const port = Number(typeof value==='object'?value.published:String(value).split(':').at(-2));assert.ok(port > 0 && port < 65536);return port;
}
async function http(port, route='/', {method='GET', body, headers={}, expectedStatus=[200], text, json}={}) {
  assert.ok(Number.isInteger(port)&&port>0&&port<65536);
  assert.ok(route.startsWith('/') && !route.startsWith('//'));
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {method, headers, body, redirect:'manual', signal:AbortSignal.timeout(7000)});
  const content = await response.text();
  assert.ok(expectedStatus.includes(response.status), `HTTP ${route}: ${response.status}`);
  if (text) assert.match(content, text);
  if (json) json(JSON.parse(content));
  return content;
}
async function memcached(port) {
  return new Promise((resolve,reject) => {
    let data='';const socket=net.connect({host:'127.0.0.1',port});
    socket.setTimeout(5000,()=>socket.destroy(new Error('Memcached timeout')));
    socket.on('error',reject);socket.on('connect',()=>socket.write('set recipe-ci 0 30 2\r\n42\r\nget recipe-ci\r\n'));
    socket.on('end',()=>{if(!data.includes('END\r\n'))reject(new Error('Incomplete Memcached response'));});
    socket.on('data',chunk=>{data+=chunk;if(data.length>1048576)socket.destroy(new Error('Memcached response limit'));if(data.includes('END\r\n')){socket.end();try{assert.match(data,/STORED\r\nVALUE recipe-ci 0 2\r\n42\r\nEND/);resolve();}catch(e){reject(e);}}});
  });
}
async function portainer(port) {
  // 一時runnerのループバックに限り、Portainer初期の自己署名証明書を許容する。
  await new Promise((resolve,reject)=>{
    const req=https.get({hostname:'127.0.0.1',port,path:'/api/status',rejectUnauthorized:false,timeout:7000},res=>{
      let body='';res.on('data',d=>body+=d);res.on('end',()=>{try{assert.equal(res.statusCode,200);assert.equal(typeof JSON.parse(body).Version,'string');resolve();}catch(e){reject(e);}});
    });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Portainer HTTPS timeout')));
  });
}
async function ready({recipe,services,compose:c}) {
  const ps=parsePS(c(['ps','--all','--format','json'],15000).stdout);
  for(const name of Object.keys(services)) assert.equal(ps.find(p=>p.Service===name)?.State,'running');
  for(const [name,svc] of Object.entries(services)) {
    if(name.endsWith('-postgres')) c(['exec','-T',name,'sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qAt -c "SELECT 1"'],10000);
    if(name.endsWith('-mysql')||name.endsWith('-mariadb')) c(['exec','-T',name,'sh','-c',`${name.endsWith('-mysql')?'mysql':'mariadb'} --protocol=TCP -h 127.0.0.1 -u "$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" -Nse "SELECT 1"`],10000);
    if(name.endsWith('-wordpress')) c(['exec','-T',name,'php','-r',"exit(is_file('/var/www/html/wp-config.php')?0:1);"],10000);
    if(name.endsWith('-redmine')) await http(portOf(svc,3000),'/login',{text:/Redmine/i});
    if(name.endsWith('-jenkins')) await http(portOf(svc,8080),'/login',{text:/Jenkins/i});
    if(name.endsWith('-nodejs')||name.endsWith('-flask')) await http(portOf(svc,name.endsWith('-nodejs')?3000:5000),recipe.modules.includes('postgres')&&recipe.modules.includes('redis')?'/health':'/');
    if(name.endsWith('-laravel')) await http(portOf(svc,8000),'/',{json:r=>{assert.equal(r.fixture,'laravel-recipe-ci');assert.equal(r.framework,'12.70.1');}});
    if(name.endsWith('-rabbitmq')) c(['exec','-T',name,'rabbitmq-diagnostics','-q','ping'],10000);
    if(name.endsWith('-redis')) assert.equal(c(['exec','-T',name,'redis-cli','ping'],10000).stdout.trim(),'PONG');
    if(name.endsWith('-memcached')) await memcached(portOf(svc,11211));
    if(name.endsWith('-ollama')) await http(portOf(svc,11434),'/api/tags');
    if(name.endsWith('-portainer')) await portainer(portOf(svc,9443));
    if(name.endsWith('-phpmyadmin')) await http(portOf(svc,80));
    if((name.endsWith('-nginx')||name.endsWith('-apache'))&&!recipe.modules.includes('wordpress')) await http(portOf(svc,80),recipe.modules.includes('postgres')&&recipe.modules.includes('redis')?'/health':'/');
  }
}
async function probe(context) {
  const {recipe, services, compose: c, directory, command, project} = context;
  const service = id => Object.keys(services).find(n => n.endsWith('-' + (id === 'python-web' ? 'flask' : id)));
  const exec = (id, ...args) => c(['exec','-T',service(id),...args], 20000).stdout.trim();
  const ps = parsePS(c(['ps','--all','--format','json'],20000).stdout);
  for (const name of Object.keys(services)) assert.equal(ps.find(p=>p.Service===name)?.State,'running',name+' not running');
  const evidence=[];
  // DB単体もSELECTだけではなく、一時テーブルへ書いて読み出す。
  for (const id of ['mysql','mariadb','postgres']) if (recipe.modules.includes(id)) {
    const sql = "CREATE TEMPORARY TABLE recipe_ci(value integer); INSERT INTO recipe_ci VALUES (19),(23); SELECT SUM(value) FROM recipe_ci;";
    let value;
    if(id==='postgres') value=exec(id,'sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qAt -c "$1"','recipe',sql);
    else value=exec(id,'sh','-c',`${id==='mysql'?'mysql':'mariadb'} --protocol=TCP -h 127.0.0.1 -u "$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" -Nse "$1"`,'recipe',sql);
    assert.equal(value.split(/\r?\n/).at(-1),'42',id+' SQL write/read');evidence.push(id+' SQL write/read=42');
  }
  if(recipe.modules.includes('redis')) {assert.equal(exec('redis','redis-cli','SET','recipe-ci','42','EX','60'),'OK');assert.equal(exec('redis','redis-cli','GET','recipe-ci'),'42');evidence.push('Redis SET/GET');}
  if(recipe.modules.includes('memcached')) {await memcached(portOf(services[service('memcached')],11211));evidence.push('Memcached TCP SET/GET');}
  if(recipe.modules.includes('rabbitmq')) {
    exec('rabbitmq','rabbitmq-diagnostics','-q','ping');
    // マニュアルの初期化スクリプトと同じダミーユーザー。再試行では既存ユーザーを検査する。
    const listed=exec('rabbitmq','rabbitmqctl','list_users','--quiet');
    if(!listed.split(/\r?\n/).some(l=>l.startsWith('recipeuser\t'))) exec('rabbitmq','rabbitmqctl','add_user','recipeuser','demo-recipe-only-42');
    exec('rabbitmq','rabbitmqctl','set_user_tags','recipeuser','administrator');exec('rabbitmq','rabbitmqctl','set_permissions','-p','/','recipeuser','.*','.*','.*');
    const p=portOf(services[service('rabbitmq')],15672),headers={Authorization:'Basic '+Buffer.from('recipeuser:demo-recipe-only-42').toString('base64'),'Content-Type':'application/json'};
    // RabbitMQ 4.3では非durable・非exclusiveのキューが拒否される。永続キューでpublish/getを検査する。
    await http(p,'/api/queues/%2F/recipe-ci',{method:'PUT',headers,body:JSON.stringify({durable:true,auto_delete:false,arguments:{}}),expectedStatus:[201,204]});
    await http(p,'/api/exchanges/%2F/amq.default/publish',{method:'POST',headers,body:JSON.stringify({properties:{},routing_key:'recipe-ci',payload:'42',payload_encoding:'string'}),json:r=>assert.equal(r.routed,true)});
    await http(p,'/api/queues/%2F/recipe-ci/get',{method:'POST',headers,body:JSON.stringify({count:1,ackmode:'ack_requeue_false',encoding:'auto',truncate:100}),json:r=>assert.equal(r[0]?.payload,'42')});
    evidence.push('RabbitMQ authenticated queue publish/get');
  }
  if(recipe.modules.includes('ollama')) {await http(portOf(services[service('ollama')],11434),'/api/tags',{json:r=>assert.ok(Array.isArray(r.models))});evidence.push('Ollama tags API (no inference)');}
  if(recipe.modules.includes('portainer')) {
    await portainer(portOf(services[service('portainer')],9443));evidence.push('Portainer HTTPS status API (no Docker management connection)');
  }
  if(recipe.modules.includes('jenkins')) {await http(portOf(services[service('jenkins')],8080),'/login',{text:/Jenkins/i});evidence.push('Jenkins initial UI; Pipeline execution outside startup-test scope');}
  if(recipe.modules.includes('laravel')) {
    const p=portOf(services[service('laravel')],8000);
    await http(p,'/',{json:r=>{assert.equal(r.fixture,'laravel-recipe-ci');assert.equal(r.framework,'12.70.1');}});
    await http(p,'/recipe-health',{json:r=>{assert.equal(r.ok,true);assert.equal(r.value,42);assert.equal(r.framework,'12.70.1');assert.equal(r.driver,recipe.modules.includes('mysql')?'mysql':'pgsql');}});
    evidence.push('Laravel 12.70.1 real HTTP and application DB temporary-table insert/select sum=42');
  }
  if(recipe.modules.includes('redmine')) {await http(portOf(services[service('redmine')],3000),'/login',{text:/Redmine/i});exec('redmine','bundle','exec','rails','runner','abort "DB write/read failed" unless ActiveRecord::Base.connection.select_value("SELECT 42").to_i == 42');evidence.push('Redmine UI and application DB connection');}
  const cached=recipe.modules.includes('postgres')&&recipe.modules.includes('redis');
  const appId=recipe.modules.includes('nodejs')?'nodejs':recipe.modules.includes('python-web')?'python-web':null;
  if(appId&&!cached) {
    const p=portOf(services[service(appId)],appId==='nodejs'?3000:5000);
    if(recipe.id==='nodejs-basic'||recipe.id==='nginx-nodejs') await http(p,'/',{json:r=>assert.equal(r.fixture,'docker-builder-ci')});
    else if(recipe.id==='flask-basic') await http(p,'/',{text:/docker-builder-ci-flask/});
    else await http(p,'/',{json:r=>{assert.equal(r.ok,true);assert.equal(r.value,42);}});
    evidence.push(appId+' HTTP/dependency response');
  }
  for(const web of ['nginx','apache']) if(recipe.modules.includes(web)&&!recipe.modules.includes('wordpress')) {
    const p=portOf(services[service(web)],80);
    if(recipe.id==='nginx-basic'||recipe.id==='apache-basic'||recipe.id==='nginx-nodejs') await http(p,'/',{text:/docker-builder-ci-static/});
    else if(!cached) await http(p,'/',{json:r=>{assert.equal(r.ok,true);assert.equal(r.value,42);}});
    evidence.push(web+(recipe.id==='nginx-nodejs'?' independent HTTP':' HTTP/proxy'));
  }
  if(cached) {
    const p=portOf(services[service('nginx')],80),direct=portOf(services[service(appId)],appId==='nodejs'?3000:5000);
    const get=()=>http(p,'/value',{json:r=>assert.equal(r.value,42)}).then(JSON.parse);
    await http(direct,'/health',{json:r=>assert.equal(r.ok,true)});
    exec('redis','redis-cli','DEL','recipe:value');assert.equal((await get()).source,'database');assert.equal((await get()).source,'cache');
    await http(p,'/value',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"value":43}',json:r=>{assert.equal(r.value,43);assert.equal(r.cache,'invalidated');}});
    await http(p,'/value',{json:r=>assert.equal(r.value,43)});
    assert.equal(exec('postgres','sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -c "SELECT value FROM recipe_values WHERE name=\x27demo\x27"'),'43');
    c(['stop',service('redis')],30000);
    try {await new Promise(r=>setTimeout(r,1500));await http(p,'/value',{json:r=>{assert.equal(r.value,43);assert.equal(r.cache,'unavailable');}});await http(p,'/health',{expectedStatus:[503]});}
    finally {c(['start',service('redis')],30000);}
    await context.waitFor(async()=>{await http(p,'/health',{json:r=>assert.equal(r.ok,true)});},45000);
    exec('redis','redis-cli','DEL','recipe:value');await http(p,'/value',{json:r=>assert.equal(r.source,'database')});
    await new Promise(r=>setTimeout(r,11000));await http(p,'/value',{json:r=>{assert.equal(r.value,43);assert.equal(r.source,'database');}});
    evidence.push('proxy→app→DB/cache; write/read/invalidate/TTL; Redis outage/fallback/recovery');
  }
  if(recipe.modules.includes('phpmyadmin')) {
    await http(portOf(services[service('phpmyadmin')],80),'/',{text:/phpMyAdmin/i});
    exec('phpmyadmin','php','-r',`$db=new mysqli(getenv('PMA_HOST'),getenv('PMA_USER'),getenv('PMA_PASSWORD'));if($db->query('SELECT 42')->fetch_row()[0]!=42)exit(1);`);
    evidence.push('phpMyAdmin UI and container→DB authenticated query');
  }
  if(recipe.modules.includes('wordpress')) {
    const wp=service('wordpress'),p=portOf(services[wp],80);
    // 初期セットアップをブラウザフォームの代わりにWordPress自身のAPIで行う。学習用ダミーのみ。
    const wpPort=recipe.modules.includes('nginx')?portOf(services[service('nginx')],80):p;
    const installed=c(['exec','-T',wp,'php','-r',`define('WP_INSTALLING',true);$_SERVER['HTTP_HOST']='localhost:${wpPort}';$_SERVER['REQUEST_URI']='/';require '/var/www/html/wp-load.php';require_once ABSPATH.'wp-admin/includes/upgrade.php';if(!is_blog_installed()){wp_install('Recipe CI','recipeadmin','recipe@example.invalid',true,'','demo-recipe-only-42');}update_option('siteurl','http://localhost:${wpPort}');update_option('home','http://localhost:${wpPort}');if(!get_page_by_path('recipe-ci',OBJECT,'post')){wp_insert_post(['post_title'=>'Recipe CI marker','post_name'=>'recipe-ci','post_content'=>'recipe-ci-content-42','post_status'=>'publish']);}if(!get_page_by_path('recipe-ci',OBJECT,'post'))exit(1);echo 'recipe-ci-installed';`],30000);
    assert.match(installed.stdout,/recipe-ci-installed/,'WordPress setup did not complete');
    const webCheck=()=>http(wpPort,'/?s=recipe-ci-content-42',{headers:{Host:`localhost:${wpPort}`},text:/Recipe CI marker/});
    await context.waitFor(webCheck,30000);
    evidence.push('WordPress install/post/query through configured HTTP→DB');
    if(recipe.id==='nginx-wordpress-mariadb-admin') {
      // 実際の配布PowerShellを実行。アクセスのない専用環境でのみ取得する。
      command('pwsh',['-NoProfile','-NonInteractive','-File',path.join(directory,'backup.ps1')],60000,{COMPOSE_PROJECT_NAME:project});
      assert.ok(fs.statSync(path.join(directory,'backup/database.sql')).size>0);
      assert.ok(fs.statSync(path.join(directory,'backup/wordpress-files.tar.gz')).size>0);
      c(['down','--remove-orphans'],60000);
      const restore=tail=>context.restore(tail,60000);
      restore(['up','-d',service('mariadb')]);
      await context.waitFor(async()=>{restore(['exec','-T',service('mariadb'),'sh','-c','mariadb-admin ping --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" --silent']);},90000);
      restore(['cp','./backup/database.sql',service('mariadb')+':/tmp/manual-db.sql']);
      restore(['exec','-T',service('mariadb'),'sh','-c','mariadb --user="$MYSQL_USER" --password="$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/manual-db.sql']);
      restore(['up','-d',wp]);restore(['cp','./backup/wordpress-files.tar.gz',wp+':/tmp/manual-wordpress.tar.gz']);
      restore(['exec','-T',wp,'tar','-C','/var/www/html','-xzf','/tmp/manual-wordpress.tar.gz']);
      restore(['up','-d',service('nginx'),service('phpmyadmin')]);
      await context.waitFor(webCheck,90000);
      evidence.push('real backup.ps1 and restore into separate Compose project; restored post visible');
    }
  }
  return {evidence};
}
module.exports = {envOf, portOf, http, memcached, ready, probe};

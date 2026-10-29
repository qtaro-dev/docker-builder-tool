// 学習用API。DBを正とし、RedisはTTL付きキャッシュとして扱う。
const http = require('node:http');
const KEY = 'recipe:value';
const TTL_SECONDS = 10;
const SQL_READ = 'SELECT value FROM recipe_values WHERE name = $1';
const SQL_WRITE = 'INSERT INTO recipe_values(name,value) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value';
function createHandler({db, cache}) {
  const send = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); };
  return async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && route === '/health') {
        await db.query('SELECT 1');
        if (await cache.ping() !== 'PONG') throw new Error('cache unavailable');
        return send(res, 200, {ok:true});
      }
      if (req.method === 'GET' && route === '/value') {
        let available = true;
        try {
          const value = await cache.get(KEY);
          if (value !== null && /^\d+$/.test(value)) return send(res, 200, {value:Number(value), source:'cache'});
        } catch { available = false; }
        const result = await db.query(SQL_READ, ['demo']);
        if (!result.rows[0]) throw new Error('initialize database');
        const value = result.rows[0].value;
        try { await cache.set(KEY, String(value), {EX:TTL_SECONDS}); } catch { available = false; }
        return send(res, 200, {value, source:'database', cache:available?'available':'unavailable'});
      }
      if (req.method === 'POST' && route === '/value') {
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 1024) return send(res, 400, {error:'body-too-large'}); }
        let body;
        try { body = JSON.parse(raw); } catch { return send(res, 400, {error:'invalid-json'}); }
        if (!body || !Number.isInteger(body.value) || body.value < 0 || body.value > 1000000) return send(res, 400, {error:'value-must-be-integer-0-to-1000000'});
        // DBへの書き込みを先に確定し、その後に古いキャッシュを削除する。
        await db.query(SQL_WRITE, ['demo', body.value]);
        let invalidated = true;
        try { await cache.del(KEY); } catch { invalidated = false; }
        return send(res, 200, {value:body.value, cache:invalidated?'invalidated':'invalidation-failed'});
      }
      send(res, 404, {error:'not-found'});
    } catch {
      // 接続文字列やパスワードをHTTP応答・ログへ出さない。
      send(res, 503, {error:'dependency-unavailable'});
    }
  };
}
module.exports = {createHandler};
if (require.main === module) {
  const {Pool} = require('pg');
  const {createClient} = require('redis');
  const db = new Pool({host:process.env.DB_HOST,port:5432,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionTimeoutMillis:3000,query_timeout:3000});
  db.on('error',()=>{});
  const cache = createClient({url:process.env.REDIS_URL,disableOfflineQueue:true,socket:{connectTimeout:2000,reconnectStrategy:retries=>Math.min((retries+1)*200,2000)}});
  cache.on('error',()=>{});
  cache.connect().catch(()=>{});
  http.createServer(createHandler({db,cache})).listen(3000,'0.0.0.0');
}

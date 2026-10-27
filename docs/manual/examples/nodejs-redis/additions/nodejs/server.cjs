// 利用者追加の接続確認専用アプリ。本番用ではありません。
const http=require('node:http');
const {createClient}=require('redis');
async function check(){const c=createClient({url:process.env.REDIS_URL,socket:{connectTimeout:3000,reconnectStrategy:false}});c.on('error',()=>{});try{await c.connect();await c.set('recipe:check','42',{EX:60});return Number(await c.get('recipe:check'));}finally{if(c.isOpen)await c.quit();}}
http.createServer(async(req,res)=>{try{const value=await check();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:value===42,value}));}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'接続準備中。DB・キャッシュのログを確認してください'}));}}).listen(3000,'0.0.0.0');

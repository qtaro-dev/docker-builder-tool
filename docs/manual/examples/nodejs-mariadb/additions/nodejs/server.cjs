// 利用者追加の接続確認専用アプリ。本番用ではありません。
const http=require('node:http');
const mysql=require('mysql2/promise');
async function check(){const c=await mysql.createConnection({host:process.env.DB_HOST,port:3306,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:3000});try{const [r]=await c.query('SELECT 42 AS value');return r[0].value;}finally{await c.end();}}
http.createServer(async(req,res)=>{try{const value=await check();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:value===42,value}));}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'接続準備中。DB・キャッシュのログを確認してください'}));}}).listen(3000,'0.0.0.0');

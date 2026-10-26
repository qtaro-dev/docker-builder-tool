// CIのビルド成立を検証するためだけのfixture。本番アプリではない。
const http = require('node:http');
http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ fixture: 'docker-builder-ci' }));
}).listen(3000, '0.0.0.0');

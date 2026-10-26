// runner上のテストサービスだけを確認する。任意の外部URLは受け付けない。
async function probe(url, expected) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.username || parsed.password) throw new Error('Only runner loopback HTTP is allowed');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(4000), redirect: 'error' });
  const body = await response.text();
  if (response.status !== 200 || !body.includes(expected)) throw new Error(`Unexpected HTTP response: ${response.status} ${body.slice(0, 300)}`);
  return { status: response.status, body: body.slice(0, 500) };
}
module.exports = { probe };
if (require.main === module) probe(process.argv[2], process.argv[3]).then(value => console.log(JSON.stringify(value))).catch(error => { console.error(error.message); process.exitCode = 1; });

# 利用者追加。自分の端末の公開ポートにだけ接続してSET/GETする。
$client = [System.Net.Sockets.TcpClient]::new()
try {
  $client.Connect('127.0.0.1', 11211)
  $stream = $client.GetStream()
  $stream.ReadTimeout = 3000
  $bytes = [Text.Encoding]::ASCII.GetBytes("set recipe 0 60 2`r`n42`r`nget recipe`r`nquit`r`n")
  $stream.Write($bytes, 0, $bytes.Length)
  $buffer = New-Object byte[] 4096
  $response = ''
  while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $response += [Text.Encoding]::ASCII.GetString($buffer, 0, $count)
  }
  if ($response -notmatch 'STORED' -or $response -notmatch 'VALUE recipe 0 2' -or $response -notmatch '42') { throw 'Memcached SET/GET failed' }
  'PASS Memcached SET/GET value=42'
} finally { $client.Dispose() }

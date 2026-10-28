$ErrorActionPreference = 'Stop'
$commands = @('PING','GET_PARAMS','ANALYZE')
foreach ($command in $commands) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect('127.0.0.1',8081)
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000
    $stream.WriteTimeout = 5000
    $writer = [System.IO.StreamWriter]::new($stream,[System.Text.Encoding]::ASCII)
    $writer.AutoFlush = $true
    $reader = [System.IO.StreamReader]::new($stream,[System.Text.Encoding]::UTF8)
    $writer.WriteLine($command)
    $reply = $reader.ReadLine()
    Write-Output ("{0} => {1}" -f $command,$reply)
  } finally {
    if ($client) { $client.Dispose() }
  }
}
# Generates a private local token shared by the read-only NOVA EA and loopback bridge.
$ErrorActionPreference = 'Stop'
$commonFiles = Join-Path $env:APPDATA 'MetaQuotes\Terminal\Common\Files'
New-Item -ItemType Directory -Force -Path $commonFiles | Out-Null
$tokenPath = Join-Path $commonFiles 'nova-ea-bridge.token'
if (Test-Path -LiteralPath $tokenPath) {
    throw 'EA bridge token already exists. Refusing to replace it automatically.'
}
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
[System.IO.File]::WriteAllText($tokenPath, $token, [System.Text.Encoding]::ASCII)
Write-Host 'Created private EA bridge token in MetaTrader Common Files. Token value was not displayed.'

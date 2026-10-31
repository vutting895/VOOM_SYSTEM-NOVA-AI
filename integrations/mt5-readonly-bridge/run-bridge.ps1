$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$secretRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\secrets'
$tenantPath = Join-Path $secretRoot 'mt5-tenant-id.txt'

if (-not (Test-Path $tenantPath)) {
    throw 'Bridge tenant ID file is missing. Provision one dedicated Demo or Live account before starting.'
}
$env:MT5_TENANT_ID = [System.IO.File]::ReadAllText($tenantPath).Trim()
if ($env:MT5_TENANT_ID -notmatch '^[A-Za-z0-9_-]{8,100}$') {
    throw 'Bridge tenant ID is invalid; use the provisioned route ID only.'
}

# The token file is unique to this provisioned tenant. Never put its value in the script.
$tokenPath = Join-Path $secretRoot ('mt5-bridge-' + $env:MT5_TENANT_ID + '.token')
if (-not (Test-Path $tokenPath)) {
    throw 'Tenant-specific bridge token file is missing. Provision the matching route secret before starting.'
}
$env:MT5_BRIDGE_TOKEN = [System.IO.File]::ReadAllText($tokenPath).Trim()
if ($env:MT5_BRIDGE_TOKEN.Length -lt 32) {
    throw 'Tenant-specific bridge token is invalid or too short.'
}

# Stable, authenticated WebSocket relay under workers.dev; no custom domain or named Tunnel.
$env:MT5_BRIDGE_RELAY_URL = 'wss://voom-mt5-bridge-relay.suwapat787.workers.dev/connect'

Set-Location $root
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Bridge virtual environment is missing. Run the Git bootstrap to create it and install requirements.txt.'
}
& $python bridge_relay_client.py
exit $LASTEXITCODE

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$secretRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\secrets'
$tenantPath = Join-Path $secretRoot 'mt5-tenant-id.txt'

if (-not (Test-Path $tenantPath)) {
    throw 'Bridge tenant ID file is missing. Provision one dedicated Demo account before starting.'
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
$env:MT5_BRIDGE_CORS_ORIGINS = 'https://voom-system-nova-ui.suwapat787.workers.dev'

Set-Location $root
$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Bridge virtual environment is missing. Create .venv and install requirements.txt before starting.'
}
& $python -m uvicorn bridge:app --host 127.0.0.1 --port 8787
exit $LASTEXITCODE

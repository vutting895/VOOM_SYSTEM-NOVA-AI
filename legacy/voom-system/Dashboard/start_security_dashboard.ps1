$ErrorActionPreference = "Stop"
$VoomSystemRoot = Split-Path -Parent $PSScriptRoot
$Documents = Split-Path -Parent $VoomSystemRoot
$SecurityServer = Join-Path $Documents "VOOM_AI_SNIPER\Security_Dashboard\server.py"
if (-not (Test-Path -LiteralPath $SecurityServer)) {
    throw "Security dashboard server not found at the expected VOOM_AI_SNIPER path."
}
$port = if ($env:VOOM_SECURITY_DASHBOARD_PORT) { $env:VOOM_SECURITY_DASHBOARD_PORT } else { "8765" }
Write-Host "VOOM Security Dashboard: http://127.0.0.1:$port" -ForegroundColor Cyan
Write-Host "Review-only. Press Ctrl+C to stop." -ForegroundColor Yellow
python $SecurityServer

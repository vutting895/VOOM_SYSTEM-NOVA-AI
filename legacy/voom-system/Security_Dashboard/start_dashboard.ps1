$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $PSScriptRoot
$port = if ($env:VOOM_SECURITY_DASHBOARD_PORT) { $env:VOOM_SECURITY_DASHBOARD_PORT } else { "8765" }
Write-Host "Starting VOOM Admin Security Dashboard on http://127.0.0.1:$port" -ForegroundColor Cyan
Write-Host "Local-only. Admin login required. Press Ctrl+C to stop." -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $env:LOCALAPPDATA "Voom_system\SecurityDashboard\admin_auth.json"))) {
    Write-Host "Admin account not configured. Run: python setup_admin.py" -ForegroundColor Yellow
    python "$PSScriptRoot\setup_admin.py"
    if ($LASTEXITCODE -ne 0) { throw "Admin account setup failed." }
}
python "$PSScriptRoot\server.py"

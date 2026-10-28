param([switch]$CheckMcp)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "MCP environment missing. Run setup.ps1 first." }
if (-not $CheckMcp -and -not $env:OPENAI_API_KEY) {
    Write-Host "OPENAI_API_KEY is not set in this PowerShell session." -ForegroundColor Yellow
    Write-Host "Set it securely in your own session; do not save it in source files."
    exit 3
}
if ($CheckMcp) {
    & $Python (Join-Path $Root "voom_ai_client.py") --check-mcp
} else {
    & $Python (Join-Path $Root "voom_ai_client.py")
}
exit $LASTEXITCODE

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$Server = Join-Path $Root "server.py"

if (-not (Test-Path $Python)) {
    Write-Error "Virtual environment not found. Run setup first; see README.md."
}
if (-not (Test-Path $Server)) {
    Write-Error "server.py not found."
}
& $Python $Server

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "Python launcher 'py' not found. Install Python 3.11+ and enable the Python launcher."
}

if (-not (Test-Path (Join-Path $Root ".venv\Scripts\python.exe"))) {
    py -m venv .venv
}

$Python = Join-Path $Root ".venv\Scripts\python.exe"
& $Python -m pip install --upgrade pip
& $Python -m pip install -r requirements.txt
& $Python -m py_compile server.py learning_store.py semantic_search.py skill_export.py research_worker.py ingestion_gateway.py tests\smoke_test.py tests\learning_test.py tests\protocol_smoke_test.py tests\advanced_test.py tests\research_worker_test.py tests\ingestion_gateway_test.py
if ($LASTEXITCODE -ne 0) { throw "Python compile failed." }
& $Python tests\smoke_test.py
if ($LASTEXITCODE -ne 0) { throw "Smoke tests failed." }
& $Python tests\learning_test.py
if ($LASTEXITCODE -ne 0) { throw "Learning tests failed." }
& $Python tests\protocol_smoke_test.py
if ($LASTEXITCODE -ne 0) { throw "MCP protocol tests failed." }
& $Python tests\advanced_test.py
if ($LASTEXITCODE -ne 0) { throw "Advanced tests failed." }
& $Python tests\research_worker_test.py
if ($LASTEXITCODE -ne 0) { throw "Research worker tests failed." }
& $Python tests\ingestion_gateway_test.py
if ($LASTEXITCODE -ne 0) { throw "Ingestion gateway tests failed." }
Write-Host "Setup and MCP smoke tests completed."

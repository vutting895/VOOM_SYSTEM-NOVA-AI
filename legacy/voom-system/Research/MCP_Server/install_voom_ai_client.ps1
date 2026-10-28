$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Run setup.ps1 first to create the MCP virtual environment." }
& $Python -m pip install "openai>=1.68,<3.0"
if ($LASTEXITCODE -ne 0) { throw "OpenAI SDK installation failed." }
& $Python -m py_compile voom_ai_client.py tests\test_ai_client.py
if ($LASTEXITCODE -ne 0) { throw "Compile check failed." }
& $Python -m unittest tests.test_ai_client -v
if ($LASTEXITCODE -ne 0) { throw "Client tests failed." }
Write-Host "VOOM AI Client dependency and unit tests completed."

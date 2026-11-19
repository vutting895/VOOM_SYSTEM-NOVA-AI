[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
$gitExe = if ($gitCommand) { $gitCommand.Source } else { $null }
if (-not $gitExe) {
    $gitCandidates = @(
        (Join-Path $env:ProgramFiles "Git\cmd\git.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd\git.exe")
    )
    $gitExe = $gitCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $gitExe) { throw "BLOCKED: Git was not found in PATH or standard installation locations." }

$repoRoot = (& $gitExe rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Run this script from inside the NOVA Git repository." }
Set-Location $repoRoot

function Invoke-ReleaseStep {
    param([string]$Name, [string]$File, [string[]]$Arguments)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $File @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "BLOCKED: '$Name' exited with code $exitCode."
    }
}

Write-Host "NOVA Local Verification — no hosted CI/CD, no deployment commands." -ForegroundColor Green
Write-Host ("Repository: " + $repoRoot)
$commitSha = & $gitExe rev-parse HEAD
Write-Host ("Commit: " + $commitSha)
Write-Host ("Node: " + (node --version))
Write-Host ("npm: " + (npm --version))
Write-Host ("Python: " + (python --version))

$dirty = & $gitExe status --porcelain
if ($dirty) { throw "BLOCKED: working tree is not clean. Commit or safely stash changes before release verification." }

if (-not (Test-Path "package-lock.json")) {
    throw "BLOCKED: package-lock.json is required for deterministic npm ci."
}
if (Test-Path "bun.lock") {
    throw "BLOCKED: obsolete bun.lock remains. This branch must use package-lock.json only."
}
Invoke-ReleaseStep "Install locked Node dependencies without lifecycle scripts" "npm" @("ci", "--ignore-scripts", "--no-audit", "--no-fund")

$lockMetadata = Get-Content -Raw "package-lock.json" | ConvertFrom-Json
if ($lockMetadata.lockfileVersion -ne 3) {
    throw "BLOCKED: package-lock.json must use npm lockfileVersion 3."
}
Write-Host "npm lockfile v3 verified."

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Invoke-ReleaseStep "Create isolated Python virtual environment" "python" @("-m", "venv", ".venv")
}
if (-not (Test-Path "workers/requirements.txt")) { throw "BLOCKED: workers/requirements.txt is missing." }
if (-not (Test-Path "integrations/mt5-readonly-bridge/requirements.txt")) { throw "BLOCKED: Bridge requirements file is missing." }
Invoke-ReleaseStep "Install pinned Quant/runtime Python dependencies" $venvPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", "workers/requirements.txt")
Invoke-ReleaseStep "Install MT5 Bridge Python dependencies" $venvPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", "integrations/mt5-readonly-bridge/requirements.txt")

Invoke-ReleaseStep "TypeScript lint/typecheck" "npm" @("run", "lint")
Invoke-ReleaseStep "Frontend production build" "npm" @("run", "build")

$nodeTests = Get-ChildItem -Path "tests" -Filter "*.test.mjs" -File | Sort-Object -Property Name
if (-not $nodeTests) { throw "BLOCKED: no Node test files found." }
foreach ($testFile in $nodeTests) {
    Invoke-ReleaseStep "Node test: $($testFile.Name)" "node" @("--test", $testFile.FullName)
}

$pythonCompile = @(
    "integrations/mt5-readonly-bridge/bridge.py",
    "integrations/mt5-readonly-bridge/bridge_relay_client.py",
    "integrations/mt5-readonly-bridge/test_tenant_guard.py",
    "workers/feature/smc_wave/smc_strategy.py",
    "tools/ci-inspector/inspect.py",
    "tools/ci-inspector/test_inspect.py"
)
foreach ($path in $pythonCompile) {
    if (-not (Test-Path $path)) { throw "BLOCKED: required source file missing: $path" }
}
Invoke-ReleaseStep "Python syntax compilation" $venvPython (@("-m", "py_compile") + $pythonCompile)

Invoke-ReleaseStep "MT5 read-only Bridge contract tests" $venvPython @("-m", "unittest", "discover", "-s", "integrations/mt5-readonly-bridge", "-p", "test_*.py", "-v")
Invoke-ReleaseStep "Quant Engine compile" $venvPython @("-m", "compileall", "-q", "workers/quant_engine", "tests/test_quant_engine.py", "tests/test_quant_experiment_contract.py")
Invoke-ReleaseStep "Quant Engine tests" $venvPython @("-m", "unittest", "discover", "-s", "tests", "-p", "test_quant*.py", "-v")
Invoke-ReleaseStep "SMC strategy unit tests" $venvPython @("-m", "unittest", "discover", "-s", "tests", "-p", "test_smc_strategy.py", "-v")
Invoke-ReleaseStep "SMC pytest regressions" $venvPython @("-m", "pytest", "tests/test_smc_pytest.py", "tests/test_telegram_alerts.py", "tests/test_runtime_api.py", "tests/test_research_pipeline.py", "-q")
Invoke-ReleaseStep "CI Inspector unit tests (local utility only)" $venvPython @("-m", "unittest", "discover", "-s", "tools/ci-inspector", "-p", "test_*.py", "-v")

Invoke-ReleaseStep "High-severity npm dependency audit" "npm" @("audit", "--audit-level=high")

$verifiedSha = & $gitExe rev-parse HEAD
Write-Host "`nLOCAL PORTABLE CHECKS PASSED for commit $verifiedSha." -ForegroundColor Green
Write-Warning "This is not full-system acceptance. Docker/PostgreSQL/Supabase integration, Cloudflare Worker deployment verification, MT5 terminal checks and production smoke tests must be recorded separately. No deployment was performed."

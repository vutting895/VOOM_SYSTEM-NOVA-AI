[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel 2>$null)
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
Write-Host ("Commit: " + (git rev-parse HEAD))
Write-Host ("Node: " + (node --version))
Write-Host ("Bun: " + (bun --version))
Write-Host ("Python: " + (python --version))

$dirty = git status --porcelain
if ($dirty) { throw "BLOCKED: working tree is not clean. Commit or safely stash changes before release verification." }

if (-not (Test-Path "bun.lock")) { throw "BLOCKED: bun.lock is required for frozen Node dependency installation." }
Invoke-ReleaseStep "Install locked Node dependencies without lifecycle scripts" "bun" @("install", "--frozen-lockfile", "--ignore-scripts")

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Invoke-ReleaseStep "Create isolated Python virtual environment" "python" @("-m", "venv", ".venv")
}
if (-not (Test-Path "workers/requirements.txt")) { throw "BLOCKED: workers/requirements.txt is missing." }
if (-not (Test-Path "integrations/mt5-readonly-bridge/requirements.txt")) { throw "BLOCKED: Bridge requirements file is missing." }
Invoke-ReleaseStep "Install pinned Quant/runtime Python dependencies" $venvPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", "workers/requirements.txt")
Invoke-ReleaseStep "Install MT5 Bridge Python dependencies" $venvPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", "integrations/mt5-readonly-bridge/requirements.txt")

Invoke-ReleaseStep "TypeScript lint/typecheck" "bun" @("run", "lint")
Invoke-ReleaseStep "Frontend production build" "bun" @("run", "build")

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

# npm audit requires package-lock.json; this repository currently uses bun.lock.
# Fail closed rather than silently skip the security audit or claim a full PASS.
if (-not (Test-Path "package-lock.json")) {
    throw "BLOCKED: npm audit cannot run because package-lock.json is absent. bun.lock is used for frozen installs; generate and review an npm lockfile in a separate dependency-lock change before release, or document an approved equivalent audit tool. No security PASS is reported."
}
Invoke-ReleaseStep "High-severity npm dependency audit" "npm" @("audit", "--audit-level=high")

Write-Host "`nLOCAL PORTABLE CHECKS PASSED for commit $(git rev-parse HEAD)." -ForegroundColor Green
Write-Warning "This is not full-system acceptance. Docker/PostgreSQL/Supabase integration, Cloudflare Worker deployment verification, MT5 terminal checks and production smoke tests must be recorded separately. No deployment was performed."

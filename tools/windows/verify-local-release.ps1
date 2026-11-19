[CmdletBinding()]
param(
    [switch]$SkipDependencyInstall,
    [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Run this script from inside the NOVA Git repository." }
Set-Location $repoRoot

function Invoke-ReleaseStep {
    param([string]$Name, [string]$File, [string[]]$Arguments)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "BLOCKED: '$Name' exited with code $LASTEXITCODE."
    }
}

Write-Host "NOVA Local Verification — no hosted CI/CD, no deployment commands." -ForegroundColor Green
Write-Host ("Repository: " + $repoRoot)
Write-Host ("Commit: " + (git rev-parse HEAD))
Write-Host ("Node: " + (node --version))
Write-Host ("npm: " + (npm --version))
Write-Host ("Python: " + (python --version))

$dirty = git status --porcelain
if ($dirty) { throw "BLOCKED: working tree is not clean. Commit or safely stash changes before release verification." }

if (-not $SkipDependencyInstall) {
    Invoke-ReleaseStep "Install locked Node dependencies without lifecycle scripts" "npm" @("ci", "--include=dev", "--ignore-scripts")
}

if (-not $SkipAudit) {
    Invoke-ReleaseStep "High-severity dependency audit" "npm" @("audit", "--audit-level=high")
}

Invoke-ReleaseStep "TypeScript lint/typecheck" "npm" @("run", "lint")
Invoke-ReleaseStep "Frontend production build" "npm" @("run", "build")

$nodeTests = @(
    "tests/nova-trading-readonly-guard.test.mjs",
    "tests/supabase-marketplace-security-migration.test.mjs",
    "tests/secret-vault-readiness.test.mjs",
    "tests/nova-approval-migration.test.mjs"
)
foreach ($testFile in $nodeTests) {
    if (-not (Test-Path $testFile)) { throw "BLOCKED: required test file missing: $testFile" }
    Invoke-ReleaseStep "Node test: $testFile" "node" @("--test", $testFile)
}

$pythonCompile = @(
    "integrations/mt5-readonly-bridge/bridge.py",
    "integrations/mt5-readonly-bridge/bridge_relay_client.py",
    "workers/feature/smc_wave/smc_strategy.py",
    "tools/ci-inspector/inspect.py",
    "tools/ci-inspector/test_inspect.py"
)
foreach ($path in $pythonCompile) {
    if (-not (Test-Path $path)) { throw "BLOCKED: required source file missing: $path" }
}
Invoke-ReleaseStep "Python syntax compilation" "python" (@("-m", "py_compile") + $pythonCompile)

Invoke-ReleaseStep "MT5 read-only Bridge unit tests" "python" @("-m", "unittest", "discover", "-s", "integrations/mt5-readonly-bridge", "-p", "test_*.py", "-v")
Invoke-ReleaseStep "Quant Engine compile" "python" @("-m", "compileall", "-q", "workers/quant_engine", "tests/test_quant_engine.py", "tests/test_quant_experiment_contract.py")
Invoke-ReleaseStep "Quant Engine tests" "python" @("-m", "unittest", "discover", "-s", "tests", "-p", "test_quant*.py", "-v")
Invoke-ReleaseStep "SMC strategy unit tests" "python" @("-m", "unittest", "discover", "-s", "tests", "-p", "test_smc_strategy.py", "-v")
Invoke-ReleaseStep "SMC pytest regressions" "python" @("-m", "pytest", "tests/test_smc_pytest.py", "tests/test_telegram_alerts.py", "tests/test_runtime_api.py", "tests/test_research_pipeline.py", "-q")
Invoke-ReleaseStep "CI Inspector unit tests (local utility only)" "python" @("-m", "unittest", "discover", "-s", "tools/ci-inspector", "-p", "test_*.py", "-v")

Write-Host "`nLOCAL PORTABLE CHECKS PASSED for commit $(git rev-parse HEAD)." -ForegroundColor Green
Write-Warning "This is not full-system acceptance. Docker/PostgreSQL/Supabase integration, PowerShell Bridge runtime, Cloudflare Worker deploy verification, MT5 terminal checks and production smoke tests must be recorded separately. No deployment was performed."

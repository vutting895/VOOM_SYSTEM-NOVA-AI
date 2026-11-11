[CmdletBinding()]
param(
    [ValidateSet("all", "quant", "frontend")]
    [string]$Suite = "all"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$logRoot = Join-Path $repoRoot "artifacts/windows-ci"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runLogDir = Join-Path $logRoot $stamp
New-Item -ItemType Directory -Path $runLogDir -Force | Out-Null

Push-Location $repoRoot
try {
    $required = @("python", "node", "npm", "git")
    foreach ($tool in $required) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            throw "Required command '$tool' was not found on PATH. Install Python 3.11 and Node.js 22, then reopen PowerShell."
        }
    }

    $env:PYTHONPATH = $repoRoot
    $env:PYTHONUNBUFFERED = "1"
    $env:NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "ci-placeholder-not-a-secret"
    $env:NEXT_PUBLIC_SYSTEM_HUB_URL = "https://example.invalid"
    $env:NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAFlosj98ci8iYugG"

    Write-Host "NOVA Windows CI"
    Write-Host "Repository: $repoRoot"
    Write-Host "Logs: $runLogDir"
    Write-Host "Python: $(& python --version 2>&1)"
    Write-Host "Node:   $(& node --version 2>&1)"
    Write-Host "npm:    $(& npm --version 2>&1)"
    Write-Host "Git:    $(& git --version 2>&1)"

    $suites = if ($Suite -eq "all") { @("quant", "frontend") } else { @($Suite) }
    $results = @()

    foreach ($name in $suites) {
        $logFile = Join-Path $runLogDir "$name.log"
        Write-Host ""
        Write-Host "===== Running $name suite ====="
        & python "tools/ci/run.py" "--suite" $name 2>&1 | Tee-Object -FilePath $logFile
        $exitCode = $LASTEXITCODE
        $results += [pscustomobject]@{
            Suite = $name
            ExitCode = $exitCode
            Log = $logFile
        }
        Write-Host "===== $name exit code: $exitCode ====="
    }

    $results | Format-Table -AutoSize
    Write-Host "Full logs saved under: $runLogDir"

    if (@($results | Where-Object { $_.ExitCode -ne 0 }).Count -gt 0) {
        exit 1
    }
    exit 0
}
finally {
    Pop-Location
}

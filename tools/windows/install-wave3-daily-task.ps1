#Requires -Version 5.1
[CmdletBinding()]
param(
    [string] $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string] $AtTime = '03:15'
)
$ErrorActionPreference = 'Stop'
$expectedBranch = 'feature/wave3-hybrid-backtest-20261029'
$taskName = 'VOOM NOVA Wave3 Daily Candidate Training'
$timeZone = (Get-TimeZone).Id
if ($timeZone -ne 'SE Asia Standard Time') {
    throw "Windows time zone is '$timeZone'. Set it to 'SE Asia Standard Time' (Asia/Bangkok) before installing the 03:15 task."
}
$repoRoot = (Resolve-Path -LiteralPath $RepoPath).Path
$branch = (& git -C $repoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne $expectedBranch) { throw "Checkout PR #66 branch '$expectedBranch' first; current branch is '$branch'." }
$origin = (& git -C $repoRoot config --local --get remote.origin.url).Trim()
if ($origin -notmatch '^https://github\.com/vutting895/VOOM_SYSTEM-NOVA-AI(?:\.git)?$') { throw 'Git origin is not the approved repository.' }
$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Git checkout must be clean before installing the daily task.' }
if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) { throw 'Python Launcher is required. Install Python 3.11 first.' }
if (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\secrets\mt5-tenant-id.txt'))) {
    throw 'Private MT5 tenant ID is missing; no credentials will be generated or stored by this installer.'
}

$stateRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\wave3-daily'
$venv = Join-Path $stateRoot '.venv'
$python = Join-Path $venv 'Scripts\python.exe'
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $python)) {
    & py.exe -3.11 -m venv $venv
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $python)) { throw 'Could not create Python 3.11 daily environment.' }
}
& $python -m pip install --disable-pip-version-check --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'pip upgrade failed.' }
& $python -m pip install --disable-pip-version-check --index-url https://download.pytorch.org/whl/cpu 'torch>=2.2,<3'
if ($LASTEXITCODE -ne 0) { throw 'CPU PyTorch installation failed.' }
& $python -m pip install --disable-pip-version-check -r (Join-Path $repoRoot 'requirements-wave3.txt')
if ($LASTEXITCODE -ne 0) { throw 'Wave3 research dependency installation failed.' }

$runScript = Join-Path $repoRoot 'tools\windows\run-wave3-daily.ps1'
$parsedTime = [DateTime]::ParseExact($AtTime, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$trigger = New-ScheduledTaskTrigger -Daily -At $parsedTime
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $runScript + '" -RepoPath "' + $repoRoot + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs -WorkingDirectory $repoRoot
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Daily read-only Exness Demo M15 refresh and non-promotable Wave3 XGBoost/LSTM candidate training.' -Force | Out-Null
Write-Host "Installed: $taskName"
Write-Host "Schedule: daily $AtTime Asia/Bangkok (SE Asia Standard Time)"
Write-Host "Repository branch: $expectedBranch"
Write-Host "Task runs only while this Windows user is logged in; MT5 terminal, local read-only Bridge, and hourly calendar exporter must be active."
Write-Host 'The task refreshes price data and trains a local candidate. It never submits orders, promotes models, or deploys.'

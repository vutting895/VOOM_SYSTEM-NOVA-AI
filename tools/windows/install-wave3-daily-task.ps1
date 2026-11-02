#Requires -Version 5.1
[CmdletBinding()]
param(
    [string] $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string] $AtTime = '03:15'
)

$ErrorActionPreference = 'Stop'
$ExpectedBranch = 'feature/wave3-hybrid-backtest-20261029'
$TaskName = 'VOOM NOVA Wave3 Daily Candidate Training'

if ((Get-TimeZone).Id -ne 'SE Asia Standard Time') {
    throw "Set Windows time zone to 'SE Asia Standard Time' (Asia/Bangkok) before installing the 03:15 daily task."
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoPath).Path
$Branch = (& git -C $RepoRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $Branch -ne $ExpectedBranch) {
    throw "Checkout PR #66 branch '$ExpectedBranch' first; current branch is '$Branch'."
}
$Origin = (& git -C $RepoRoot config --local --get remote.origin.url).Trim()
if ($Origin -notmatch '^https://github\.com/vutting895/VOOM_SYSTEM-NOVA-AI(?:\.git)?$') {
    throw 'Git origin is not the approved VOOM_SYSTEM-NOVA-AI repository.'
}
$Dirty = @(& git -C $RepoRoot status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $Dirty.Count -gt 0) {
    throw 'Git checkout must be clean before installing the daily task.'
}
if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) {
    throw 'Python Launcher is required. Install Python 3.11 first.'
}

$SecretRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\secrets'
$TenantPath = Join-Path $SecretRoot 'mt5-tenant-id.txt'
if (-not (Test-Path -LiteralPath $TenantPath)) {
    throw 'Private MT5 tenant ID is missing. This installer never generates or stores credentials.'
}
$TenantId = [System.IO.File]::ReadAllText($TenantPath).Trim()
if ($TenantId -notmatch '^[A-Za-z0-9_-]{8,100}$') {
    throw 'Private MT5 tenant ID is invalid.'
}
$TokenPath = Join-Path $SecretRoot ('mt5-bridge-' + $TenantId + '.token')
if (-not (Test-Path -LiteralPath $TokenPath)) {
    throw 'Private tenant-specific MT5 Bridge token file is missing.'
}
$PrivateToken = [System.IO.File]::ReadAllText($TokenPath).Trim()
if ($PrivateToken.Length -lt 32) {
    throw 'Private tenant-specific MT5 Bridge token is invalid.'
}
$PrivateToken = $null

$StateRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\wave3-daily'
$Venv = Join-Path $StateRoot '.venv'
$Python = Join-Path $Venv 'Scripts\python.exe'
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $Python)) {
    & py.exe -3.11 -m venv $Venv
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Python)) {
        throw 'Could not create the isolated Python 3.11 daily environment.'
    }
}
& $Python -m pip install --disable-pip-version-check --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw 'pip upgrade failed.'
}
& $Python -m pip install --disable-pip-version-check --index-url https://download.pytorch.org/whl/cpu 'torch>=2.2,<3'
if ($LASTEXITCODE -ne 0) {
    throw 'CPU PyTorch installation failed.'
}
$Requirements = Join-Path $RepoRoot 'requirements-wave3.txt'
& $Python -m pip install --disable-pip-version-check -r $Requirements
if ($LASTEXITCODE -ne 0) {
    throw 'Wave3 research dependency installation failed.'
}
$RequirementsHash = (Get-FileHash -LiteralPath $Requirements -Algorithm SHA256).Hash
$RequirementsMarker = Join-Path $StateRoot '.requirements-sha256'
[System.IO.File]::WriteAllText($RequirementsMarker, $RequirementsHash, [System.Text.Encoding]::ASCII)

$RunScript = Join-Path $RepoRoot 'tools\windows\run-wave3-daily.ps1'
$ParsedTime = [DateTime]::ParseExact($AtTime, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$Trigger = New-ScheduledTaskTrigger -Daily -At $ParsedTime
$ActionArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $RunScript + '" -RepoPath "' + $RepoRoot + '"'
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $ActionArguments -WorkingDirectory $RepoRoot
$Principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'Daily read-only Exness Demo M15 refresh and non-promotable Wave3 XGBoost/LSTM candidate training.' -Force | Out-Null

Write-Host "Installed: $TaskName"
Write-Host "Schedule: daily $AtTime Asia/Bangkok (SE Asia Standard Time)"
Write-Host "Repository branch: $ExpectedBranch"
Write-Host 'Task runs only while this Windows user is logged in; MT5 terminal, local read-only Bridge and hourly calendar exporter must be active.'
Write-Host 'The task refreshes price data and trains a local candidate. It never submits orders, promotes models or deploys.'

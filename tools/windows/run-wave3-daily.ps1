#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string] $RepoPath)
$ErrorActionPreference = 'Stop'
$Branch = 'feature/wave3-hybrid-backtest-20261029'
$StateRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\wave3-daily'
$PersistentDataRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\wave3'
$LogRoot = Join-Path $StateRoot 'logs'
New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
$LogPath = Join-Path $LogRoot ("daily-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
Start-Transcript -Path $LogPath -Append | Out-Null
$PreviousGitPrompt = $env:GIT_TERMINAL_PROMPT
$env:GIT_TERMINAL_PROMPT = '0'
function Invoke-Git {
    param([string[]] $Arguments)
    & git -C $RepoPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git command failed (exit $LASTEXITCODE)." }
}
try {
    $resolved = (Resolve-Path -LiteralPath $RepoPath).Path
    $repoTop = (& git -C $resolved rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0 -or $repoTop -ne $resolved) { throw 'RepoPath must be the Git checkout root.' }
    $origin = (& git -C $resolved config --local --get remote.origin.url).Trim()
    if ($origin -notmatch '^https://github\.com/vutting895/VOOM_SYSTEM-NOVA-AI(?:\.git)?$') { throw 'Git origin does not match the approved repository.' }
    $branch = (& git -C $resolved branch --show-current).Trim()
    if ($branch -ne $Branch) { throw "Daily runs only on $Branch; current branch is $branch." }
    $dirty = @(& git -C $resolved status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Repository worktree is not clean; refusing local modifications.' }
    Invoke-Git @('fetch', '--no-tags', 'origin', $Branch)
    $counts = (& git -C $resolved rev-list --left-right --count "HEAD...origin/$Branch").Trim() -split '\s+'
    if ($counts.Count -ne 2) { throw 'Could not compare local branch with origin.' }
    $ahead = [int]$counts[0]; $behind = [int]$counts[1]
    if ($ahead -gt 0) { throw "Local branch is $ahead commits ahead of origin; refusing to push or overwrite it." }
    if ($behind -gt 0) { Invoke-Git @('merge', '--ff-only', "origin/$Branch") }
    $remoteHead = (& git -C $resolved rev-parse "origin/$Branch").Trim()
    $localHead = (& git -C $resolved rev-parse HEAD).Trim()
    if ($localHead -ne $remoteHead) { throw 'Local code is not the exact origin PR #66 head after fast-forward.' }

    $port = Test-NetConnection -ComputerName 127.0.0.1 -Port 8787 -WarningAction SilentlyContinue
    if (-not $port.TcpTestSucceeded) { throw 'MT5 read-only Bridge is not listening on 127.0.0.1:8787.' }
    $python = Join-Path $StateRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python)) { throw 'Daily Python environment is not installed. Run install-wave3-daily-task.ps1 once.' }
    $requirements = Join-Path $resolved 'requirements-wave3.txt'
    $requirementsMarker = Join-Path $StateRoot '.requirements-sha256'
    $currentRequirementsHash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
    $installedRequirementsHash = ''
    if (Test-Path -LiteralPath $requirementsMarker) {
        $installedRequirementsHash = [System.IO.File]::ReadAllText($requirementsMarker).Trim()
    }
    if ($currentRequirementsHash -ne $installedRequirementsHash) {
        & $python -m pip install --disable-pip-version-check --index-url https://download.pytorch.org/whl/cpu 'torch>=2.2,<3'
        if ($LASTEXITCODE -ne 0) { throw 'CPU PyTorch dependency refresh failed.' }
        & $python -m pip install --disable-pip-version-check -r $requirements
        if ($LASTEXITCODE -ne 0) { throw 'Wave3 research dependency refresh failed.' }
        [System.IO.File]::WriteAllText($requirementsMarker, $currentRequirementsHash, [System.Text.Encoding]::ASCII)
    }

    $syncScript = Join-Path $resolved 'tools\refresh_wave3_daily_data.py'
    $baseData = Join-Path $resolved 'datasets\exness-demo\XAUUSDm_M15_2022-2026.csv'
    $syncOutput = & $python $syncScript --base-data $baseData --state-dir $PersistentDataRoot
    if ($LASTEXITCODE -ne 0) { throw 'Daily MT5 data refresh failed; training was not started.' }
    $syncText = ($syncOutput -join [Environment]::NewLine).Trim()
    try { $sync = $syncText | ConvertFrom-Json } catch { throw 'Daily MT5 refresh returned invalid JSON.' }
    if ($sync.status -eq 'no_new_closed_bars') {
        Write-Host "No new completed M15 bars; training skipped. Last bar: $($sync.last_closed_bar_utc)"
        exit 0
    }
    if ($sync.status -ne 'updated' -or [int]$sync.new_bars -le 0) { throw "Unexpected MT5 refresh status: $($sync.status)" }

    $commonFiles = if ($env:VOOM_MT5_COMMON_FILES) { $env:VOOM_MT5_COMMON_FILES } else { Join-Path $env:APPDATA 'MetaQuotes\Terminal\Common\Files' }
    $calendar = Join-Path $commonFiles 'VOOM_USD_High_Impact_Daily.csv'
    if (-not (Test-Path -LiteralPath $calendar)) { throw 'Current hourly MQL5 USD calendar export is missing; training fails closed.' }
    $calendarAge = (Get-Date).ToUniversalTime() - (Get-Item -LiteralPath $calendar).LastWriteTimeUtc
    if ($calendarAge.TotalHours -gt 2) { throw ("MQL5 USD calendar export is stale ({0:N1} hours)." -f $calendarAge.TotalHours) }

    $baselineMetadata = Get-Content -Raw (Join-Path $resolved 'datasets\exness-demo\metadata.json') | ConvertFrom-Json
    $liveStart = ([DateTimeOffset]::Parse($baselineMetadata.last_closed_bar_utc).AddMinutes(15)).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $runId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $candidateDir = Join-Path $StateRoot ("models\candidate-" + $runId)
    $reportDir = Join-Path $StateRoot 'reports'
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
    $report = Join-Path $reportDir ("daily-candidate-" + $runId + ".json")
    $data = Join-Path $PersistentDataRoot 'XAUUSDm_M15_daily.csv'
    $trainer = Join-Path $resolved 'tools\train_wave3_models.py'
    $trainArgs = @($trainer, '--data', $data, '--model-dir', $candidateDir, '--report', $report,
                   '--news-calendar', $calendar, '--daily-candidate-only',
                   '--candidate-live-start-utc', $liveStart, '--tuning-trials', '4')
    & $python @trainArgs
    if ($LASTEXITCODE -ne 0) { throw 'Daily XGBoost/LSTM candidate training or artifact verification failed.' }

    Write-Host "DAILY_TRAIN_SUCCESS: run=$runId new_bars=$($sync.new_bars) data_sha256=$($sync.data_sha256)"
    Write-Host "Candidate model: $candidateDir"
    Write-Host "Report: $report"
    Write-Host 'Promotion/deployment/live trading remain disabled.'

    $cutoff = (Get-Date).AddDays(-30)
    foreach ($folder in (Get-ChildItem (Join-Path $StateRoot 'models') -Directory -ErrorAction SilentlyContinue)) {
        if ($folder.LastWriteTime -lt $cutoff) { Remove-Item -LiteralPath $folder.FullName -Recurse -Force }
    }
    foreach ($file in (Get-ChildItem $reportDir -File -ErrorAction SilentlyContinue)) {
        if ($file.LastWriteTime -lt $cutoff) { Remove-Item -LiteralPath $file.FullName -Force }
    }
    foreach ($file in (Get-ChildItem $LogRoot -File -ErrorAction SilentlyContinue)) {
        if ($file.LastWriteTime -lt $cutoff) { Remove-Item -LiteralPath $file.FullName -Force }
    }
}
catch {
    Write-Error $_
    exit 1
}
finally {
    $env:GIT_TERMINAL_PROMPT = $PreviousGitPrompt
    Stop-Transcript | Out-Null
}

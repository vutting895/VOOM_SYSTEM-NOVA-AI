#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string] $RepoPath)
$ErrorActionPreference = 'Stop'
$ExpectedBranch = 'feature/wave3-hybrid-backtest-20261029'
$StateRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\wave3-daily'
$PersistentDataRoot = Join-Path $env:LOCALAPPDATA 'VOOM_SYSTEM\wave3'
$LogRoot = Join-Path $StateRoot 'logs'
$LastSuccessfulTrainingPath = Join-Path $StateRoot 'last-successful-training.json'
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
    $CurrentBranch = (& git -C $resolved branch --show-current).Trim()
    if ($CurrentBranch -ne $ExpectedBranch) { throw "Daily runs only on $ExpectedBranch; current branch is $CurrentBranch." }
    $dirty = @(& git -C $resolved status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Repository worktree is not clean; refusing local modifications.' }
    Invoke-Git @('fetch', '--no-tags', 'origin', $ExpectedBranch)
    $counts = (& git -C $resolved rev-list --left-right --count "HEAD...origin/$ExpectedBranch").Trim() -split '\s+'
    if ($counts.Count -ne 2) { throw 'Could not compare local branch with origin.' }
    $ahead = [int]$counts[0]; $behind = [int]$counts[1]
    if ($ahead -gt 0) { throw "Local branch is $ahead commits ahead of origin; refusing to push or overwrite it." }
    if ($behind -gt 0) { Invoke-Git @('merge', '--ff-only', "origin/$ExpectedBranch") }
    $remoteHead = (& git -C $resolved rev-parse "origin/$ExpectedBranch").Trim()
    $localHead = (& git -C $resolved rev-parse HEAD).Trim()
    if ($localHead -ne $remoteHead) { throw 'Local code is not the exact origin PR #66 head after fast-forward.' }

    $port = Test-NetConnection -ComputerName 127.0.0.1 -Port 8787 -WarningAction SilentlyContinue
    if (-not $port.TcpTestSucceeded) { throw 'MT5 read-only Bridge is not listening on 127.0.0.1:8787.' }
    $LocalDriveRoot = [System.IO.Path]::GetPathRoot($env:LOCALAPPDATA)
    $AvailableBytes = ([System.IO.DriveInfo]::new($LocalDriveRoot)).AvailableFreeSpace
    if ($AvailableBytes -lt 2GB) {
        $AvailableGiB = [math]::Round($AvailableBytes / 1GB, 2)
        throw "Daily training requires at least 2 GiB free on $LocalDriveRoot; currently available: $AvailableGiB GiB."
    }
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
    if ($sync.mode -ne 'read-only' -or $sync.order_submission_enabled -ne $false) {
        throw 'Daily market-data refresher did not confirm read-only mode; candidate training is blocked.'
    }
    if ($sync.status -notin @('updated', 'no_new_closed_bars')) {
        throw "Unexpected MT5 refresh status: $($sync.status)"
    }
    if ($sync.status -eq 'updated' -and [int]$sync.new_bars -le 0) {
        throw 'MT5 refresh reported updated without any new completed bars.'
    }

    $data = Join-Path $PersistentDataRoot 'XAUUSDm_M15_daily.csv'
    $dataSha = [string]$sync.data_sha256
    if ($dataSha -notmatch '^[0-9a-fA-F]{64}$') {
        throw 'Daily MT5 refresh did not return a valid dataset SHA-256.'
    }
    if (-not (Test-Path -LiteralPath $data -PathType Leaf)) {
        throw 'Persistent daily MT5 dataset is missing after refresh.'
    }
    $actualDataSha = (Get-FileHash -LiteralPath $data -Algorithm SHA256).Hash.ToLowerInvariant()
    $dataSha = $dataSha.ToLowerInvariant()
    if ($actualDataSha -ne $dataSha) {
        throw 'Persistent daily dataset SHA-256 does not match the refresh result; training is blocked.'
    }

    $commonFiles = if ($env:VOOM_MT5_COMMON_FILES) { $env:VOOM_MT5_COMMON_FILES } else { Join-Path $env:APPDATA 'MetaQuotes\Terminal\Common\Files' }
    $calendar = Join-Path $commonFiles 'VOOM_USD_High_Impact_Daily.csv'
    $latestClosedBarEnd = [DateTimeOffset]::Parse($sync.last_closed_bar_utc).ToUniversalTime().AddMinutes(15)
    $calendarWaitDeadline = (Get-Date).AddMinutes(70)
    $calendarReady = $false
    $calendarHash = ''
    while (-not $calendarReady) {
        if (-not (Test-Path -LiteralPath $calendar -PathType Leaf)) {
            if ((Get-Date) -ge $calendarWaitDeadline) {
                throw 'Current hourly MQL5 USD calendar export did not appear within the 70-minute bounded wait.'
            }
            Write-Host 'Waiting for the read-only MT5 calendar exporter to create a current CSV.'
            Start-Sleep -Seconds 60
            continue
        }

        $calendarItem = Get-Item -LiteralPath $calendar
        $calendarAge = (Get-Date).ToUniversalTime() - $calendarItem.LastWriteTimeUtc
        if ($calendarAge.TotalHours -gt 2) {
            if ((Get-Date) -ge $calendarWaitDeadline) {
                throw ("MQL5 USD calendar export remained stale after bounded wait ({0:N1} hours)." -f $calendarAge.TotalHours)
            }
            Write-Host ("Waiting for a fresh MQL5 USD calendar export; current age is {0:N1} hours." -f $calendarAge.TotalHours)
            Start-Sleep -Seconds 60
            continue
        }

        $calendarRows = @(Import-Csv -LiteralPath $calendar)
        if ($calendarRows.Count -eq 0) {
            if ((Get-Date) -ge $calendarWaitDeadline) {
                throw 'USD calendar export remained empty after bounded wait.'
            }
            Write-Host 'Waiting for a non-empty, atomically replaced USD calendar export.'
            Start-Sleep -Seconds 60
            continue
        }
        $coverageEnds = @($calendarRows | ForEach-Object { $_.coverage_end_exclusive_utc } | Select-Object -Unique)
        if ($coverageEnds.Count -ne 1 -or [string]::IsNullOrWhiteSpace($coverageEnds[0])) {
            throw 'USD calendar rows have inconsistent or missing coverage-end metadata.'
        }
        $coverageEnd = [DateTimeOffset]::Parse($coverageEnds[0]).ToUniversalTime()
        if ($coverageEnd -lt $latestClosedBarEnd) {
            if ((Get-Date) -ge $calendarWaitDeadline) {
                throw ("USD calendar coverage still ends at {0}, before latest refreshed M15 bar end {1}, after bounded wait." -f $coverageEnd.ToString('o'), $latestClosedBarEnd.ToString('o'))
            }
            Write-Host ("Waiting for calendar coverage through latest closed M15 bar end {0}; current export ends {1}." -f $latestClosedBarEnd.ToString('o'), $coverageEnd.ToString('o'))
            Start-Sleep -Seconds 60
            continue
        }

        $calendarHash = (Get-FileHash -LiteralPath $calendar -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($calendarHash -notmatch '^[0-9a-f]{64}$') {
            throw 'Current USD calendar export did not produce a valid SHA-256.'
        }
        $calendarReady = $true
    }

    if (Test-Path -LiteralPath $LastSuccessfulTrainingPath -PathType Leaf) {
        try {
            $lastSuccess = Get-Content -LiteralPath $LastSuccessfulTrainingPath -Raw | ConvertFrom-Json
            if ($lastSuccess.data_sha256 -eq $dataSha -and $lastSuccess.calendar_sha256 -eq $calendarHash) {
                Write-Host "The current dataset/calendar pair was already trained successfully; data_sha256=$dataSha calendar_sha256=$calendarHash"
                exit 0
            }
        }
        catch {
            Write-Host 'Last-success marker is unreadable; treating the current dataset as not yet trained.'
        }
    }
    if ($sync.status -eq 'no_new_closed_bars') {
        Write-Host "No new closed bars, but this dataset/calendar pair has no matching successful-training marker; retrying candidate training. data_sha256=$dataSha"
    }

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
    if (-not (Test-Path -LiteralPath $candidateDir -PathType Container) -or -not (Test-Path -LiteralPath $report -PathType Leaf)) {
        throw 'Candidate training returned success without both model directory and report; success marker was not written.'
    }

    $successRecord = [ordered]@{
        data_sha256 = $dataSha
        calendar_sha256 = $calendarHash
        last_closed_bar_utc = [string]$sync.last_closed_bar_utc
        completed_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    }
    $markerTempPath = "$LastSuccessfulTrainingPath.tmp"
    [System.IO.File]::WriteAllText(
        $markerTempPath,
        ($successRecord | ConvertTo-Json -Depth 4),
        [System.Text.Encoding]::ASCII
    )
    Move-Item -LiteralPath $markerTempPath -Destination $LastSuccessfulTrainingPath -Force

    Write-Host "DAILY_TRAIN_SUCCESS: run=$runId new_bars=$($sync.new_bars) data_sha256=$dataSha calendar_sha256=$calendarHash"
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

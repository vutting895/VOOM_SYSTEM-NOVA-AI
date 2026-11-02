# Wave3 daily data refresh and candidate training

## Purpose and operating boundary

This workflow refreshes completed Exness Demo XAUUSDm M15 bars every day and trains a separate XGBoost + PyTorch LSTM research candidate. It is not the benchmark acceptance run and it is not a production model update.

- Source: the already-authenticated local Exness Demo MT5 terminal through the tenant-guarded read-only Bridge at 127.0.0.1:8787.
- Market-data calls: authenticated GET only. There is no broker order, position modification, transfer, withdrawal, deployment, or model-promotion code in the daily runner.
- Daily candidate artifacts stay under %LOCALAPPDATA%\VOOM_SYSTEM\wave3-daily and are never copied to the active model directory.
- The original Git dataset is immutable. A separate append-only daily dataset is kept under %LOCALAPPDATA%\VOOM_SYSTEM\wave3.
- No new daily run changes the frozen 2026-07-01 Final OOS evaluation or the v6.2.6.3 entry/risk thresholds.

## Daily sequence

1. The Windows Task Scheduler starts the PR #66 branch runner at 03:15 Asia/Bangkok.
2. The runner verifies the repository origin, the exact PR #66 branch, a clean worktree and a fast-forward-only update from that branch. It refuses dirty, divergent, or locally-ahead checkouts.
3. The data refresher authenticates to the local MT5 read-only Bridge. It checks terminal health, mode=read-only, order_submission_enabled=false, symbol XAUUSDm, timeframe M15, three digits and valid OHLC bounds.
4. Only completed M15 bars are retained. The current forming bar is excluded. New bars are merged into the local persistent CSV and protected by a SHA-256 manifest. The original tracked baseline is checked against SHA-256 0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266 before use.
5. The MQL5 calendar exporter runs hourly while it remains attached to the Exness Demo terminal. It exports high-impact US/USD calendar values to the MT5 Common Files folder using a temporary file and replacement only after a complete successful export. The daily runner refuses to train if that file is absent or older than two hours.
6. The candidate trainer uses the historical pre-OOS segment and fully-matured bars after the baseline's last closed bar. It leaves the entire previously inspected OOS interval (2026-07-01 through the baseline last closed bar) out of feature construction, tuning, calibration and model fitting. Twelve-bar forward-label endpoints are purged at the historical OOS boundary.
7. XGBoost tuning uses only chronological inner folds from the pre-OOS historical segment. The final candidate can then be fitted to the pre-OOS segment plus mature new data. LSTM sequences are segment-aware and cannot bridge the frozen OOS gap.
8. The job saves a versioned local candidate manifest, data/news hashes, model hashes and a research report. Its performance gate is not_evaluated; it is not eligible for deployment or promotion.

## One-time Windows setup

Requirements:
- Windows with the Exness Demo MT5 terminal already logged in to the intended Demo account.
- The existing tenant-specific read-only Bridge must be provisioned and running locally on port 8787.
- The tenant ID and matching private bearer token must already exist in %LOCALAPPDATA%\VOOM_SYSTEM\secrets. This installer never creates, prints or uploads secrets.
- Python 3.11, Git for Windows, MetaEditor/MT5 and sufficient free disk for CPU PyTorch and the persistent market history.
- Windows time zone must be SE Asia Standard Time (Asia/Bangkok).

### Install the hourly calendar exporter

1. In MT5, use File → Open Data Folder.
2. Copy tools/mt5_wave3_daily_calendar_exporter.mq5 from this PR #66 checkout into MQL5/Experts/.
3. Open MetaEditor, compile mt5_wave3_daily_calendar_exporter.mq5, and resolve any MetaEditor errors before continuing.
4. In MT5, open the XAUUSDm M15 chart and attach the exporter EA once.
5. Keep the terminal logged in and the EA attached. The EA contains no order functions; the platform's Algo Trading switch may remain OFF.
6. Confirm Common/Files/VOOM_USD_High_Impact_Daily.csv exists and is refreshed hourly. The exporter fails closed if the trade-server/UTC offset differs from the verified GMT+0 assumption, if calendar queries fail, or if an unknown event time mode appears. It preserves the last valid file when an export is incomplete.

The calendar uses MQL5 Economic Calendar timestamps, which MQL5 documents as trade-server time. The exporter verifies the Exness server is GMT+0 against UTC before labeling its data UTC. See the MQL5 references for [CalendarValueHistory](https://www.mql5.com/en/docs/calendar/calendarvaluehistory), [TimeTradeServer](https://www.mql5.com/en/docs/dateandtime/timetradeserver), and [FileMove](https://www.mql5.com/en/docs/files/filemove).

### Install the daily task

From a clean local checkout of branch feature/wave3-hybrid-backtest-20261029, run these commands in PowerShell:

    Set-ExecutionPolicy -Scope Process Bypass
    .\tools\windows\install-wave3-daily-task.ps1

The installer creates an isolated Python 3.11 environment, installs CPU PyTorch and the Wave3 dependency ranges, then registers:

- Task: VOOM NOVA Wave3 Daily Candidate Training
- Schedule: every day at 03:15 Bangkok time
- Security context: current Windows user, limited privileges, interactive logon
- Catch-up: start when available; may wake the computer if Windows power settings permit
- Maximum run time: four hours

The task requires the same Windows user to remain logged in and the MT5 terminal/Bridge to be active. Windows Task Scheduler does not have the user's logged-in MT5 terminal session when that user is logged out. It is therefore not an unattended server-side service.

## Verify and operate

Inspect task registration and last-run status:

    Get-ScheduledTask -TaskName 'VOOM NOVA Wave3 Daily Candidate Training'
    Get-ScheduledTaskInfo -TaskName 'VOOM NOVA Wave3 Daily Candidate Training'

Start one test run manually:

    Start-ScheduledTask -TaskName 'VOOM NOVA Wave3 Daily Candidate Training'

Local files:
- Persistent M15 data: %LOCALAPPDATA%\VOOM_SYSTEM\wave3\XAUUSDm_M15_daily.csv
- Data provenance: %LOCALAPPDATA%\VOOM_SYSTEM\wave3\daily_data_manifest.json
- Candidate models: %LOCALAPPDATA%\VOOM_SYSTEM\wave3-daily\models\candidate-<UTC-run-id>\
- Reports: %LOCALAPPDATA%\VOOM_SYSTEM\wave3-daily\reports\
- Run logs: %LOCALAPPDATA%\VOOM_SYSTEM\wave3-daily\logs\

Expected statuses:
- updated: new fully closed bars were appended and the candidate training step may proceed.
- no_new_closed_bars: the data is unchanged; training is skipped rather than wasting compute.
- failed: data, bridge, calendar, repository, validation or training failed; no candidate is accepted.

The bridge returns at most 500 bars per request. If 490 or more unobserved bars are detected, the refresher stops rather than silently accepting a truncated history. Reconnect the Bridge and perform a reviewed history backfill before the next run.

## Acceptance and limitations

Daily automation does not relax or replace the frozen v6.2.6.3 acceptance gates. Candidate reports explicitly say performance_gate.status=not_evaluated, promotion_eligible=false and production_eligible=false. The daily job does not calculate a fresh untouched forward OOS proof, does not change the active model, and does not enable live trading.

Commission and swap must be confirmed from the Exness Demo contract specification. The historical metadata records swap values and a three-day rollover schedule; the previous daily research report's statement that swap is omitted solely because 12 M15 bars fit within three hours is not sufficient where the broker applies rollover charges. Do not treat candidate PnL as cost-complete until commission and rollover handling are separately verified.

No MT5 data refresh, calendar compilation, task registration, or candidate training is considered successful until the Windows machine provides the corresponding logs, updated local manifest, and model artifact hashes.

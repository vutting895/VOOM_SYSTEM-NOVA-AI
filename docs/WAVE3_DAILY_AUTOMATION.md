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
- Python 3.11, Git for Windows, MetaEditor/MT5 and at least 2 GiB free on the volume containing %LOCALAPPDATA% for CPU PyTorch, dependencies and candidate artifacts. The installer and daily runner fail closed below this minimum.
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


## Cloudflare Free Plan architecture (orchestration phase)

The Cloudflare Free implementation is deliberately split from the Windows-only MT5 path:

- `integrations/wave3-cloud-scheduler` is a lightweight Cloudflare Worker. Its Cron Trigger runs at 20:15 UTC (03:15 Asia/Bangkok) and dispatches a fixed `repository_dispatch` event to this repository. It does not run Python, XGBoost, PyTorch, or model training inside Workers.
- The Worker is pinned to `vutting895/VOOM_SYSTEM-NOVA-AI`, sends only a scheduled timestamp and non-execution flags, and never accepts arbitrary dispatch URLs or user-supplied workflow names.
- Configure `GITHUB_DISPATCH_TOKEN` as a Worker secret using a fine-grained GitHub token scoped only to this repository with Contents: write permission (required by the repository dispatch endpoint). Do not place it in Wrangler files, Git, logs, or client-side code.
- The `Wave3 Cloud Daily Readiness Gate` consumes the dispatch and uploads a small readiness artifact. It currently records `blocked / cloud_market_data_adapter_not_configured`; it intentionally does not train on stale historical files. Deploying the scheduler requires the owner to configure the Worker secret and deploy this Worker. This PR does not deploy or alter Cloudflare resources.

### Free-plan compute boundary

Workers Free provides a 10 ms CPU budget per Cron invocation. It is suitable for a small scheduler/API call, not model fitting. The Worker must not attempt to import Python packages or train XGBoost/PyTorch. Cloudflare Containers are intentionally not used.

The scheduled event is an orchestration signal only. The actual candidate-training compute must run on a separately authorized compute runner (for example, GitHub-hosted Actions within the account's included minutes) after the cloud market-data input adapter is implemented and its provenance checks pass. GitHub Actions minutes/runner availability are not a Cloudflare guarantee and may incur charges if the account exceeds its included quota.

### Current hard blocker: cloud market-data source

The current Exness refresher is not cloud-compatible: it reads a tenant-specific local token and calls `127.0.0.1:8787` on the Windows MT5 bridge. A Cloudflare Worker or GitHub-hosted runner cannot reach that private localhost service. The existing historical calendar export is a verified prior export, not a live cloud feed.

Therefore this phase does **not** claim daily fresh Exness data, does **not** start training, and does **not** produce a new model. Before enabling the training workflow, a separate read-only cloud data adapter must be selected and reviewed. It must provide completed XAUUSDm M15 bars and current high-impact USD calendar data, preserve the original baseline/calendar provenance, enforce the exact frozen gates, and reject stale/incomplete data. Do not upload broker credentials or MT5 bridge tokens to the Worker.

### Scheduler verification

- Local contract tests: `npm test` in `integrations/wave3-cloud-scheduler`.
- Public health endpoint reports `orchestration-only`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- A successful Cron dispatch proves only that GitHub accepted a repository-dispatch event. It is not evidence of market-data refresh, training, benchmark acceptance, or model promotion.


## Exness Demo MT5 cloud connector decision (2026-11-02)

### Source-of-truth decision

Keep the existing Exness Demo MT5 account on server `Exness-MT5Trial7`, symbol `XAUUSDm`, timeframe `M15` as the benchmark source of truth. Do not silently substitute Exness Terminal prices, another broker, or a generic market-data vendor into this dataset.

### Official Exness API eligibility

The current Exness Help Center article says the Exness API is not compatible with Standard MetaTrader accounts, while its newer API product provides REST historical candles and WebSocket market streams for eligible Exness trading accounts. This does not establish that the existing MT5 Demo account can use that API. Therefore the Exness API path is **not approved as the MT5 data connector** until Exness confirms that the exact Demo MT5 account/server is eligible and the API instrument quotes match the account's `XAUUSDm` contract.

Official references:
- https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API
- https://www.exness-api.com/reference/get-candle-history

### Preferred no-Windows evaluation: ephemeral Linux MT5 terminal

Evaluate an ephemeral GitHub-hosted Ubuntu runner with MetaTrader 5 installed under Wine, invoking the existing MQL5 read-only exporters. This avoids a permanently running Windows machine and avoids Cloudflare Containers. It is a feasibility experiment, not yet a production data connector.

Use only Exness' **read-only access password** (formerly investor password), never the master/trading password. Exness documents that read-only access permits viewing trading activity while restricting trading; MetaTrader investor authorization is view-only and cannot trade:
- https://get.exness.help/hc/en-us/articles/360006922872-Trading-account-settings
- https://get.exness.help/hc/en-us/articles/360013671420-Password-recovery
- https://www.metatrader5.com/en/terminal/help/startworking/authorization

Store login number, server name, and read-only password only as repository Actions secrets (or a separately approved secret store); never print environment variables, command lines containing secrets, terminal config, or logs with auth details. Do not request or accept the secret in chat. The workflow must use a dedicated non-production Demo account and fail closed if investor mode cannot be proven in the terminal journal. It must not contain order, position modification, or trade execution code.

### Cloudflare Free boundary

Cloudflare Workers Free remains the control plane only: Cron dispatch, request validation, and signed upload authorization. Current Workers Free limits are 10 ms CPU per Cron invocation and 128 MB memory; this is not an MT5 terminal or PyTorch runtime:
- https://developers.cloudflare.com/workers/platform/limits/

The ephemeral Linux runner performs the MT5 terminal session and invokes the existing MQL5 exporters; GitHub Actions then uploads verified output to the Cloudflare ingestion endpoint / R2. No Container is required. The actual training runner remains a separate stage and may use included GitHub Actions minutes only; check current account quota before enabling scheduled training.

### GitHub dispatch branch constraint

GitHub documents that `workflow_dispatch` requires the workflow file to exist on the default branch. A `repository_dispatch` event also executes workflows available from the default branch. The current Cloud Daily Readiness workflow exists only on this PR branch, so the Cloudflare scheduler must **not** be deployed or represented as operational while PR #66 remains unmerged. Keep the readiness workflow fail-closed. Do not merge PR #66 merely to enable scheduling:
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow

### Required proof before enabling the Linux connector

1. Install MT5 under Wine on a clean ephemeral Ubuntu runner and prove the correct Exness Demo server is selected.
2. Authenticate using read-only access only; capture a redacted terminal journal proving investor/read-only mode.
3. Export closed `XAUUSDm M15` bars and compare overlapping timestamps and OHLC/spread with the existing Exness Demo history; no symbol mapping or price rounding changes.
4. Run the historical USD high-impact calendar exporter separately and validate its date coverage, timezone, duplicates, unknown time modes, and SHA-256. A prior export is not a fresh daily export.
5. Upload through a narrowly scoped Cloudflare endpoint using a short-lived upload authorization; no broker secret reaches Cloudflare Worker or R2.
6. Verify SHA-256 before and after upload, closed-bar cutoff, monotonic timestamps, no gaps/duplicates, and tenant binding.
7. Run the existing daily data validation and candidate pipeline only after all provenance checks pass.

### Fail-closed status

Until the above proofs pass, `cloud_market_data_adapter_not_configured` remains the correct readiness result. No new MT5 connection, fresh market-data pull, training run, model artifact, or performance-gate result is claimed by this design update.

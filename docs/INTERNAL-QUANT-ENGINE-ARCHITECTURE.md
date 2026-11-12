# NOVA Internal Quant Engine — Architecture and Delivery Plan

- Date: 2026-11-07
- Repository: vutting895/VOOM_SYSTEM-NOVA-AI
- Baseline: current main at branch creation (2026-11-07)
- Status: research foundation; not a production training or trading service
- Safety: research-only; Exness Demo remains read-only; order submission and Live Trading remain disabled

## 1. Purpose and boundary

The Internal Quant Engine is NOVA's research and quantitative-evaluation plane. It turns versioned market data and strategy definitions into reproducible experiment runs, comparable backtest reports, and reviewable strategy candidates.

It is not another broker gateway, orchestration hub, or execution engine. The existing System Integration Hub remains the authenticated control plane. Quant Engine accepts explicitly scoped research jobs, processes immutable dataset snapshots, and returns metrics and artifacts. It has no broker-write API, account credential access, or order-submission capability.

## 2. Verified repository baseline

These are checked-in main-branch observations, not claims that every component is integrated or production-ready.

| Area | Current state | Quant Engine decision |
|---|---|---|
| workers/data-ingestion | Public Binance OHLCV adapter prototype; README says adapter/contract tests are pending | Reuse as a source adapter; add canonical validation and provenance |
| workers/backtest | Deterministic EMA crossover OHLCV prototype with fee/slippage assumptions | Preserve as a baseline adapter; not tick-accurate |
| workers/tuning | Bounded deterministic grid tuner with caller-supplied backtest callback | Use a common experiment contract; never tune final OOS |
| workers/feature | XGBoost, LSTM, CNN, GNN, Mamba, PPO and clustering prototypes | Treat as research plugins; require point-in-time-safe features and explicit evaluation |
| shared/feast | Reserved for Feast; no online/offline store configured | Do not claim Feast is active or add it before historical feature retrieval is needed |
| workers/risk and workers/portfolio | Risk/allocation scaffolds | Keep deterministic controls authoritative; ML cannot override risk policy |
| workers/execution | Intentionally disabled | Keep outside the Quant Engine boundary |

### Strategy replacement decision (2026-11-12)\n\n- SMC Mean Rejection replaces Wave3 as NOVA's primary deterministic strategy path. The implementation lives in workers/quant_engine/smc_mean_rejection.py and consumes completed 4H/5M bars with UTC close-time timestamps.\n- XGBoost/LSTM remain independent supporting models. The five-family Meta Decision Layer is not changed to treat SMC as an ML vote.\n- Keep historical Wave3 branches, artifacts and Final OOS records immutable for audit/comparison; do not merge stale Wave3 PRs as the active strategy.\n- The new module is research-only until exact-head tests, cost-aware walk-forward and sealed OOS acceptance gates pass.\n\n### Existing research branch dependency

PR #66 (feature/wave3-hybrid-backtest-20261029) contains Wave3/SMC + XGBoost/LSTM research and frozen v6.2.6.3 gates. Its latest recorded report describes zero closed Final OOS trades, classification below its majority baseline, and maximum SMC score 75 against the unchanged threshold 85. The PR remains Draft/open and its recorded branch was 58 commits behind the then-current main baseline. Do not merge or couple it directly into this engine. Use stable dataset/experiment contracts so it can be reconciled and evaluated separately after overlap and regression review.

PR #89 separately proposes Zero-Menu and agent orchestration. Quant jobs may later be requested through typed intent, but authorization, tenant ownership, workflow state, and approvals remain with existing NOVA boundaries; do not duplicate them here.

## 3. Target architecture

~~~text
NOVA Next.js UI / typed intent
          |
          v
Supabase Auth + System Integration Hub
  - authenticate caller
  - resolve tenant/resource ownership
  - enforce limits and idempotency
          |
          v
Quant Job API (control plane only)
  - validate quant-job.v1
  - create run metadata
  - dispatch bounded job reference
          |
          v
Isolated Python Quant Worker (compute plane)
  1. resolve immutable dataset snapshot
  2. validate data quality and provenance
  3. compute point-in-time-safe features
  4. run baseline / strategy / model plugin
  5. run chronological or purged walk-forward evaluation
  6. calculate cost-aware metrics and risk diagnostics
  7. write immutable artifacts and final run status
          |
          v
Supabase run metadata + object artifact store
          |
          v
NOVA dashboard / AI (read-only result rendering)
~~~

### Runtime placement

- Cloudflare Workers and the System Integration Hub are suitable for authenticated routing, typed job creation, and status reads—not full historical training or large backtests on the current Free plan. Cloudflare's limits page lists 10 ms CPU time for Free requests and 128 MB memory; heavy compute belongs in an isolated Python process/container, not a request handler.
- Cloudflare Queues can later dispatch asynchronous jobs with retry/DLQ behavior, but this foundation does not create a queue before an operational consumer exists.
- R2 is a candidate immutable artifact store: it provides an S3-compatible API and strong read-after-write consistency. Keep large historical data and run artifacts out of transactional metadata tables. Do not provision buckets, tokens, or billing resources in this PR.
- Supabase Postgres remains the initial metadata/ownership store. Store run/dataset metadata and artifact references there; store large arrays and model files externally. RLS must scope every customer-visible run to its owner/tenant.
- Start without Redis, Kubernetes, Feast online serving, or an MLflow deployment. Add them only when measured throughput, feature-serving, or governance needs justify the operational cost. A minimal append-only run registry can start on the current Postgres stack.

## 4. Core modules

| Module | Responsibility | Must not do |
|---|---|---|
| ingestion | Provider adapters, rate limits, provenance, bounded pagination | Invent missing bars or use broker write credentials |
| dataset_quality | Schema, numeric validity, timezone, ordering, duplicate and gap checks | Silently sort, interpolate, or repair source data |
| dataset_registry | Immutable manifests, source range, checksums, schema versions | Overwrite a snapshot referenced by a completed run |
| feature_pipeline | Deterministic features with event-time and availability-time lineage | Use future bars, unconfirmed pivots, or later backfills |
| strategy_plugins | SMC Mean Rejection as the primary deterministic strategy; XGBoost/LSTM as separate supporting model candidates; EMA/RSI as baselines | Modify risk limits or activate orders |
| simulator | Shared OHLCV simulation contract, costs, fills and trade ledger | Claim tick-level accuracy without tick data and a matching fill model |
| experiment_runner | Seeds, params, code SHA, dataset SHA, fold schedule and artifacts | Tune on final OOS or omit failed runs |
| evaluation | Baselines, walk-forward, costs, stability and uncertainty | Select from one favourable metric/window |
| risk_diagnostics | Independent exposure, drawdown and stale-data checks | Let ML/LLM output bypass deterministic policy |
| candidate_registry | Draft → evaluated → reviewed → approved/rejected/retired research state | Promote directly to broker execution |
| reporting | Evidence-rich run report and comparisons | Present simulated return as a forecast or guarantee |

## 5. Dataset and experiment contracts

### Dataset manifest (nova.dataset.v1)

Required metadata:

- dataset_id: stable identifier derived from canonical manifest metadata plus content_sha256
- content_sha256: hash of canonical OHLCV content, independent of provider metadata
- provider, source, symbol, timeframe, asset_class
- requested_start/end and actual_start/end (timezone-aware UTC)
- row_count, schema_version, ingested_at
- quality_status, quality_warnings, gap_count, duplicate_count
- storage_uri/artifact reference and immutable object version where available

Canonical OHLCV rows contain timestamp, open, high, low, close, and volume. Keep provider-specific fields as provenance metadata. Preserve raw input separately from normalized snapshots where retention/licensing permits.

### Experiment run (nova.quant-run.v1)

Persist:

- run_id (fingerprint of material inputs), tenant/owner, strategy_id and strategy version
- Git commit SHA, runtime/dependency version, deterministic seed
- dataset ID + SHA-256, symbols/timeframes, exact UTC evaluation range
- parameters, feature schema/version, split/fold boundaries and purge/embargo bars
- costs/fill assumptions: spread, commission, slippage, funding/borrow where relevant, and latency/partial-fill assumptions where supported
- status (queued/running/completed/failed/rejected), timestamps and bounded error code
- metrics, baseline comparison, warnings, artifact URI(s), evaluator version

A run is not reproducible if dataset checksum, code revision, strategy parameters, evaluation windows, seed, or cost configuration is missing.

## 6. Validation and evaluation methodology

1. Reject malformed, duplicated, out-of-order, timezone-naive, impossible or non-finite OHLCV. Report gaps; never manufacture candles. Apply provider/instrument session calendars before treating every interval as a missing bar.
2. Normalize timestamps to UTC and define whether a signal is known at bar close or earlier. If a signal needs a confirmed pivot, respect right-side confirmation delay. Earliest simulated entry is the next eligible bar unless a more granular event model proves otherwise.
3. Build features point-in-time. Record event time and availability/created time. A backfilled feature that became available after the decision timestamp must not enter historical training for that timestamp.
4. Use chronological train/validation/test partitions and purged walk-forward folds. Keep tuning inside training folds. Reserve final OOS before tuning; do not inspect it for candidate selection.
5. Compare against explicit baselines: buy-and-hold where meaningful, cash/flat, majority/always-hold for classifiers, and the current approved strategy. Use the same data, time window and costs.
6. Report at least trade count, net return after costs, expectancy/trade, profit factor, max drawdown, exposure, turnover, average win/loss, Sharpe/Sortino with stated sampling/annualization, and results by time/regime. Include stability/uncertainty ranges; do not infer skill from one best fold.
7. Track selection bias. PR #64 added research on Probability of Backtest Overfitting/CSCV and Deflated Sharpe Ratio; use these diagnostics when trial counts/data support them and document applicability limits.
8. A failed performance gate is a valid result. Do not relax frozen SMC/Fib/RSI/volume/spread/news/confidence/risk gates to manufacture trades or improve a headline metric.

## 7. Research-only safety boundary

- Quant Engine receives market datasets and, only through authorized read paths, sanitized account/portfolio snapshots. It never receives broker passwords, bridge tokens, tenant secrets, or vault plaintext.
- No route, tool, CLI command, queue message, model, or generated UI element in this module may submit, modify, cancel, or close broker orders/positions.
- Keep ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false. All output is research/paper analysis.
- Check tenant/owner authorization before run creation, result read, artifact download, or candidate state change. Never trust a tenant ID from model-generated payload without server-side ownership resolution.
- Candidate promotion requires recorded human review and a separate release process. A research approval is not trading authorization.
- Stale inputs and missing metadata fail closed; do not fabricate broker connectivity or data freshness status.

## 8. Implementation roadmap

### Phase 1 — foundation (this PR)
- Add standard-library OHLCV validation, canonical dataset hashing, deterministic run fingerprinting, chronological split and purged walk-forward window builders.
- Add contract tests and make repository CI execute them.
- Document boundaries, artifact/metadata placement and no-execution invariant.
- No database migration, provider secret, bucket, queue, deployment, broker call, model training, or UI change.

### Phase 2 — dataset registry and baseline adapter
- Add manifest serialization and immutable object artifact handling behind a storage interface.
- Add quality receipts and source adapters; normalize timestamp/symbol/timeframe conventions.
- Wrap existing EMA backtest as a named baseline plugin and persist its run manifest and trade ledger.
- Add cost sensitivity and benchmark parity tests.

### Phase 3 — experiment runner and evaluation
- Define strategy plugin interface and bounded asynchronous job contract.
- Add nested walk-forward runner, frozen final OOS, baseline comparison, trial log and evaluation report.
- Add SMC/Wave3 adapter only after PR #66 is reviewed/reconciled with main and causal event timing/full-history issues are addressed without weakening frozen gates.

### Phase 4 — persistence and orchestration
- Store owner-scoped run metadata and immutable artifact references; add migrations only after schema/RLS review.
- Add queue/worker orchestration after selecting secure compute runtime and defining retry/idempotency/DLQ behavior.
- Expose read-only status/results through authenticated Hub routes and validated intent contracts.

### Phase 5 — ML candidate lifecycle
- Integrate feature/model tracking when needed; record code/data/feature lineage.
- Candidate states: draft → evaluated → human-reviewed → approved-for-paper/shadow → rejected/retired.
- Add shadow monitoring, drift detection and rollback to last approved research candidate. This still does not activate live execution.

## 9. Acceptance criteria

- Invalid/duplicate/out-of-order/timezone-naive OHLCV is rejected; gaps are surfaced without autofill.
- Equivalent timestamps/numeric representations produce the same content fingerprint; material data/config changes alter the fingerprint.
- Every run fingerprint includes dataset hash, code revision, strategy version, parameters, evaluation plan and seed.
- Split/fold builders preserve chronology and purge boundaries with deterministic tests.
- PR CI runs the new Python contract tests.
- No broker write API or secret dependency is added; no deployment/production configuration changes.
- Green unit tests alone do not satisfy the delivery activation plan; real data provenance, full strategy evaluation, customer authorization and deployment evidence remain separate gates.

## 10. External technical references

- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Queues: https://developers.cloudflare.com/queues/
- Cloudflare R2 S3-compatible API: https://developers.cloudflare.com/r2/get-started/s3/
- Cloudflare R2 consistency: https://developers.cloudflare.com/r2/reference/consistency/
- Feast offline stores / point-in-time retrieval: https://docs.feast.dev/reference/offline-stores/overview
- Feast point-in-time joins and availability-time filtering: https://github.com/feast-dev/feast/blob/master/docs/getting-started/concepts/point-in-time-joins.md
- MLflow Tracking: https://mlflow.org/docs/latest/tracking/
- MLflow Model Registry: https://www.mlflow.org/docs/latest/model-registry/

References checked 2026-10-31. Recheck product capabilities and plan limits before deployment decisions.

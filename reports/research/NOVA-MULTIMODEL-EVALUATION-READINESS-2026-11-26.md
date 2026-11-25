# NOVA Multi-Model Evaluation — Readiness Audit

- Date: 2026-11-26
- Repository: vutting895/VOOM_SYSTEM-NOVA-AI
- Immutable baseline: main@821db357d70d3613b0ca61520eaae5c5307e8fd4
- Working branch: research/nova-multimodel-evaluation-20261126
- Scope: XGBoost, LSTM, SMC, NOVA Brain (LLM), NOVA dataset inventory and Exness MT5 Demo export readiness
- Mode: audit / research-only
- Safety invariants: ordersEnabled=false; executionEnabled=false; liveTradingEnabled=false; no broker write operations

## Executive status

**BLOCKED — no defensible multi-model performance run has been completed.**

This commit records a source/data readiness audit only. It does not claim model training, historical replay, backtest metrics, or a profitable result.

## Baseline and evidence

1. GitHub repository metadata confirms default branch `main`.
2. Main commit at inspection: `821db357d70d3613b0ca61520eaae5c5307e8fd4`.
3. Main commit combined status included failed Vercel build-rate-limit contexts and CircleCI pipeline error 2182. These are not evidence of an ML evaluation run.
4. The recursive Main Git tree contained 494 entries. No committed historical OHLCV CSV/Parquet dataset or MT5 export artifact was found in the inspected tree.
5. The Windows Desktop Commander device was online. Its allowed directories included the MT5 Common Files export folder, MT5 Scripts, and MT5 logs.
6. `Common\\Files\\NOVA_XAUUSDm_EXPORT` contained only `NOVA_Export_compile.log`; no OHLCV/tick export file was present.
7. The compile log for `NOVA_Export_XAUUSDm_M5_Ticks.mq5` reports 0 errors and 0 warnings. This proves compilation only, not script execution or successful data export.
8. `C:\\MT5\\logs\\20261126.log` shows MT5 build 6230 launched from `C:\\NOVA_EA_RESEARCH\\phase6-harness\\portable-broker.ini`, IPC dispatcher initialization failures, port 22346 bind errors, and a `NOVA_BrokerAdapter_RuntimeSelfTest` script load. This does not establish an authenticated Exness Demo data session or successful historical retrieval.
9. `ollama` is not available as a command on the inspected Windows device. No local Ollama model runtime was verified.

## Component audit

### XGBoost — FAIL / prototype only

Source: `workers/feature/supervised_xgboost_prototype.py`

Observed issues:
- `funding` feature is populated with `np.random.uniform`, not point-in-time market data.
- Target uses `close.shift(-5)`; the final five rows are not removed before fitting, so missing future labels are coerced into class 0.
- `train()` fits and scores on the same rows. The printed accuracy is in-sample and cannot be reported as validation/OOS accuracy.
- No chronological split, purge/embargo, frozen final OOS, probability calibration, or reproducible feature manifest is implemented in this prototype.

Gate: replace random funding with sourced data or remove it; build labels with explicit horizon and drop unresolved tail rows; fit preprocessing only on training folds; add purged walk-forward and frozen final OOS; compare with a majority baseline.

### LSTM — FAIL / no actual training evidence

Sources: `workers/quant_engine/training.py`, `workers/quant_engine/torch_models.py`

Observed issues:
- `train_sequence_model()` currently returns a fixed best epoch, fixed validation loss, and literal `mock-checkpoint-bytes`.
- No optimizer, loss calculation, training loop, validation loop, early stopping, or real model serialization is present in that function.
- `torch_models.py` currently defines a residual MLP, not an LSTM architecture.

Gate: implement a genuine sequence model and training loop; record seed, data/feature hashes, train/validation boundaries, optimizer/config, epoch history, and actual checkpoint SHA-256. Do not label the current MLP as LSTM.

### SMC — PARTIAL / split implementations need reconciliation

Sources:
- `workers/feature/smc_wave/smc_strategy.py`
- `workers/backtest/walk_forward.py`
- `workers/quant_engine/smc_mean_rejection_backtest.py`

Observed:
- The canonical SMC strategy source documents completed-candle processing and pivot confirmation using left/right bars.
- The generic walk-forward helper exists, but its README explicitly says it evaluates a fixed-rule baseline and does not fit/tune model parameters.
- The separate 4H/5M mean-rejection script detects swings using future right-side bars. Its historical use must be audited for confirmation-time leakage and higher-timeframe bar availability before its results can be accepted.
- The current walk-forward helper's result is not a tick-accurate MT5 simulation or a complete portfolio-level performance test.

Gate: use one canonical strategy adapter; enforce event-time/availability-time for pivots and higher-timeframe candles; use next-eligible-bar fills; add broker-specific costs and conservative intrabar ambiguity handling; report each fold separately.

### NOVA Brain — BLOCKED / no deterministic replay evidence

Source: `workers/gen-ai/llm_strategy_prototype.py`

Observed:
- A local Ollama JSON inference adapter exists as a prototype.
- The inspected Windows device did not have the `ollama` command available.
- No completed historical prompt/response ledger with model identifier, prompt hash, candle cutoff, timestamp, schema-validation result, latency, token usage, and immutable response hash was found in the inspected Main tree or MT5 export folder.
- The existing adapter produces a draft strategy configuration; this is not yet a bar-by-bar historical signal replay.

Gate: select a verified model runtime; define a strict no-future-data prompt contract; record immutable request/response logs and provider usage/cost; replay the exact logged outputs in a deterministic simulator. If the provider is stochastic, preserve the original response rather than regenerating it during the backtest.

## Data intake requirements

### NOVA / Kaggle / Datacenter

No committed historical dataset was found in the inspected Main Git tree. Before training, obtain the actual dataset artifact and manifest. Required fields:
- Exact broker symbol and timeframe
- Source/provider and account environment classification (Demo only)
- UTC timestamps, half-open range, row count, and coverage
- OHLC plus tick volume; spread where available; real volume where provided
- SHA-256 of raw artifact and normalized canonical rows
- Duplicate, gap, irregular-session, malformed-bar and timezone report
- Explicit separation of real ticks, generated ticks, and bar-only data

Do not infer that a Kaggle workflow success/failure implies dataset availability. The latest inspected Kaggle Daily Data Ingestion run on Main was failed (run 45585756447, SHA 821db357d70d3613b0ca61520eaae5c5307e8fd4).

### MT5 Demo

The collector contract requires read-only, tenant-authenticated GET, UTC half-open ranges, closed bars, strictly increasing unique timestamps, valid OHLC, nonnegative volume/spread, and a maximum 2,000 bars per request. Real collection is unproven until an authenticated Demo read returns bars and the existing Datacenter ingestion system returns a receipt.

Required next evidence:
1. Confirm the MT5 terminal is logged into the intended Exness Demo account without exposing account identifiers or credentials.
2. Resolve the IPC / port 22346 binding conflict through the authorized terminal setup; do not disable safety controls.
3. Run the exporter on the intended symbol/timeframe/range.
4. Verify non-empty files exist in the designated Common Files export folder.
5. Validate UTC, bar closure, symbol, timeframe, count, gaps, duplicates and SHA-256.
6. Ingest through the existing approved Datacenter route and retain its receipt.

## Evaluation protocol (after data gates pass)

1. Freeze a dataset manifest and immutable SHA-256 before any experiment.
2. Reserve a final chronological OOS period that is not used for model, prompt, feature, threshold, or parameter selection.
3. Within development history, run purged expanding/rolling walk-forward folds. Fit transforms and models only on each training fold.
4. Evaluate ML models separately from deterministic SMC and from LLM replay. Do not pool signals or select a winner on the final OOS.
5. Use the same timestamps, tradable universe, fill timing, and cost assumptions for all comparable strategies.
6. Include spread, commission, swap/funding and slippage where applicable. State what cannot be modeled.
7. Report per-fold and aggregate net PnL, PF, max drawdown, closed trades, expectancy, exposure, turnover, Sharpe/Sortino with annualization assumptions, classification metrics against a majority baseline, and stability.
8. For LLM, report requests, retries, token counts, latency, schema failures, abstentions, model/provider version, and estimated API cost. No silent retries or regenerated historical decisions.
9. Keep all execution flags false and verify zero broker mutation requests.

## Acceptance gates

- [ ] NOVA historical dataset artifact + manifest verified
- [ ] MT5 Demo export artifact + Datacenter receipt verified
- [ ] XGBoost random feature removed/sourced and leakage-safe labels implemented
- [ ] XGBoost purged walk-forward training and final OOS protocol verified
- [ ] Genuine LSTM model and training/checkpoint implementation verified
- [ ] SMC single-source strategy adapter and event-time pivot/Higher-TF rules verified
- [ ] Broker-specific cost/fill model and trade ledger validated
- [ ] NOVA Brain runtime/model verified and immutable historical replay ledger generated
- [ ] Same-window, same-cost independent model evaluations completed
- [ ] Exact-head tests and immutable reports attached
- [ ] Safety audit confirms zero broker writes and all execution flags false

## Current verdict

No model performance score is published. PF, max drawdown, win rate, trade count and API cost are **NOT MEASURED** for this requested combined evaluation because no eligible, provenance-verified historical input was available in the inspected locations.

This branch is an audit record only. Main is unchanged. No deployment, migration, secret change, broker write, order submission, or Live Trading action was performed.

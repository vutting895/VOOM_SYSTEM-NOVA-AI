# NOVA Unified Intelligence & Validation Engine (UIVE)

- Date: 2026-11-26
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base: `main@821db357d70d3613b0ca61520eaae5c5307e8fd4`
- Branch: `research/nova-unified-intelligence-20261126`
- Status: research architecture + guarded notebook scaffold; training is blocked until eligible data exists
- Safety: Exness Demo/read-only only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`

## Objective

Unify XGBoost, a genuine PyTorch LSTM, canonical SMC and NOVA Brain into one reproducible research/evaluation system. The components retain separate responsibilities and are evaluated independently before any fusion. The meta-decision layer consumes development-only out-of-fold predictions; it cannot override deterministic risk policy or submit broker requests.

## Evidence-driven baseline

The 2026-11-26 readiness audit in PR #421 found:
- XGBoost prototype includes random synthetic funding, unresolved forward-label tail rows, and in-sample fit/score.
- The current `workers/quant_engine/training.py` returns literal mock checkpoint bytes; `workers/quant_engine/torch_models.py` defines a residual MLP, not an LSTM.
- Canonical SMC has pivot confirmation, but the separate 4H/5M script needs event-time and higher-timeframe availability review.
- NOVA Brain has no immutable historical request/response replay ledger with model, prompt, response, timestamp and cost provenance.
- No approved, provenance-verified historical OHLCV artifact was present in the inspected locations; PF, drawdown, trade count and API cost were not measured.

This branch does not modify or silently bless those existing prototypes. The notebook implements a separate, guarded research path. Session segment IDs are derived from UTC timestamps and the declared cadence: every non-cadence interval starts a new segment, so rolling features, forward labels and LSTM sequence windows cannot bridge weekend, rollover or unexplained gaps.

## Unified architecture

1. **Data & provenance** — immutable raw source, UTC half-open range, exact broker symbol/timeframe, OHLC/tick volume/spread, session-aware gap receipt, row count and SHA-256.
2. **Point-in-time feature layer** — each feature has event time and availability time. No future bars, unconfirmed pivots, later backfills or cross-gap sequences.
3. **Base models / strategy**
   - XGBoost: tabular causal features; remove random funding. Train/transform only on each training fold.
   - LSTM: genuine recurrent PyTorch module, optimizer/loss/early stopping and real state-dict checkpoint. Never call an MLP an LSTM.
   - SMC: canonical confirmed-candle strategy adapter; publish pivot only after right-hand confirmation and HTF candle close; entry no earlier than next eligible bar.
   - NOVA Brain: historical replay of immutable, already-recorded responses only. Record provider/model version, prompt/response hashes, creation time, schema result, latency, token usage and cost. Never regenerate historical LLM decisions during replay.
4. **Meta Decision Layer** — fit/calibrate only on out-of-fold development predictions. Inputs are XGB probability, LSTM probability, SMC state and immutable LLM decision/context. Missing/stale/contradictory inputs cause ABSTAIN. No manually invented weights.
5. **Shared evaluator** — identical timestamps, next-bar fill convention, instrument spec and cost model for all candidates. Report spread, commission, swap, slippage, partial fills/rejects/latency where evidence exists. Unknown costs are a blocker, not zero.
6. **Independent risk/evidence gate** — exposure, drawdown, stale data, trade count, fold stability and audit evidence. Models cannot change risk limits or access order APIs.

## Evaluation protocol

- Freeze dataset SHA, code SHA, feature schema, seeds, model config, fold schedule and cost-model version.
- Split chronologically. The final OOS begins at `2026-07-01T00:00:00Z` (exclusive development boundary); development tuning must never inspect it.
- Within development data, use expanding walk-forward folds. Purge at least the maximum forward-label horizon; fit scalers/calibrators/meta-model only inside each training fold. Use embargo when a non-forward-only CV scheme is used and labels/features can overlap.
- Remove unresolved tail rows whose forward labels do not exist. Never coerce missing future labels into class 0.
- Compare with majority/flat and existing frozen strategy baselines. Same period, fill timing and costs.
- Final OOS is evaluated once after all choices are frozen. Minimum 30 closed trades is a sample gate, not proof of statistical significance.
- Report per-fold and aggregate closed trades, net PnL, PF, expectancy, max drawdown, exposure, turnover, win/loss distribution, Sharpe/Sortino with stated annualization, classification metrics vs baseline, calibration, uncertainty and regime breakdown.
- For NOVA Brain also report response coverage, schema failures, abstentions, latency, tokens, retries and cost.
- Do not select the best of repeated OOS trials. Record every experiment, including failures.

## Canonical data acquisition and handoff

- The canonical current-main source path is the existing authenticated NOVA Gateway `dataset_collect_mt5` → tenant-isolated `GET /api/history` Bridge/Relay/Proxy → Datacenter `dataset_ingest`. It reads closed bars from the signed-in user's own Exness Demo connection, preserves broker symbol casing and source order, and does not grant broker write access. Do not create a second broker gateway or use a direct broker credential in Colab.
- The Windows `NOVA_Export_XAUUSDm_M5_Ticks.mq5` file was compiled successfully, but the inspected Common Files directory contained only its compile log. There is no evidence it was executed or that it exported data. It is not the accepted training dataset.
- Datacenter `dataset_get` remains metadata-only. A bounded owner-scoped `dataset_export_chunk` implementation is proposed in Datacenter PR #6; it requires the exact `PASSED` + approved dataset version, verifies the Parquet SHA-256, and returns chunks (maximum 1,000 rows) with per-chunk SHA-256 and contiguous offsets. The NOVA Gateway exposure is proposed separately in NOVA PR #423. Both PRs remain open drafts.
- The notebook now contains an optional importer through the existing Remote MCP Gateway. It pins dataset ID/version, verifies approval and quality receipts, checks every chunk hash and offset, and writes a derived CSV plus provenance manifest. It reads a short-lived Supabase user JWT from Colab Secrets; it never stores a token in notebook source. `IMPORT_APPROVED_DATASET=False` by default.
- The handoff is **not yet operational**: Datacenter has no deployed endpoint configured in the Gateway, the two export PRs are not merged/deployed, and no eligible approved historical Dataset version has been verified. Do not bypass Datacenter approval or copy broker credentials into the notebook.
- The notebook derives conservative segment IDs from the UTC timestamps and declared H1 cadence. Any interval other than exactly 3,600 seconds starts a new sequence segment; the separate dataset quality receipt must still classify/approve all gaps before training.

## Notebook

`notebooks/NOVA_Unified_Intelligence_Research.ipynb` is a CPU-first Colab/Kaggle notebook. It defaults to `RUN_TRAINING=False`. It refuses training unless:
- the user explicitly sets the opt-in in the notebook;
- the manifest declares completeness PASS and training eligibility;
- all three safety flags are false;
- the on-disk data hash matches the manifest;
- UTC/order/duplicate/OHLC/session-gap validation passes;
- final OOS is separated from development data.

The notebook includes XGBoost, a genuine LSTM, SMC/LLM replay input contracts, OOF meta-fusion and a cost-aware evaluator. It does not download data automatically, embed credentials, create broker write capability, or commit model weights/data to Git.

## Implementation boundary

- Research-only. No production inference wiring, migrations, deployment, model promotion or broker mutation.
- Reuse the existing Quant Engine/Gold Lab contracts where they are verified; do not create another broker gateway or duplicate control plane.
- This initial implementation adds pure research contracts and notebook code only. It does not claim the old XGBoost/LSTM prototypes are repaired.
- Training remains BLOCKED until a real dataset and cost fixtures pass the gates.

## External methodology references

- Marcos López de Prado, *Advances in Financial Machine Learning*, Ch. 7: purging overlapping label intervals and embargo.
- scikit-learn `TimeSeriesSplit`: chronological folds and explicit gap.
- Google, *Rules of Machine Learning*: feature parity and training-serving skew measurement.

External methodology references:
- [López de Prado, Advances in Financial Machine Learning (Wiley)](https://www.wiley.com/en-us/Advances+in+Financial+Machine+Learning-p-9781119482086) — Ch. 7 purging/embargo and overlapping label intervals.
- [scikit-learn TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) — chronological folds and explicit gap.
- [Google Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) — training-serving skew and feature parity.

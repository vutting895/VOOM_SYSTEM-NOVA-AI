# Trading Intelligence — Neural Network Market & Strategy Analysis

- Status: development slice / Draft PR
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base inspected: `main@99d474038e19a6eab884c5c891b21770c50fefa5`
- Frontend: Next.js in `frontend/`
- Data boundary: authenticated NOVA API route -> Remote MCP Worker -> allowlisted read-only tools
- Safety: read-only market analysis; `ordersEnabled=false`; `executionEnabled=false`; Live Trading OFF

## Product responsibility

Trading Intelligence is the analysis workspace, separate from the general Markets watchlist and AI strategy-draft page. Its responsibilities are:

1. Show verified OHLC price data and provider timestamps.
2. Render candlesticks and technical context using only returned bars.
3. Compare price structure and strategy research in a dedicated view.
4. Make the Neural Network Engine the target primary inference processor while preserving provenance, uncertainty and abstention requirements.
5. Keep deterministic strategy validation and risk checks separate from model output.

## Current implementation in this branch

- `/trading-intelligence` provides an authenticated market-data selector, candlestick chart, EMA 12/26 context, RSI 14, a 20-bar price range, and confirmed-swing SMC BOS/CHoCH plus three-candle FVG heuristics.
- Exness MT5 reads use the signed-in user's existing Demo connection through `mt5_quotes`; the Remote MCP Worker and MT5 proxy enforce Supabase ownership and the dedicated tenant Bridge route. Pending, unprovisioned, unauthenticated and unavailable states are shown as unavailable; no price is fabricated.
- Binance public OHLCV is available as a public research source for verifying the UI and analysis pipeline. It is explicitly labelled as Binance data, not Exness or customer-account data.
- The Next.js API route forwards only a fixed set of typed tool calls to the fixed Remote MCP endpoint. The browser cannot select an upstream URL or arbitrary MCP tool.
- Technical calculations exclude the latest potentially unfinished bar. The output is descriptive context and does not create an order signal, entry, stop or target.
- A strict Neural inference result contract validates the model artifact hash, data/feature provenance, requested symbol/timeframe, untouched Final OOS evidence, walk-forward count, net-of-cost result, profit factor and calibration evidence. It rejects payloads containing broker instructions.
- The Neural Network panel deliberately reports `INFERENCE NOT VERIFIED`. No trained model artifact, approved registry entry or deployed inference runtime has been verified on current main. The contract is a gate for future model integration, not a prediction engine or a claim that inference is currently running.
- Wave3 + XGBoost + PyTorch LSTM + SMC remains research-only. The known latest benchmark evidence did not pass its OOS acceptance gate; no promotion or profitable-edge claim is allowed.

## Neural Network processor target

The intended processing hierarchy is:

1. **Data and feature validation:** validate finalized OHLCV, timestamps, symbol/timeframe metadata, freshness, data hash and point-in-time feature manifest. Never train or infer from an unfinished candle when the strategy contract requires a closed bar.
2. **Primary neural processor:** PyTorch sequence model (LSTM/GRU initially) for regime/temporal representation. CNN/1D-CNN can be evaluated for local pattern features; Transformer is a later challenger, not an assumed production dependency.
3. **Secondary model comparison:** XGBoost remains an independent feature/model comparator. It must not be conflated with the neural model or silently blended into an ensemble.
4. **Deterministic strategy reasoning:** Wave3/Fibonacci and SMC (BOS/CHoCH/OB/FVG) produce auditable structural conditions. Frozen entry gates are not relaxed to force signals.
5. **Calibration and abstention:** probabilities must sum to one, be calibrated on training/inner validation only, and include uncertainty. Missing/stale data, drift, model/version mismatch, low support or runtime failure means abstain and show unavailable.
6. **Report:** display regime probabilities as model outputs only after evidence gates pass, with model id/version, artifact hash, dataset/feature hashes, last closed bar, inference timestamp, validation manifest and limitations.
7. **Risk boundary:** deterministic risk policy is authoritative. Model output cannot choose a broker route, modify policy, approve itself, or invoke broker writes.

## Neural runtime implementation added in this branch

- `workers/trading_intelligence/neural_runtime.py` adds a CPU-capable, unidirectional PyTorch LSTM research candidate trainer and shadow inference function.
- Input validation requires timezone-aware, strictly increasing OHLCV bars and exact timeframe alignment. Strict contiguous mode remains the default. Explicit `allow_session_gaps=True` uses a conservative candidate policy: timeframe-aligned pauses up to 6 hours remain in-segment and are represented by the causal `log_elapsed_intervals` feature; closures from 24 hours through 4 days start a new segment and reset feature warm-up; gaps between 6 and 24 hours or over 4 days are quarantined. Sequence windows and forward labels cannot cross long-closure boundaries. No synthetic candles are inserted. This heuristic is not a substitute for a broker session calendar; duplicate, reversed, non-aligned and impossible OHLCV always fail closed. Training and shadow inference must use the same declared gap policy.
- Optional broker spread points are validated and retained in the canonical dataset hash and manifest (unit: symbol points). Spread is preserved for provenance/cost evaluation but is not an LSTM input feature; commission, swap and slippage remain separate evaluation inputs.
- Causal features are calculated from current/past bars only: log returns, realized volatility, RSI, EMA gap, volume z-score, candle body and range.
- Training uses chronological train/validation partitions with horizon purge. The final 15% partition is explicitly reserved; its labels are not consumed by candidate fitting or early stopping.
- Candidate artifacts are hash-checked and bound to one symbol/timeframe. The output includes bullish/bearish/sideways probabilities and normalized predictive entropy.
- Candidate lifecycle is hard-coded to `research_candidate` / `not_evaluated`; shadow inference cannot mark a model validated or promotable. It has no broker integration and all execution flags remain false.
- `.github/workflows/trading-intelligence-neural-ci.yml` installs CPU-only PyTorch and runs deterministic code-path, leakage-boundary, artifact-integrity and fail-closed tests.

A read-only MT5 API connectivity/data probe against the signed-in Exness Demo terminal retrieved 30,000 XAUUSDm M5 bars (2026-06-01 through 2026-10-30) and 12,000 H1 bars (2024-10-21 through 2026-10-30). The probe found zero malformed OHLCV bars and zero duplicate/reversed timestamps; it also confirmed tick-volume and spread fields are present. It identified 109 M5 and 523 H1 interval gaps. The probe did not persist or commit broker data, inspect the numerical spread/cost distribution, or train a model. This proves local MT5 API read access only, not the hosted customer Bridge/API path.

This is a first runtime slice, not a trained production model. No real Exness dataset was supplied to this job, no Final OOS results were generated, no strategy-level net-of-cost metrics exist, and the frontend continues to display `INFERENCE NOT VERIFIED`.

## Runtime decision

Model training and full historical evaluation must run outside latency-sensitive Cloudflare Worker request handlers. Current repository evidence describes ML examples under `workers/feature` as research prototypes with no production feature registry wired. This branch does not introduce a new paid GPU service, hosted model endpoint, or cloud billing dependency.

Before the Neural Network panel can be promoted from not verified to available, a separately reviewed inference runtime must prove:

- exact model artifact and reproducible loading/runtime version;
- point-in-time feature and preprocessing parity between training and inference;
- chronological nested walk-forward evaluation, purge/embargo where required, and an untouched Final OOS manifest;
- at least five walk-forward folds, at least 30 closed OOS trades for a strategy-level result, positive net profit after realistic costs, and profit factor greater than 1.0;
- calibration artifact and metrics (including Brier score and expected calibration error);
- no-lookahead, stale-data, data-gap, symbol/timeframe mismatch, model outage, drift and rollback tests;
- shadow inference with no broker-write access.

Passing CI or accepting a research PR is not proof of a profitable model, provider connectivity or a live service.

## Non-goals and safety invariants

- No broker order, position mutation, transfer, withdrawal or account-setting methods.
- No Live Trading switch or order submission UI.
- No fabricated quotes, confidence, win probability, performance metric, chart data or model status.
- No customer data or broker secrets in fixtures, browser storage, logs or model artifacts.
- No training/tuning on Final OOS.
- No merge to main, production deployment, migration, broker route provisioning or credential intake as part of this branch.

## Validation plan

The branch adds unit tests for bounded tool requests, MCP response handling, market-data normalization, closed-bar analysis, inference provenance gates and auth-before-payload parsing. The repository Frontend CI must additionally pass typecheck, Next.js build, OpenNext build, security/tenant tests, and its new Trading Intelligence test step on the exact PR head.

## Files introduced or updated

- `frontend/app/trading-intelligence/page.jsx`
- `frontend/app/trading-intelligence/trading-intelligence.css`
- `frontend/app/api/trading-intelligence/route.js`
- `frontend/lib/trading-intelligence.mjs`
- `frontend/lib/neural-inference-contract.mjs`
- `frontend/components/nova-navigation.jsx`
- `frontend/app/page.jsx`
- `tests/trading-intelligence.test.mjs`
- `.github/workflows/frontend-ci.yml`

# VOOM Transformer Market Brain — Architecture and Work Order Proposal

Status: ARCHITECTURE PROPOSAL ONLY. Research implementation belongs in `vutting895/Datacenter`, not this NOVA repository. No model training, predictive edge, or production readiness is claimed.

## Ownership boundary

The repository ownership contract is explicit:

- **Datacenter** owns authoritative research computation and lineage: market-data validation, dataset/universe registry, feature and label engineering, strategy research, model training, calibration, evaluation, backtesting, walk-forward refitting, model artifacts and research approval.
- **VOOM AI / NOVA** owns user-facing workflow, authenticated Supabase session, the existing single Remote MCP Gateway, read-only broker-data connectivity, signal presentation, Risk Engine and execution safety.
- NOVA must not duplicate model training or calculate authoritative research metrics. NOVA calls Datacenter only through the existing authenticated Gateway and the one Datacenter MCP endpoint.

The initial implementation files previously prototyped under NOVA's `workers/market_brain/` were removed from this branch after the ownership review. This PR now preserves only the architecture proposal.

## Proposed new brain

Build a dedicated **Intraday Transformer Market Brain** as the future primary analysis model within Datacenter's existing Learning/Research service. It is not a general-purpose VOOM LLM, vision, or automation core.

### Model architecture

1. **Point-in-time data gate** — approved, immutable OHLCV dataset versions only; verified symbol, timeframe, UTC timestamps, cadence, broker-session calendar, data provenance and gap receipts.
2. **Causal multi-timeframe feature layer** — completed-bar features from M1/M5/M15/M30/H1 (subject to dataset availability), with strict as-of joins. No forming candle, future close, or forward-filled future data.
3. **Patch-based causal Transformer** — patch embedding plus causal attention; independent heads for direction (SELL/WAIT/BUY), market regime (TREND/RANGE/HIGH_VOLATILITY), volatility distribution and expected net move.
4. **Structure-aware feature branch** — deterministic SMC structure (BOS/CHoCH, liquidity, FVG, premium/discount) as timestamped, auditable features. Do not hard-code a trade decision inside the Transformer.
5. **Hybrid challenger** — compare Transformer against current Datacenter-supported Logistic Regression / Random Forest / XGBoost baselines and separately approved legacy LSTM/SMC references. Use a calibrated Meta Decision Layer only if ablation proves incremental net value.
6. **Decision policy** — default WAIT/NO TRADE; require calibrated directional probability, expected move consistent with direction, and positive expected edge after commission, spread and slippage. A model probability is not expected return.
7. **Research outputs** — versioned model artifact, feature schema, training config, dataset/universe lineage, calibration, inference metrics and reproducible evaluation report.

### Intraday constraints

- Daily-profit objective is a research objective, not a guaranteed outcome.
- No overnight positions. The model must not be responsible for enforcing daily flatten; that is an independent Risk/Execution control.
- WAIT/NO TRADE for the entire session is a valid output.
- Stale/missing/unapproved data, unknown model version, low confidence, adverse cost, high volatility or unsupported timeframe alignment must fail closed to WAIT.
- Do not optimize accuracy alone. Evaluate net P&L after realistic costs, PF, max drawdown, expectancy, calibration, trade count, turnover, session/regime stability and inference latency.

## Evaluation and replacement gates

Do not replace the existing analysis stack until every gate is independently evidenced:

- Dataset provenance and approved immutable version are valid; no synthetic bars or silent gap filling.
- Leakage audit, point-in-time feature lineage and label-horizon purge are clean.
- Chronological train/validation/test and true walk-forward **per-fold model refitting** are implemented. Existing signal replay is not equivalent to model refitting.
- Sealed OOS begins at `2026-07-01T00:00:00Z`; never tune against this period.
- At least 30 closed OOS trades, positive net profit after realistic costs, PF > 1.0, and robustness across multiple folds/regimes.
- Challenger and incumbent use identical data, signal timing, execution assumptions and costs.
- Ablation demonstrates that Transformer/SMC/Meta components add measurable value; otherwise remove unnecessary complexity.
- Artifact checksum, reproducibility, calibration, resource/latency limits, tenant isolation and fail-closed behavior pass.
- Explicit human model approval and separate owner approval for any production cutover.

If any gate fails, the incumbent remains the reference. No legacy implementation is deleted merely because a Transformer exists.

## Work order required before Datacenter implementation

This document is a proposal, not authorization to modify Datacenter. Datacenter's `WORK_ORDER_INSTRUCTIONS.md` requires an explicitly approved Work Order and main-SHA verification before each mutation. The next implementation needs a dedicated Work Order covering:

1. Research and code ownership confirmation.
2. Approved dataset/universe and exact target symbol/timeframes.
3. Model family and bounded CPU-first dependency/resource budget.
4. Training API/job lifecycle and model registry changes.
5. Causal feature and label schema, target horizon, purge/embargo rules.
6. Walk-forward refit, sealed OOS and cost model.
7. Tests, reproducibility, audit records and acceptance evidence.
8. NOVA Gateway contract additions only after Datacenter tools exist.
9. Rollback and incumbent comparison plan.

## Safety boundary

- No broker connection, order submission, execution permission, deployment, or live trading.
- `orders_enabled=false`, `execution_enabled=false`, `live_trading_enabled=false`.
- `overnight_positions_allowed=false`.
- Research and model approval do not enable trading.

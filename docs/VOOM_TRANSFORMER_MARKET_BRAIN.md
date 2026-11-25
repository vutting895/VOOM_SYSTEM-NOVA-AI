# VOOM Transformer Market Brain v1

Status: isolated research implementation on a feature branch. No model training, predictive edge, or production readiness is claimed.

## Decision

Build a dedicated intraday Market Intelligence Brain as the future primary analysis engine. Do not expand it into the general VOOM/NOVA language, vision, or automation core. Existing SMC, Elliott/Wave3, XGBoost and LSTM work remains a frozen comparison/reference during migration. No legacy path is removed until the replacement passes parity, walk-forward and sealed-OOS gates.

## Architecture

1. **Data gate:** completed, timestamped OHLCV bars; timezone-aware strictly increasing timestamps; valid OHLC bounds. Dataset identity, provenance, gaps, symbol and timeframe must be verified upstream before training.
2. **Causal features:** log return, range/close, body/close, close location and rolling volume z-score. Features use current and earlier completed bars only. Multi-timeframe alignment must use only bars closed and available at decision time.
3. **Patch Transformer:** causal patch encoder with triangular attention mask. Heads produce direction (SELL/WAIT/BUY), regime (TRENDING/RANGING/HIGH_VOLATILITY) and volatility scale.
4. **Decision policy:** default WAIT. A directional signal requires calibrated confidence and expected net edge after spread, commission and slippage. Probability is not expected return or proof of edge.
5. **Risk boundary:** emits typed research signals only. Existing independent Risk Engine and human approval controls remain authoritative. No broker client or order method is imported.
6. **Evaluation:** chronological train/validation/test, purge gap from maximum label horizon, walk-forward refit per fold, sealed final OOS from 2026-07-01T00:00:00Z, and cost-aware simulation. Existing signal-replay walk-forward is not full model retraining; a dedicated refit runner is still required.

## Intraday operating policy

- Intraday only; no position may be held across the broker trading-day boundary.
- Daily close/flatten is enforced by the execution/risk layer, not model prediction.
- The model may return WAIT/NO TRADE for an entire session.
- Missing/stale data, unverified source, unsupported timeframe alignment, or unavailable model artifact must fail closed to WAIT.
- Evaluate net P&L after costs, profit factor, drawdown, trade count, calibration, turnover and regime-specific performance; not accuracy alone.

## Replacement gates

The new Brain becomes primary only after all gates pass:

- Exact dataset manifest and provenance; no synthetic dashboard data.
- No leakage, future timestamp access, duplicate bars or unhandled gaps.
- At least 30 closed trades in sealed OOS beginning 2026-07-01 UTC.
- Positive net OOS profit after realistic costs and profit factor > 1.0.
- Walk-forward robustness across regimes and no single-fold dependency.
- Same-data, same-cost, same-execution benchmark against frozen incumbent SMC/Wave3/XGBoost/LSTM.
- Inference latency and memory fit target runtime; artifact and feature schema versioned.
- Risk boundary, tenant isolation and fail-closed tests pass.

If any gate fails, do not cut over. Newer or more complex does not mean better.

## Migration sequence

A. Implement isolated feature and model contract (this branch).
B. Add deterministic contract tests and optional PyTorch shape/causality tests.
C. Add training, calibration and walk-forward refit only after approved historical data is available.
D. Run incumbent-vs-challenger shadow comparison without execution.
E. Require independent review and explicit cutover approval.
F. Only after separate approval retire old analysis paths.

## Safety flags

- orders_enabled=false
- execution_enabled=false
- live_trading_enabled=false
- research_only=true
- orders_submitted=false
- overnight_positions_allowed=false
- promotion_enabled=false
- deployment_enabled=false
- broker_connection_enabled=false

## Known limitations

- No trained weights or training loop.
- No calibration artifact or expected-return model.
- Volume feature assumes comparable tick-volume semantics within input stream.
- Cross-timeframe synchronization and news features are not implemented in v1.
- This is a research foundation, not a profitable or production-ready trading system.

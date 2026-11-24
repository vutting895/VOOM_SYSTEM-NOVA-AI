# Backtest Worker

Canonical deterministic EMA crossover engine: `workers/backtest/engine.py`.
It requires timezone-aware, strictly chronological historical OHLCV, validates
price/volume fields through the Quant Engine quality validator, and applies
explicit fee and slippage assumptions. It does not generate synthetic market
data, use randomized trade outcomes, or submit orders.

`engine_prototype.py` remains only as a backward-compatible import shim.
New code must import from `workers.backtest.engine`.

Metrics are historical bar-close simulation results, not forecasts. Confirm
candle source, timezone, gaps, exchange-specific fees, funding, spread,
instrument sizing, and execution assumptions before using results in decisions.
This EMA engine is not a tick-accurate MT5 simulator.

## Deterministic optimization

Canonical tuner: `workers/tuning/engine.py`. It evaluates a bounded,
deterministic parameter grid by calling the supplied real backtest function
against validated historical OHLCV. It rejects missing data, invalid
objectives, and non-finite scores. It does not generate synthetic scores.
`optuna_tuner_prototype.py` remains as a backward-compatible import shim.

Optimization is in-sample unless the caller separately evaluates the selected
parameters on a chronological, untouched holdout. Do not promote parameters
based only on the best in-sample score.

## SMC historical backtest API

The isolated research runtime exposes:
- `GET /health`
- `POST /v1/smc/analyze`
- `POST /v1/smc/backtest`

Submit chronological, completed OHLC candles as JSON. Backtest settings include
`reward_risk`, `fee_rate`, `slippage_rate`, and `initial_equity`. The engine
assumes next-bar-open entry and conservatively assumes stop loss first when
stop and target are touched in the same candle. Results are per-unit research
estimates, not portfolio-sized returns.

## Walk-forward / out-of-sample

- `POST /v1/backtest/walk-forward` runs rolling expanding-window folds.
- Configure `train_bars`, `test_bars`, `step_bars`, and `warmup_bars`.
- Only trades entered inside each held-out test segment contribute to OOS metrics.
- This evaluates the fixed SMC baseline; it does not fit/tune model parameters.

## Safety boundary

All backtest and tuning modules are research-only. `execution_enabled` and
`live_trading_enabled` remain false. No broker order, position mutation, or
fund transfer capability is exposed by these engines.

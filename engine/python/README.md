# NOVA Python Engine

Python 3.11 research and analysis engine for XAUUSD only.

This package is intentionally isolated from the existing Node.js/React application. It does not import MetaTrader5 and does not submit broker orders.

## Initial module boundaries

- `nova_engine/domain`: typed contracts and domain invariants
- `nova_engine/data`: market-data validation and canonical bars
- `nova_engine/features`: deterministic indicators and SMC features
- `nova_engine/strategies`: strategy signal producers
- `nova_engine/decision`: ensemble/meta-decision layer
- `nova_engine/risk`: independent risk governor (advisory/entry-lock only)
- `nova_engine/research`: backtest and walk-forward evaluation
- `nova_engine/api`: future service boundary

No module in this foundation claims a trained model or a profitable strategy.

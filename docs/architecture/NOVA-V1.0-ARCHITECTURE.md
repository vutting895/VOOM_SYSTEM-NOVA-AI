# NOVA v1.0 Architecture

**Status:** Foundation proposal / implementation scaffold  
**Scope:** XAUUSD only; Python 3.11; M1 base with M5, M15, M30 and H1 context.

## System shape

1. Existing React/Vite application remains the current UI; do not replace it in this phase.
2. Cloudflare Worker is the intended API edge/gateway.
3. Supabase PostgreSQL/Auth is the intended persistence and identity layer.
4. `engine/python` is an isolated research/analysis package. It has no MT5 Python dependency.
5. `mt5/Novas` is a separate MQL5 read-only telemetry/data bridge.
6. Models and strategies emit typed signals. A Meta Decision Layer may rank or reject signals; it cannot execute orders.
7. Risk Governor is independent from model confidence and computes entry-lock/advisory state from validated server-side data.
8. Research evaluation is isolated from live/demo bridge telemetry.

## Data flow

MT5 Nova's EA (read-only)
→ authenticated bridge endpoint
→ validated UTC OHLC/history + heartbeat
→ canonical market-data store
→ features / SMC detectors
→ strategy signals (SMC, Wave3, technical)
→ model ensemble (XGBoost baseline; LSTM experimental)
→ Meta Decision Layer
→ Risk Governor (advisory / entry lock)
→ dashboard and research logs

## Supported market contract

- Instrument: XAUUSD only; broker aliases normalized at ingestion.
- Timeframes: M1, M5, M15, M30, H1.
- M1 is the canonical base series; higher timeframes must be derived or reconciled with provenance.
- Use closed candles for signal generation unless a separate provisional-bar contract is explicitly introduced.
- All timestamps are timezone-aware UTC.
- Validate duplicates, gaps, OHLC consistency, volume, symbol mapping and source provenance.
- Swing points, BOS/CHoCH, order blocks and FVGs must carry confirmation/availability timestamps to prevent look-ahead.

## Model policy

- XGBoost: first measurable baseline after dataset validation.
- LSTM: experimental candidate; must beat a simple baseline on frozen OOS.
- HMM: optional regime feature, not a trade trigger by itself.
- Vision, PPO/RL and LLM agents: deferred until data and evaluation gates are met.
- LLM output is explanation/research only, never an authoritative risk calculation or execution instruction.
- No model is considered trained merely because a training endpoint or dashboard exists.

## Safety policy

All execution flags remain false:
`ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

No broker order endpoint is part of v1.0 foundation. The EA is read-only. Risk limits are not proof of safety; user-configured daily-loss and open-risk thresholds require later validation against broker equity semantics and account currency.

## Evaluation gates

- Chronological, leakage-resistant train/validation/OOS separation.
- OOS begins no earlier than 2026-07-01 for the current evaluation protocol.
- At least 30 closed OOS trades is a minimum operational gate, not statistical proof.
- Require positive net result after realistic spread, slippage and financing; Profit Factor > 1; performance above a simple baseline; walk-forward robustness; drawdown and uncertainty reporting.
- Freeze strategy and feature definitions before final OOS. No tuning on final OOS.

## Deployment boundaries

- Netlify: existing frontend hosting.
- Cloudflare Workers: edge/API gateway.
- Supabase: persistence/auth, subject to free-tier limits.
- Python engine: local/on-demand initially; no assumption of free 24/7 compute.
- Windows MT5 terminal: hosts Nova's EA. Linux/Codespaces must not depend on the MT5 Python package.

## Non-goals for this foundation

No production deployment, schema migration, secrets, broker connection, order execution, model training, or claim of profitable performance.

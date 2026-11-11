# NOVA MTRADERS Native Hybrid Strategy — Research Specification

## Source attribution and status

The original source baseline available on `main` contained the 30-module registration scaffold and no trading logic inside `OnTick`. This PR adds a new research-only MQL5 closed-bar signal controller to that source. The NOVA Python and MQL5 implementations are newly authored research baselines inspired by the registered names and broad strategy families, not an exact recovery or decompilation of the original EA's proprietary per-module logic. Source-parity tests verify the 30 registered names and defensive defaults. MetaEditor compilation is still required.

## Design

- Every call evaluates 30 deterministic OHLCV modules with a common signed signal/score contract.
- Market regime detection classifies TREND, RANGE, BREAKOUT, HIGH_VOLATILITY, MIXED, or INSUFFICIENT_DATA.
- A visible regime allowlist filters eligible modules. Only non-neutral candidates above a minimum absolute score enter the ensemble.
- Hybrid voting groups candidates into eight strategy families (Trend, Momentum, Breakout, Volatility, Liquidity, Flow/Volume, Session, Reversal). Each family contributes at most one vote: the strongest module represents the family; if modules inside a family disagree, that family is excluded. A minimum of two independent families, a consensus threshold, and no material cross-family opposing-weight conflict are required.
- Optional Wave3, XGBoost, LSTM, and SMC votes can refine an existing strategy consensus; they cannot create one in the absence of strategy votes.
- Validation-derived performance weights are bounded to 0.75–1.25 and must never be fit on final OOS.

## Approximation disclosures

FootprintLite estimates close-location volume from OHLCV; it is not true bid/ask footprint. NeuralPilot is a fixed linear proxy, not a trained neural network. PsarDot and several named family modules are explicitly baseline approximations. UTC time windows are not DST-aware exchange calendars. Scores are normalized heuristics, not calibrated probabilities.

## Dataset and safety gates

Hybrid output requires a server-attached quality receipt containing PASS status, dataset ID, quality report ID, and dataset SHA-256. The authenticated gateway must resolve that receipt against its dataset registry; user/LLM-supplied values must not be trusted. Missing or invalid receipt returns DATA_QUALITY_BLOCKED. At least 55 completed bars are required for regime classification. OHLCV is validated; invalid values and out-of-order timestamps are rejected; no missing bars/prices are fabricated. Input is bounded to 100,000 bars.

The MQL5 EA defaults `InpTradeEnabled=false`, `InpRiskPercent=1.0`, `InpMaxSingleRiskPct=1.0`, `InpMaxOpenRiskPct=9.0`, and `InpDailyLossPct=10.0`; `OnInit` rejects an execution-enabled configuration and `OnTick` intentionally contains no order logic. These are defensive defaults, not evidence of a compiled or Demo-tested EA. The MQL5 `OnTick` runs only when a new completed bar is available, checks that `CopyRates` returned that exact bar, and retries without consuming the bar if history/indicators are not ready. It derives ATR/EMA/range features, evaluates the native baseline module rules, applies a module-strength threshold, and aggregates the strongest score per strategy family (trend, momentum, breakout, volatility, liquidity, flow/volume, session, reversal). A family with internal opposing module signals is discarded rather than counted on both sides. It also blocks the research candidate when current spread exceeds the configured ATR fraction. SL/TP are ATR-derived research levels attached to that candidate; no position sizing or broker order is performed. Four time/session modules are deliberately neutral until an explicit broker-time-to-UTC mapping is implemented. Several MQL5 module rules are simplified native proxies and are not yet parity-equivalent to the richer Python module implementations. The strategy library does not produce position size, SL/TP instructions, or broker orders. Keep ordersEnabled=false, executionEnabled=false, liveTradingEnabled=false. Existing risk policy, Demo-only boundary, MT5 Bridge permissions, and EA execution gates are unchanged. Cost-aware backtests, walk-forward validation, and frozen final OOS are still required before any paper/shadow promotion.


## Python-to-adapter research contract

`workers/quant_engine/mtraders_contract.py` emits schema `nova.mtraders.decision.v1` with deterministic `decision_id`, symbol, timeframe, UTC bar timestamp, direction, ensemble score, regime, family votes, and dataset receipt. It is a research signal envelope only: it contains no order size or broker execution instructions and hard-requires `orders_submitted`, `execution_enabled`, and `live_trading_enabled` to remain false. This is a serialization/validation boundary, not yet a live Python-to-MQL5 transport. The gateway must resolve the receipt against the trusted dataset registry before calling it.

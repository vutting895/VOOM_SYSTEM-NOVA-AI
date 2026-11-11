# NOVA MTRADERS Native Hybrid Strategy — Research Specification

## Source attribution and status

The checked-in `integrations/mt5/MTRADERS_All_In_One_v1.01.mq5` contains a 30-module name/registration scaffold and a deliberately non-executing `OnTick` handler; it does not contain the original per-module signal rules. The NOVA Python implementation is therefore a newly authored research baseline inspired by the registered names and broad strategy families, not an exact source recovery or decompilation. A source-parity test checks all 30 names and the safe EA defaults. MetaEditor compilation is still required.

## Design

- Every call evaluates 30 deterministic OHLCV modules with a common signed signal/score contract.
- Market regime detection classifies TREND, RANGE, BREAKOUT, HIGH_VOLATILITY, MIXED, or INSUFFICIENT_DATA.
- A visible regime allowlist filters eligible modules. Only non-neutral candidates above a minimum absolute score enter the ensemble.
- Hybrid voting requires at least two independent strategy candidates, a consensus threshold, and no material opposing-weight conflict.
- Optional Wave3, XGBoost, LSTM, and SMC votes can refine an existing strategy consensus; they cannot create one in the absence of strategy votes.
- Validation-derived performance weights are bounded to 0.75–1.25 and must never be fit on final OOS.

## Approximation disclosures

FootprintLite estimates close-location volume from OHLCV; it is not true bid/ask footprint. NeuralPilot is a fixed linear proxy, not a trained neural network. PsarDot and several named family modules are explicitly baseline approximations. UTC time windows are not DST-aware exchange calendars. Scores are normalized heuristics, not calibrated probabilities.

## Dataset and safety gates

Hybrid output requires a server-attached quality receipt containing PASS status, dataset ID, quality report ID, and dataset SHA-256. The authenticated gateway must resolve that receipt against its dataset registry; user/LLM-supplied values must not be trusted. Missing or invalid receipt returns DATA_QUALITY_BLOCKED. At least 55 completed bars are required for regime classification. OHLCV is validated; invalid values and out-of-order timestamps are rejected; no missing bars/prices are fabricated. Input is bounded to 100,000 bars.

The MQL5 scaffold defaults `InpTradeEnabled=false`, `InpRiskPercent=1.0`, `InpMaxSingleRiskPct=1.0`, `InpMaxOpenRiskPct=9.0`, and `InpDailyLossPct=10.0`; `OnInit` rejects an execution-enabled configuration and `OnTick` intentionally contains no order logic. These are defensive defaults, not evidence of a compiled or Demo-tested EA. The MQL5 `OnTick` now runs a closed-bar, native signal-only controller: it reads up to 120 completed bars, derives ATR/EMA/range features, evaluates baseline module rules, and forms one equal-weight meta candidate only when the minimum vote count, consensus, and opposing-vote gates pass. SL/TP are ATR-derived research levels attached to that candidate; no position sizing or broker order is performed. Four time/session modules are deliberately neutral until an explicit broker-time-to-UTC mapping is implemented. Several MQL5 module rules are simplified native proxies and are not yet parity-equivalent to the richer Python module implementations. The strategy library does not produce position size, SL/TP instructions, or broker orders. Keep ordersEnabled=false, executionEnabled=false, liveTradingEnabled=false. Existing risk policy, Demo-only boundary, MT5 Bridge permissions, and EA execution gates are unchanged. Cost-aware backtests, walk-forward validation, and frozen final OOS are still required before any paper/shadow promotion.

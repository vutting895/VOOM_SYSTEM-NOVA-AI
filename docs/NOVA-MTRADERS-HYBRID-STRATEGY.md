# NOVA MTRADERS Native Hybrid Strategy — Research Specification

## Source attribution and status

The checked-in MTRADERS EA source currently contains a 30-module name/registration scaffold and a non-executing OnTick handler; it does not expose the original per-module signal rules. This implementation is therefore a new NOVA research baseline inspired by the 30 names and broad strategy families, not an exact source recovery or decompilation.

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

The strategy library does not produce position size, SL/TP instructions, or broker orders. Keep ordersEnabled=false, executionEnabled=false, liveTradingEnabled=false. Existing risk policy, Demo-only boundary, MT5 Bridge permissions, and EA execution gates are unchanged. Cost-aware backtests, walk-forward validation, and frozen final OOS are still required before any paper/shadow promotion.

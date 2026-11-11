# NOVA Quant Engine V2 — Meta Decision Architecture

Status: research-only implementation proposal on an isolated feature branch  
Baseline main: `3105ad79990fa6596d1e210e7a645b0b0e12e5fa`  
Branch: `feat/nova-quant-meta-decision-v2-20261112`

## Decision topology

Market data and immutable dataset-quality receipt  
→ point-in-time feature pipeline  
→ LSTM / Deep Learning / XGBoost / Vision model plugins  
→ calibrated OOS evidence and aligned OOF prediction histories  
→ redundancy clustering and conflict analysis  
→ Premium / Discount context gate  
→ Meta Decision Layer  
→ research candidate or explicit abstention

The four models are evidence producers, not decision authorities. No model may independently create a trade instruction.

## Meta Decision controls

- Accept only the four named model families and a strict direction/score contract.
- Require server-attached calibration evidence marked PASS, walk-forward OOS method, at least 30 observations, dataset SHA-256 and evaluator version.
- Require aligned out-of-fold prediction histories for every model that voted.
- Cluster models with absolute prediction correlation at or above 0.90. A correlated cluster is capped at the weight of one model; duplicate models therefore cannot manufacture consensus.
- Require at least two independent directional clusters.
- Reject material opposing evidence when conflict ratio exceeds 0.25.
- Require consensus strength at least 0.60.
- Reject long consensus in Premium and short consensus in Discount. Equilibrium permits either direction, subject to the remaining gates.
- Missing or malformed evidence fails closed. A NO_TRADE/abstain result is valid.

Thresholds are initial research defaults, not empirically optimized parameters. They must be assessed on training/validation folds only and frozen before final OOS evaluation.

## Premium / Discount

The calculation accepts an explicitly supplied, confirmed swing low/high, range ID, timeframe and as-of timestamp. It requires an explicit confirmation timestamp no later than the decision timestamp and at least two right-side confirmation bars. It does not discover swings or assume a pivot is known before those bars have elapsed. Price below the equilibrium ratio is Discount; above is Premium; equal is Equilibrium. Values outside the range are flagged rather than silently clamped.

## Model implementation status

This PR introduces the decision contract and Premium/Discount context calculator. It does not claim that LSTM, Deep Learning, XGBoost or Vision models have been trained, calibrated or validated on production market data. Model adapters must supply the required trusted OOS evidence before they can participate.

Vision outputs must be generated only from chart/image information available at the decision timestamp. Image construction, candle labels, annotations and chart rendering must not leak future bars or revised historical data.

## Safety and release boundaries

- Research-only; no broker-write API or order submission.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- Exness MT5 remains Demo and read-only.
- Existing risk policy and MT5 EA safety gates are unchanged.
- No merge, deployment, secret changes, database mutation or model training in this change.
- This branch is separate from PR #302 and does not alter its Wave3/SMC research implementation.

## Validation plan

Run Python compile and unittest checks on the exact PR head. Then validate integration with trusted dataset quality receipts, owner-scoped run metadata, model plugin adapters, cost-aware walk-forward backtests, baseline comparisons and frozen final OOS. No promotion is allowed from unit tests alone.

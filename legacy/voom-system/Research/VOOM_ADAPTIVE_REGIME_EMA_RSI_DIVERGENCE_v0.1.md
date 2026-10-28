# VOOM Adaptive Regime + EMA/RSI Divergence — Strategy Design v0.1

Date: 2026-10-24
Status: RESEARCH ONLY — not approved for demo/live execution.

## Goal
Reduce low-quality M15 crossover trades with higher-timeframe trend alignment, confirmed structure, and a completed-candle trigger. The existing EMA20/50 + RSI-divergence backtest remains the baseline, not an approved solution.

## Timeframes and signal rules
- H4 regime: long only when close is above EMA200 and EMA200 is flat/rising; short only when below EMA200 and flat/falling.
- H1 structure: long requires confirmed higher-high/higher-low structure; short requires lower-high/lower-low structure. Avoid entry directly into nearby opposing supply/demand.
- M15 trigger: EMA20/EMA50 crossover on a completed candle, RSI14 divergence confirmed by right-side pivot bars, and directional price-action confirmation. Enter no earlier than next bar.
- Long divergence: price makes a lower swing low while RSI makes a higher swing low. Short divergence: price makes a higher swing high while RSI makes a lower swing high.
- Spread, data freshness, price validity, and broker contract checks must pass. No look-ahead or use of unconfirmed pivots.
- Require a weighted signal score >=80/100. Otherwise skip.

## Weighted score
- H4 regime alignment: 25
- H1 structure alignment: 20
- M15 EMA cross and close confirmation: 20
- Confirmed RSI divergence: 20
- Price action / liquidity-sweep confirmation: 15
Do not count any condition twice. Score never bypasses risk guards.

## Exit and risk hypotheses
- Stop beyond confirmed swing invalidation, with at least 1.5 x ATR14 distance; reject if position size is invalid.
- Primary target >=2R, and only enter if nearby structure leaves sufficient room.
- Test fixed 2R separately against an optional partial-exit variant: close 30–50% at +1R, move stop to entry only after the partial is confirmed, then trail the remainder by confirmed M15 swing or 2 x ATR.
- Initial research risk: 0.25% equity per trade; never raise risk after losses.
- One position per symbol, max two concurrent positions, 3-bar cooldown after exit.
- Research guards: stop opening new trades at 2% realized daily loss or 7% peak-to-trough drawdown. Keep stricter broker/account limits if lower.
- Reject excessive spread, missing/stale data, invalid prices, and unverified contract specs.

## Learning loop
1. Hash/freeze each dataset and preserve external XAUUSD versus broker-native XAUUSDc source labels.
2. Log only features available at signal time: H4 regime/slope, H1 structure, EMA distances/cross, RSI/divergence age, ATR, spread, session, candle features, stop distance, and outcome.
3. Define labels before training, such as whether +2R occurs before -1R within a fixed horizon. Include realistic spread, commission, swap, and slippage.
4. Use chronological rolling walk-forward. Tune only on development folds, select on validation folds, and keep the final out-of-sample segment untouched.
5. Compare against EMA20/50 + RSI divergence baseline and no-trade benchmark. Report expectancy in R, PF, drawdown, trades, cost sensitivity, and breakdown by year/session/regime.
6. Any ML probability filter is experimental; it cannot change risk limits, place orders, or override hard guards.
7. Log run ID, parameters, data SHA-256, software version, metrics, and rejected candidates. Never auto-promote from one holdout.

## Promotion gates
Require broker-native XAUUSDc history, verified contract/account-currency math, spread/commission/swap/slippage modeling, MT5 Strategy Tester or tick replay, positive expectancy across multiple walk-forward windows, neighboring-parameter robustness, increased-cost tests, demo forward test, risk review, and explicit human approval. Until then the candidate stays research-only, hidden from customers, and disconnected from MT5 execution.

## Evidence and limitations
- Hybrid history: 117,843 M15 bars, 99.928% calendar-span coverage; the 2021–2022 supplement is external spot XAUUSD aggregated from Dukascopy, not broker-native XAUUSDc.
- EMA20/50 + RSI divergence baseline: 2,086 trades, normalized return proxy -6.83%, PF 0.9707, max drawdown -19.66%; commission/swap omitted and P/L is not account-currency P/L.
- Initial EMA/RSI grid search used close prices and generic 2 bps per side, not verified broker costs. All 25 variants had negative holdout returns; none passed the preliminary demo screen. This comparator is not broker-realistic.
- VOOM LLM engine currently has no SFT dataset, no active model, and no PyTorch/Transformers/PEFT/Datasets runtime installed. Active capability is offline parameter search and research knowledge storage, not neural-network training or automatic live adaptation.

## Safety
No MT5 orders sent. No live-trading flags, EA settings, production order path, or external machine settings changed. Do not deploy this document directly as an EA configuration.

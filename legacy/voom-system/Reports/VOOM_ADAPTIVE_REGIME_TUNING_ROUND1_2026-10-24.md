# VOOM Adaptive Regime — Tuning Round 1

Date: 2026-10-24

## Outcome

Completed a bounded parameter screen over divergence recency windows of 8, 16, 24, 32 and 48 M15 bars. Target was held at 2R, score threshold at 80, and risk proxy at 0.25% to limit the search. Parameters were ranked using development and validation only; the final 20% chronological segment was evaluated after selection.

Selected research candidate:
- Divergence recency: 32 M15 bars
- Target: 2R
- Minimum score: 80
- Stop: at least 1.5 ATR14 beyond invalidation
- Risk proxy: 0.25% per trade

## Results

| Segment | Trades | Net P/L proxy | Return proxy | Profit factor proxy |
|---|---:|---:|---:|---:|
| Development | 41 | +19.965 | +0.1996% | 1.0637 |
| Validation | 10 | +93.545 | +0.9354% | 2.4967 |
| Final out-of-sample | 13 | +114.760 | +1.1476% | 1.9980 |

Final out-of-sample drawdown proxy: -0.6049%.

## Interpretation

This is a candidate, not proof of an edge. The validation and out-of-sample sample sizes are still too small, and the development profit factor is only slightly above 1. Results are normalized price-movement proxies, not real account returns. The dataset mixes 100,019 broker-native XAUUSDc bars with 17,824 external aggregated spot XAUUSD bars; the external portion is not broker-native. Commission, swaps, exact contract/lot conversion, and tick-level execution are not modeled.

## Deployment decision

NOT APPROVED for live trading. The selected parameters are saved for reproducible research only. No MT5 orders were sent, no EA settings were changed, and no customer-facing or live-trading flags were enabled. Next step is broker-native data verification, realistic cost/contract modeling, MT5 tick-based testing, then forward demo testing and human approval.

# MT5 Backtest Research — XAUUSDc M15

- Created (UTC): 2026-10-23T13:53:18.762621+00:00
- Status: RESEARCH ONLY — not approved; hidden from customers
- Data: 2023-10-23 20:00:00+00:00 to 2026-10-23 13:45:00+00:00 (70678 bars; 1095.74 days)
- Account currency: USC
- Dataset: XAUUSDc_M15_20231023_20261023.csv
- Dataset SHA-256: 263b03dd53fe56fe6527b8d176cf12de4d020212cc35d3252c0163e45e8dd976
- Split: chronological 60% development / 20% validation / 20% out-of-sample; fixed Source 1-inspired parameters, no test-set tuning

## Segment metrics

| Segment | Trades | Return % | Max drawdown % | Win rate % | Profit factor |
|---|---:|---:|---:|---:|---:|
| development | 23 | -5.7184 | -7.4335 | 17.391 | 0.3716 |
| validation | 24 | -6.6139 | -7.2888 | 25.0 | 0.1995 |
| out_of_sample | 64 | 0.6906 | -4.8131 | 42.188 | 1.0433 |

## Research controls

- No orders were sent and no production settings were changed.
- This note is an evidence record for MCP retrieval, not an approved trading strategy.
- The backtest uses bar-level spread and a slippage assumption; it is not tick-level execution replay.
- DL score was fixed at zero because a validated historical DL ensemble is not available.

## Caveats

- OHLC spread uses bar-level spread, not historical tick bid/ask sequence.
- If SL and TP are both touched within one candle, SL is assumed first (conservative).
- DL score is fixed at zero; this is not a test of the unvalidated deep-learning ensemble.
- Source 1 OB/FVG checks are simplified bar-based rules, not institutional order-flow truth.
- Commission defaults to zero unless explicitly configured; swap and market impact are not modeled.
- Validate broker tick value/currency, commission, lot rules and results against MT5 Strategy Tester before any strategy promotion.
- No live orders, no model deployment, and no production parameters changed.

## Required before promotion

- Verify broker account currency, tick-value interpretation, commission and swap.
- Compare with MT5 Strategy Tester and/or tick-level replay.
- Review risk limits and out-of-sample robustness; do not optimize on the out-of-sample segment.
- Human approval and demo validation are required before any strategy promotion.

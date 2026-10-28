# VOOM_SYSTEM Backtest Run — 2026-10-24

## Scope and execution
- Project root: `C:\Users\Administrator\Documents\Voom_system`
- Strategy test: Source 1-inspired Mean Rejection + simplified OB/FVG + volatility/session filters.
- Symbol/timeframe: `XAUUSDc`, M15; account currency reported by MT5 metadata: USC.
- Input: `Backtest\data\XAUUSDc_M15_20231023_20261023.csv` and matching metadata.
- Period: 2023-10-23 20:00 UTC through 2026-10-23 13:45 UTC; 70,678 bars; 1,095.74 coverage days.
- Backtest run completed successfully; `orders_sent=false`; backtester did not connect to MT5.
- Research assumptions: 0.5% risk per trade, 2 points adverse slippage per fill, historical bar spread, commission set to zero, no swap/tick replay.
- Time split: 60% development / 20% validation / 20% out-of-sample; parameters were not tuned on the test segment.

## Results (normalized initial equity 10,000 account-currency units)
| Segment | Trades | Final equity | Net P/L | Return | Max drawdown | Win rate | Profit factor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Development | 23 | 9,428.16 | -571.84 | -5.7184% | -7.4335% | 17.391% | 0.3716 |
| Validation | 24 | 9,338.61 | -661.39 | -6.6139% | -7.2888% | 25.000% | 0.1995 |
| Out-of-sample | 64 | 10,069.06 | +69.06 | +0.6906% | -4.8131% | 42.188% | 1.0433 |

Total trade rows in the report: 111. Out-of-sample profit factor is only marginally above 1 and approximate Sharpe is 0.0996; this is weak evidence, not a robust profitability claim.

## Checks
- `py -3 -m py_compile Backtest\mt5_strategy_backtest.py`: passed.
- Backtest execution: passed, exit code 0.
- `test_safety_regression.py`: passed; HOLD behavior confirmed for daily-loss limit and unavailable P/L history.
- `test_mt5_research.py`: 5/5 passed, including read-only/no-order checks.
- Root Node API tests from prior step: 11/11 passed; `npm run check` passed.

## Fix made
The argparse help text contained unescaped percent signs, causing a ValueError before the backtest could start. Escaped the percent signs in the help string only. Backup preserved at `Backups\Backtest\mt5_strategy_backtest.py.bak_argparse_20261024.py`.

## Decision
**Do not approve this strategy for live trading based on these results.** Development and validation were negative; out-of-sample return was small, with profit factor 1.0433 and approximate Sharpe 0.0996. In addition, commission was assumed zero, swap is omitted, the simulation is bar-level rather than tick replay, the DL score is fixed at zero, and OB/FVG logic is a simplified proxy. Verify broker tick-value/account-currency conventions and costs, then compare with MT5 Strategy Tester and forward-test in demo/paper mode before reconsideration. No live trading flags or production order paths were changed.

## Output files
- Report JSON: `Backtest\results\run_20261024\XAUUSDc_M15_20231023_20261023_report.json`
- Simulated trades CSV: `Backtest\results\run_20261024\XAUUSDc_M15_20231023_20261023_trades.csv`
- This summary: `Reports\BACKTEST_RUN_2026-10-24.md`

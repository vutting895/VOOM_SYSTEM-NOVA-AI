# VOOM MT5 Historical Research & Backtest

This folder is isolated from the live Python Bridge and EA. All scripts here are read-only and do not submit orders.

## Run a 3-year MT5 import + automatic research backtest

Open PowerShell on the same Windows machine where the broker MT5 terminal and Python package are installed:

    Set-Location 'C:\Users\Administrator\Documents\Voom_system\Backtest'
    .\run_3year_research.ps1

Choose another symbol/timeframe:

    .\run_3year_research.ps1 -Symbol XAUUSDc -Timeframe M15 -Years 3 -InitialCash 10000 -RiskPct 0.005 -SlippagePoints 2

The script imports 3 years of broker-terminal bars, validates date coverage, then runs the backtest. Supported timeframes include M1/M5/M15/M30/H1/H4/D1 and other standard MT5 periods. Use the exact symbol name shown by the broker. If history is unavailable or date coverage is below 95%, import fails closed unless --allow-short-history is explicitly used with the Python importer.

## Files

- import_mt5_history.py: read-only MetaTrader5.copy_rates_range importer. Exports OHLC, tick volume, real volume, per-bar spread, and broker symbol sizing/tick-value metadata. Requests are chunked into 90-day windows to avoid terminal range limits.
- mt5_strategy_backtest.py: offline research simulation of Source 1's Mean Rejection + simplified OB/FVG/volatility/session conditions. Signals use a completed bar and fill at the next bar open.
- run_3year_research.ps1: one-command import + backtest + research-summary publish.
- publish_backtest_to_learning.py: writes a source-hashed, research-only JSON/Markdown summary into Research/aiเทรด/backtests for MCP knowledge retrieval. It does not approve candidates or train model weights.
- data/: imported CSV and .meta.json; contains market history and broker symbol metadata, not account credentials.
- results/: JSON report and simulated trade CSV.

## Method and safety

- Chronological split: 60% development, 20% validation, 20% untouched out-of-sample. Parameters are fixed; this run does not optimize on the test period.
- Uses each bar's historical spread; zero/non-positive spread rows use the dataset's median positive spread as a conservative fallback and are counted in the report.
- Applies a research Risk Guard: block new entries after 3% realized daily loss or 7% peak drawdown. Existing positions continue to their modeled SL/TP.
- Risk per trade is capped at 1%; default is 0.5%. Slippage is an explicit adverse assumption. Commission can be supplied using --commission-per-lot-side.
- SL is assumed first when both SL and TP occur inside one bar. TP1 closes half the position and the remaining size targets TP2 or SL.
- P/L is expressed in the account currency reported by MT5 (for example, USC on a cent account). --cash 10000 means 10,000 account-currency units, not necessarily USD 10,000.
- This is bar-level simulation, not tick replay. Swap, exact bid/ask paths, market impact and all broker execution rules are not reproduced. Verify tick values/commission and compare with MT5 Strategy Tester before relying on results.
- The Source 1 DL ensemble is not validated for historical inference; its score is set to zero. The OB/FVG logic is a simplified bar-based port, not a faithful tick/order-book reconstruction. Do not use these results to auto-approve a customer strategy.
- The backtester itself does not connect to MT5. The importer only reads price history and symbol metadata; no order APIs are called.
- Do not change or connect this research tool to the production order path, Live Trading flags, EA settings, or dashboard order sender.

## Existing benchmark

ema_rsi_atr_backtest.py is a separate illustrative EMA/RSI baseline and is not the production strategy. Do not mix its metrics with the Source 1-inspired run.

# EMA Crossover + RSI Divergence Backtest — 2026-10-24

## Execution status
- Strategy backtest completed successfully in research-only mode.
- No live orders sent; the offline backtester does not initialize or connect to MT5.
- Code: `Backtest\ema_crossover_rsi_divergence_backtest.py`
- Historical source: read-only MT5 export `Backtest\data\XAUUSDc_M15_20211023_20261023.csv`
- Results folder: `Backtest\results\ema_rsi_divergence_20261024`

## Critical data coverage limitation
Requested date window: 2021-10-23 to 2026-10-23 (1,826.25 days).
Actual data returned by the configured MT5 terminal: 2022-07-26 13:30 UTC to 2026-10-23 20:15 UTC (1,550.281 days, 84.889% coverage, 100,019 bars).
**This is not a full five-year backtest.** The importer correctly failed its default 95% coverage gate. A partial-history export was explicitly saved with `--allow-short-history` for exploratory analysis, and the backtest was run with a relaxed 80% minimum while preserving this limitation in the JSON report. No claim of five-year validation is made.
The missing period is 2021-10-23 through 2022-07-26. No older matching XAUUSD/GOLD historical file was found inside the project folder. Obtaining complete coverage may require loading more history / raising the MT5 terminal's historical-bar limit or using another licensed source. Those external terminal settings were not changed because work was constrained to the project folder.

## Strategy rules
- Long entry: EMA20 crosses above EMA50 on a completed candle; simulated fill at next bar open.
- Short entry: EMA20 crosses below EMA50 on a completed candle; simulated fill at next bar open.
- Long take-profit/exit signal: confirmed bearish RSI14 divergence (price swing high higher, RSI swing high lower).
- Short take-profit/exit signal: confirmed bullish RSI14 divergence (price swing low lower, RSI swing low higher).
- Swing points use 3 left / 3 right bars and are only recognized after confirmation to avoid look-ahead.
- Protective stop: 2 x ATR14; no fixed ATR take-profit. Opposite EMA crossover also closes a position.
- Risk fraction: 0.25% per trade; simulated adverse slippage 2 points each fill; bar spread used as a cost proxy.

## Exploratory results on available 4.25-year history
- Bars: 100,019
- Simulated trades: 1,795
- Normalized starting equity: 10,000 research units
- Ending equity: 10,132.0482 research units
- Net P/L proxy: +132.0482 (+1.3205%)
- Win rate: 31.811%
- Profit factor: 1.0064
- Max drawdown (trade-equity series): -19.4339%

Chronological segments by entry time:
| Segment | Trades | Net P/L proxy | Return vs 10,000 initial units | Profit factor |
|---|---:|---:|---:|---:|
| Development (first 60%) | 1,130 | -806.9443 | -8.0694% | 0.9421 |
| Validation (next 20%) | 362 | +303.3905 | +3.0339% | 1.0798 |
| Out-of-sample (last 20%) | 303 | +635.6019 | +6.3560% | 1.2236 |

These are exploratory results, not a deployable performance claim. Profit factor is only marginally above 1 overall and the maximum drawdown is material.

## Important limitations
- Position sizing and P/L use abstract whole gold units; they are not MT5 lot sizing and are not reliable broker-account currency valuation. Broker metadata is recorded for reference, but no verified lot-value conversion is applied.
- Commission and swap are not modeled; historical spread is bar-level, not tick-by-tick bid/ask.
- Stop execution uses an OHLC approximation and cannot reproduce the exact intrabar tick path.
- RSI divergence exits are delayed until right-side pivot confirmation; opposite EMA crossover may exit before a divergence TP.
- No parameter optimization was performed on the out-of-sample segment.
- Do not enable live trading based on these results.

## Files
- Report JSON: `Backtest\results\ema_rsi_divergence_20261024\ema_crossover_rsi_divergence_report.json`
- Trade ledger CSV: `Backtest\results\ema_rsi_divergence_20261024\ema_crossover_rsi_divergence_trades.csv`
- Source: `Backtest\ema_crossover_rsi_divergence_backtest.py`

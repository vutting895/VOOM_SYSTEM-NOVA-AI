# EMA Crossover + RSI Divergence Backtest — Hybrid History
Date: 2026-10-24

## Data preparation
- Requested window: 2021-10-23 to 2026-10-23 UTC.
- Prepared dataset: `Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.csv`
- Metadata: `Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.meta.json`
- Missing section added: 17,824 M15 bars, 2021-10-24 22:00 UTC to 2022-07-26 13:15 UTC.
- Broker-native MT5 section: 100,019 bars, 2022-07-26 13:30 UTC to 2026-10-23 20:15 UTC.
- Combined: 117,843 bars; date-span coverage 99.928%.
- Validation: 0 duplicate timestamps; 0 missing values in required columns; 0 invalid OHLC rows; 0 non-positive prices; 0 negative spreads.
- The first bar is Sunday market open because 2021-10-23 was a Saturday (market closed).

## Critical source limitation
The supplementary section comes from EV Trading Labs' historical catalogue, which describes its data as aggregated from Dukascopy bid/ask; it is **spot XAUUSD, not the user's broker's XAUUSDc feed**. The combined CSV includes a `source` column so the changeover is auditable. The supplementary spread is estimated from ask-open minus bid-open and is not the MT5 broker's spread. Therefore this is a near-five-year **mixed-source research test**, not five full years of broker-native XAUUSDc data.

Sources:
- Catalogue: https://evtradelabs.com/data
- 2021: https://evtradelabs.com/api/simulator/data/XAUUSD/M15/2021.json.gz
- 2022: https://evtradelabs.com/api/simulator/data/XAUUSD/M15/2022.json.gz

## Strategy and backtest
- Entry: EMA20/EMA50 crossover on a completed M15 bar, entered at next bar open.
- RSI: RSI(14), confirmed price/RSI divergence using 3 bars left and right; only acts after pivot confirmation.
- Exit: long closes on bearish RSI divergence; short closes on bullish RSI divergence.
- Protection: ATR(14) × 2 stop; opposite EMA crossover closes the position.
- Risk proxy: 0.25%; 2 points slippage per fill.
- No MT5 orders sent. No MT5 settings or live-trading flags changed.

## Results (normalized research units, not account-currency P/L)
- Trades: 2,086
- Net P/L proxy: -682.7207 (-6.8272%)
- Win rate: 31.352%
- Profit factor: 0.9707
- Max drawdown: -19.6637%
- Chronological development period PF: 0.8876; validation PF: 1.1324; out-of-sample PF: 1.1972.

## Interpretation
The overall profit factor is below 1 and the normalized net result is negative. The strategy should **not** be treated as ready for live trading. Out-of-sample segment gains do not offset the weak development period and do not establish future profitability. This simulator uses abstract whole-gold units rather than verified broker lot sizing/account-currency valuation, and commission and swap are omitted. The hybrid-source transition further limits the conclusions.

## Output files
- Full merged CSV: `Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.csv`
- Gap-only supplement: `Backtest/data/XAUUSD_M15_external_gap_20211023_20220726.csv`
- Metadata/source audit: `Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.meta.json`
- Trade list: `Backtest/results/ema_rsi_divergence_hybrid_20261024/ema_crossover_rsi_divergence_trades.csv`
- Machine-readable result: `Backtest/results/ema_rsi_divergence_hybrid_20261024/ema_crossover_rsi_divergence_report.json`
- Rebuild script: `Backtest/prepare_missing_history.py`

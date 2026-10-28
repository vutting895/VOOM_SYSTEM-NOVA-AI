# VOOM EMA Trend Candidate

- ID: ema-test-01
- Version: 0.1.0
- Status: research
- Family: EMA trend crossover with RSI confirmation

## Parameters

- ema_fast: 10
- ema_slow: 40
- rsi_period: 14
- long_rsi_min: 52
- short_rsi_max: 48
- hold_bars_max: 12

## Rules

1. Use only closed candles; no look-ahead.
2. Long candidate: fast EMA crosses above slow EMA and RSI >= long_rsi_min.
3. Short candidate: fast EMA crosses below slow EMA and RSI <= short_rsi_max.
4. Close/reverse on opposite signal; enforce hold_bars_max.
5. All values are research parameters, not production instructions.

## Safety

Research only. This package cannot place trades, change MT5 settings, or enable live trading. Promotion requires reproducible cost-aware backtest, untouched out-of-sample validation, demo forward test, risk review, and explicit human approval.

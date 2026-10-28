# VOOM Progressive Daily USD v5.0 — Signal-Only Build
Date: 2026-10-24

## Completed
- Added `EA/VoomProgressiveDailyUSD_v5_SignalOnly.mq5` as a separate research-only file. Existing EA files were not overwritten.
- Compiled with HFM MetaEditor. Compile log result: **0 errors, 0 warnings**.
- Generated `EA/VoomProgressiveDailyUSD_v5_SignalOnly.ex5` (23,388 bytes).
- Static scan of executable source found no `CTrade`, `OrderSend`, `OrderSendAsync`, `PositionOpen`, `PositionClose`, `.Buy(`, `.Sell(`, or `OrderCheck(` calls.
- No orders were sent. The new EA was not attached to a chart and was not deployed/enabled on a trading account.

## Signal-only behavior
- Uses completed chart candle and last completed higher-timeframe EMA value for the trend filter.
- Detects prior-bar liquidity sweep and 3-candle FVG.
- Requires at least the configured number of OnTick events inside the configured millisecond window.
- Prints and displays a BUY/SELL signal only; it does not calculate/send broker orders or manage positions.
- HTF EMA handle is created once in OnInit and released in OnDeinit.
- The daily target, daily loss, fixed lot, SL/TP and slippage inputs are retained as reference-only settings; they do not control trades in this signal-only build.

## Known limitations before Strategy Tester evaluation
1. The source supplied by the user labels the combined zone detector as Order Block + FVG, but only FVG is implemented. This signal-only adaptation intentionally does not claim to detect a true Order Block.
2. Tick velocity currently measures terminal OnTick event frequency, not directional price velocity or unique quote changes.
3. Signals are not yet verified against an independent Python implementation or broker-native tick replay.
4. No historical performance result is claimed here. MT5 tick timestamp checks previously failed freshness validation, so real-time forward evaluation is not certified.
5. No account-currency/cent scaling assumptions have been applied to any real account; all daily risk inputs are informational only.
6. This is a first compile/static-safety checkpoint, not approval for demo/live execution.

## Safety
- No trading execution API calls are present in the signal-only source.
- No MT5 account, EA input, terminal, Cloudflare, or dashboard settings were changed.
- No orders sent; not enabled for live trading.

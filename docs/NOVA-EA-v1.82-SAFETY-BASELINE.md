# NOVA EA v1.82 — safety baseline and Core Strategy port

## Identity and safety boundary

Canonical EA file: `integrations/mt5/NOVA_EA_v1.82.mq5`.

- Compile-time `NOVA_READ_ONLY_MODE=true`.
- `OnTick()` may evaluate closed-bar market data and print a research candidate only.
- No order submission, position modification, close, pending-order mutation, or broker execution API exists in the Core Strategy include.
- Initialization rejects legacy presets that set `InpTradeEnabled=true`.
- Live Trading remains OFF.

## Core Strategy slice added

The strategy implementation is a clean-room, signal-only translation of selected concepts reviewed in the local v1.83 SAFE READONLY EA:

1. M15 closed-bar evaluation; no forming-candle entry signals.
2. H1 and H4 EMA direction alignment, plus M15 EMA/RSI confirmation.
3. ATR SuperTrend direction filter.
4. Volatility-regime guard using M15 ATR(14)/ATR(50), accepted range 0.55–1.80.
5. A 20-bar close-confirmed BOS setup with a 12-bar expiry.
6. Approximate opposing-candle order-block candidate, three-candle FVG candidate, and 50-bar equilibrium retracement location.
7. Bullish/bearish wick rejection confirmation.
8. Research SL reference and 1:2.5 RR target reference, logged only.

## Explicit model and methodology limitations

- The H1 EMA alignment is a directional proxy, **not** the v1.83 SATMAFlow model and not a trained ML inference path.
- The OB/FVG zones are first-pass structural approximations. They are not a full institutional order-block qualification, displacement validation, or FVG mitigation state machine.
- The BOS detector is a fixed 20-bar breakout rule; it does not distinguish structural CHoCH from BOS.
- The SuperTrend implementation and the other filters have not been calibrated against a fresh, independent out-of-sample dataset.
- Candidate SL/TP values are reference levels only. Risk sizing, order reservation, spread/slippage checks, and execution are deliberately absent.
- The 30 registered module names remain labels; this patch implements only the Core Strategy signal slice.

## Guarded risk defaults retained as policy metadata

- Nominal risk: 1%.
- Single-trade cap: 1%.
- Aggregate open-risk policy target: 9%.
- Daily loss policy: 10%.
- Maximum account exposure target: 5 positions plus pending orders.
- Bounded minimum-lot override: disabled.

These are not enforced for order placement because this build has no order execution path. The exposure snapshot helper is informational and is not an atomic reservation.

## Validation status

Python source-contract tests cover the read-only boundary, MTF/volatility gates, closed-bar evaluation, and absence of execution API calls.

Still required before treating the strategy as validated:
- Native MetaEditor compile on the target MT5 terminal.
- Strategy Tester runs with real symbol specification, commission, swap, spread, and slippage.
- Walk-forward and untouched OOS evaluation; do not tune on final OOS.
- Verify candidate timestamps and levels against MT5 chart data.
- Exness Demo read-only observation only.

No profitability claim is made. Do not merge, deploy, or enable Live Trading on the basis of source-level tests.

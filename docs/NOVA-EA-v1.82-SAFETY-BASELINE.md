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

Confirmed for PR head `7dc2c72c34a69dcc6006b79eae09281b709fbbc9`:

- Python source-contract tests: **10/10 passed** on the exact branch files in the isolated Windows validation workspace.
- Native MetaEditor compile: **0 errors, 0 warnings** using `C:\\MT5\\metaeditor64.exe`; the exact EA and Core include were compiled in a temporary validation directory, not installed as an active chart EA.
- GitHub Actions Frontend CI run `45132475626` (#2272): **success**; all 20 build steps passed. Netlify production smoke-test job was skipped and is not part of this validation.

### Isolated MT5 Strategy Tester smoke run

- Exact compiled PR EA copied to the separate `C:\\MT5_TEST` installation and a dedicated `NOVA_TEST_ONLY` Experts folder; the primary `C:\\MT5` terminal and active chart were not modified.
- Symbol/timeframe: `XAUUSDm / M15`; model: Every tick based on real ticks; period: `2026-10-01` through `2026-11-20`.
- Report: `NOVA_EA_v1.82_CORE_READONLY_SMOKE_20261001_20261120.html`; SHA-256: `B30967FB7C954776C8338AA57FC6466BE331579FCB78151707C492546A91B8EB`.
- Compiled EX5 SHA-256: `CD7576FE1D14FDD3A2E0B28B90A0CCA817D3BCAEF5DA0F0FA1DD62E69FCDA85C`.
- Tester log: **successfully finished**; 3,308 M15 bars and 10,579,136 ticks; report states **100% real tick**.
- Final balance remained USD 10,000; total trades: **0**; net profit: **0.00**. This is expected for a signal-only READ-ONLY EA and is not a profitability result.
- No `NOVA CORE CANDIDATE` journal entries were found for this interval. The EA initialized and deinitialized cleanly, but no complete signal passed all gates in this smoke window. This is a negative signal-coverage observation, not proof of a strategy edge or a code failure.
- The isolated demo terminal log reported global Algo Trading enabled for its demo account, although the tester run had zero positions/orders and the test terminal shut down after completion. This does **not** establish terminal-wide Algo Trading OFF. Keep this installation isolated; do not attach the EA to a live chart. The primary terminal's global Algo Trading state remains a separate operational gate.

Still required before treating the strategy as empirically validated:

- Expand signal-coverage testing across additional market regimes and verify candidate timestamps/reference levels against MT5 chart data.
- Investigate why no candidates passed the gates in the smoke interval before loosening any filter; do not optimize against the same test interval.
- Complete walk-forward and untouched OOS evaluation; do not tune on final OOS.
- Exness Demo read-only observation only, after terminal-wide Algo Trading OFF is independently verified.

No profitability claim is made. Source-contract tests, native compilation, CI, and a zero-trade smoke run do not establish trading edge. Do not merge, deploy, install as an active chart EA, or enable Live Trading on the basis of these checks alone.

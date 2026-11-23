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

### Diagnostic findings and follow-up code change

The opt-in gate counters were run on the original 50-bar swing-stop build over the same smoke interval:

- Bars/data-ready: 3,308 / 3,308.
- Volatility guard: 52 rejected; 3,256 passed.
- BOS setups: 373; active setup bars: 2,135; expired setups: 97.
- MTF alignment passed: 538; location passed: 319; wick rejection passed: 47.
- Risk gate: 28 rejected; 0 passed; candidates: 0.

This isolates the stop-distance/risk gate as the final bottleneck in that build. The 50-bar swing extreme was removed; the current branch anchors the reference stop to the signal candle wick (low/high plus/minus 0.20 ATR) and retains the existing 3 ATR maximum-risk gate. This is a structural implementation change, not a parameter relaxation.

The current rejection-wick stop revision was compiled from code head `8494191e9c545becff0d0c68e25a326dbbe75f73` in the isolated `C:\\MT5_TEST` MetaEditor environment: **0 errors, 0 warnings** (826 ms). The resulting EX5 SHA-256 is `B979A349F77B48759853C14457B6E46B6ED8569FBA9277D02F17B4C052CE2936`.

A fresh isolated Strategy Tester coverage run used that exact EX5:

- Symbol/timeframe: `XAUUSDm / M15`; period: `2026-07-17` through `2026-11-20`; Every tick based on real ticks.
- Report: `NOVA_EA_v1.82_CORE_REAL_TICK_COVERAGE_20260717_20261120.html`; SHA-256: `B9BC01333C0F18544FB2792F48311CF9F8FCC6ADE8207A140B41814FC8E36DAC`.
- **100% real tick**, 8,266 bars, 26,757,176 ticks; tester passed with no error/failed/invalid log entries.
- Gate diagnostics: 8,266 data-ready bars; volatility 182 rejected / 8,084 passed; 934 BOS setups; 1,235 MTF alignments; 737 location passes; 125 wick rejections; 1 risk-gate rejection; 76 risk-gate passes; **76 signal candidates**.
- Final balance USD 10,000; net profit USD 0.00; total trades 0, as expected for the READ-ONLY signal-only EA. Candidate count is signal coverage only, not executed-trade performance or evidence of positive expectancy.
- Candidate-log distribution: **55 SELL / 21 BUY**, across 40 distinct calendar days; no consecutive candidates were less than 45 minutes apart. Reference stop-distance distribution (XAU price units): min 2.781, median 7.383, p90 11.423, max 19.733. The sell skew requires chart/regime review and is not itself evidence of bias or edge.

Python source-contract tests: **12/12 PASS** on code head `8494191e9c545becff0d0c68e25a326dbbe75f73`. GitHub Actions Frontend CI run #2283 (`45135123464`) succeeded with all 20 build steps; Netlify production smoke test was skipped. The latest documentation-only commit triggers CI run #2284 (`45135688932`), which was still running when this document was updated.

Still required before treating the strategy as empirically validated:

- Independently inspect the 76 candidate timestamps and reference levels against the corresponding MT5 chart bars; reject duplicate/clustered or structurally invalid candidates.
- Measure hypothetical SL/TP first-touch outcomes with spread, commission, slippage, and a defined maximum holding period; the zero-trade report does not contain those outcomes.
- Complete walk-forward and untouched OOS evaluation; do not tune on the final OOS period.
- Exness Demo read-only chart observation only, after terminal-wide Algo Trading OFF is independently verified.

No profitability claim is made. Source-contract tests, native compilation, CI, and a zero-trade smoke run do not establish trading edge. Do not merge, deploy, install as an active chart EA, or enable Live Trading on the basis of these checks alone.

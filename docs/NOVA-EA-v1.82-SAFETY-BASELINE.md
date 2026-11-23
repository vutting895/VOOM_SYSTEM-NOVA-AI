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

### Tick-level hypothetical first-touch audit

A separate read-only research harness was run against the same Exness real-tick tester data. The reproducibility inputs and outputs are committed alongside this document:

- Candidate input: `tests/mt5/NOVA_CORE_CANDIDATES.csv` (76 candidate timestamps and reference levels; SHA-256 `3A796BE3864DCD8414B70C1A677EDF46F5D8652D324B1C8385D5D8B8B1A82AAB`).
- Audit harness: `tests/mt5/NOVA_TICK_AUDIT_v1.82.mq5`; native MetaEditor compile **0 errors, 0 warnings**. Source SHA-256 `C497E7D3073F42AE2F8B348E30CBB4C9FC7D649F5DE0FCA6AB69EE0E90B9DA22`; compiled EX5 SHA-256 `C0DB058E6D997A906B5BB9853820B23C9C9D8167423EE4AC3E30BFD5C3647BFD`.
- Per-candidate result: `docs/research/NOVA-EA-v1.82-TICK-FIRST-TOUCH-AUDIT.csv`; SHA-256 `CC53C7F19D9BE943204CF866EBC03500AB50572432DBA77E5A79D1977D3EC4E3`.
- For each candidate, the first tick after the closed M15 signal bar was used as the hypothetical market entry (BUY at Ask, SELL at Bid). Subsequent real Bid/Ask ticks were scanned for 24 hours; BUY exits were checked on Bid and SELL exits on Ask. Thus spread is embedded in tick prices. Commission and additional execution slippage are **not** included.
- All 76 candidates matched their signal-bar timestamp; all 76 had forward tick data; no gap-before-entry or missing-tick cases.
- Outcomes: **24 TP, 50 SL, 2 timeouts**. Both timeouts closed positive. Gross profit **+61.235R**, gross loss **-50.000R**, net **+11.235R**, gross PF **1.225**, mean **+0.148R/trade**. This is a hypothetical single-trade-per-signal simulation, not broker execution or realized account P/L.
- BUY: 21 candidates, 6 TP / 14 SL / 1 timeout, net **+1.623R**, PF **1.116**. SELL: 55 candidates, 18 TP / 36 SL / 1 timeout, net **+9.612R**, PF **1.267**.
- Maximum observed overlap: **4 simultaneous hypothetical positions**; maximum peak-to-trough drawdown **8.523R**; longest consecutive loss sequence **7**; median exit time **31.59 minutes**, maximum **1,292.13 minutes** (about 21.5 hours).
- The time split is the critical finding: before the stop-diagnostic window (2026-07-17 through 2026-09-30), **48 trades produced only +0.308R, PF 1.009**. In the 2026-10-01 through 2026-11-20 diagnostic window used to investigate and change the stop-distance model, **28 trades produced +10.927R, PF 1.683**. That window contributed approximately **97.3%** of the total +11.235R. This concentration is a material overfitting/selection-bias warning; the full-period PF must not be treated as evidence of an independent edge.
- The tester completed successfully using 100% real tick data (8,266 bars / 26,757,176 ticks). The audit harness itself contains no order submission or position-management calls.


Python source-contract tests: **12/12 PASS** on code head `8494191e9c545becff0d0c68e25a326dbbe75f73`. GitHub Actions Frontend CI runs #2283 (`45135123464`) and #2284 (`45135688932`) both succeeded with all 20 build steps; Netlify production smoke test was skipped in both runs. The tick-audit harness was compiled and executed locally in the isolated MT5 test installation; it is a research harness, not part of the production EA runtime.

Still required before treating the strategy as empirically validated:

- Re-run the frozen strategy on a genuinely untouched OOS interval that was not used for stop-model selection or any parameter decisions. The July–September segment is near-flat and is not yet certified as untouched.
- Add broker commission and a defensible slippage model; current tick audit embeds Bid/Ask spread but excludes commission and additional slippage.
- Increase sample size and test stability across volatility/session regimes. The 76-signal sample is small and the result is highly concentrated in the diagnostic window.
- Independently verify terminal-wide Algo Trading OFF before any Exness Demo read-only chart observation.
- Keep PR #366 and this dependent PR Draft until both are reviewed and the base relationship is resolved.

No profitability claim is made. Source-contract tests, native compilation, CI, and a zero-trade smoke run do not establish trading edge. Do not merge, deploy, install as an active chart EA, or enable Live Trading on the basis of these checks alone.

# NOVA EA v1.82 — Prospective Forward OOS Protocol

Status: PRE-REGISTERED / NOT YET EXECUTED  
Protocol date: 2026-11-23  
Strategy scope: signal-only NOVA EA v1.82 Core Strategy  
Execution: READ-ONLY; no broker orders or position management

## 1. Frozen strategy identity

The strategy under test is frozen to the implementation reviewed in this PR:

- EA: `integrations/mt5/NOVA_EA_v1.82.mq5`
- Core include: `integrations/mt5/NOVA_CoreStrategy_v1.82.mqh`
- Strategy code commit: `8494191e9c545becff0d0c68e25a326dbbe75f73`
- EA file blob SHA: `7f3ab6e167507c563ac7dd93f6547274ab2cefc3`
- Core include blob SHA: `f4f3dd3c3c7d08143ab38374ed40e9c9481b98c1`
- Symbol/timeframe under the historical audit: XAUUSDm / M15
- Entry reference: first available tick after the closed M15 signal bar; BUY at Ask, SELL at Bid
- Exit reference: BUY at Bid, SELL at Ask; fixed reference SL/TP from the signal; maximum 96 tradable M15 bars

No strategy, indicator, threshold, stop, target, filtering, or signal-selection changes are allowed during this forward test. A code or parameter change invalidates the current test; any revised version must start a new OOS period and receive a new protocol.

## 2. OOS boundary

- Historical research data ends: 2026-11-20 (inclusive).
- Prospective forward OOS begins: 2026-11-23 00:00 UTC.
- Only market observations timestamped at or after the OOS start may contribute to this test.
- Do not backfill missing OOS observations using data previously used in strategy development.
- The July–September 2026 segment is not certified as untouched and must not be relabeled as independent OOS.

## 3. Collection and execution constraints

- Run signal generation in an isolated MT5 test environment or a separately controlled READ-ONLY observation setup.
- Keep `NOVA_READ_ONLY_MODE=true`; keep `InpTradeEnabled=false`.
- No order send, modify, close, pending-order, or broker execution calls.
- Do not attach to the primary terminal until terminal-wide Algo Trading OFF is independently verified.
- Capture each candidate's UTC timestamp, symbol, direction, closed-bar time, entry/SL/TP references, Bid/Ask at entry, spread, source/build identity, and complete forward tick path.
- Capture broker commission from the exact account specification. Do not invent a commission rate.
- Slippage beyond observed Bid/Ask is unknown until measured or explicitly bounded from broker evidence; report it separately and show sensitivity rather than silently assuming zero.
- Record missing ticks, market closures, data gaps, invalid quotes, and truncated paths. Do not silently drop affected candidates.

## 4. Pre-registered evaluation gates

The test is not evaluable until all of the following are available:

1. At least 100 fully resolved hypothetical signal outcomes.
2. At least 90 calendar days of prospective observations.
3. Results segmented by BUY/SELL, London/New York/other sessions, and volatility regime.
4. Net results after observed Bid/Ask spread and the verified broker commission schedule.
5. Slippage sensitivity at 0, 0.25, and 0.50 times the observed median spread per side, clearly labeled as scenarios rather than measured execution.
6. Profit factor, expectancy in R, maximum drawdown in R, consecutive losses, exposure overlap, and outcome counts.
7. A reproducible raw candidate log, tick-audit output, data coverage report, and file hashes.

A positive result is not sufficient by itself. Require net expectancy above zero after costs, PF greater than 1.0 after costs, and no material collapse in either direction or across the principal sessions/regimes. Report confidence intervals and the full distribution; do not rely on aggregate PF alone. If the sample or coverage gates are not met, status remains INSUFFICIENT DATA.

## 5. Prohibited actions during the test

- No parameter tuning, threshold changes, stop/target changes, or selective signal exclusion.
- No changing the OOS start date after observing results.
- No cherry-picking sessions, directions, dates, or market regimes.
- No merging this PR, deploying, or enabling trading based on forward-test results alone.
- No claim of profitability or production readiness before independent review.

## 6. Current baseline and known contamination

The prior 96-tradable-bar retrospective audit produced 76 hypothetical candidates, 24 TP / 52 SL, net +7.119R and gross PF 1.137 before commission and additional slippage. However, 28 candidates from the 2026-10-01 through 2026-11-20 stop-diagnostic window contributed +6.811R (about 95.7% of total net R). The earlier 48-trade segment produced only +0.308R / PF 1.009. This is material selection-bias/overfitting risk; these retrospective figures are not independent OOS evidence.

## 7. Status

- Protocol: documented; not yet executed.
- Frozen implementation: identified by commit and file blob IDs above.
- Forward OOS observations: none evidenced in this document.
- Broker commission schedule: BLOCKED pending exact account specification.
- Additional slippage: UNKNOWN; sensitivity scenarios required.
- Terminal-wide Algo Trading OFF: BLOCKED pending direct UI verification.
- Trading edge / production readiness: NOT ESTABLISHED.

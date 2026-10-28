# VOOM Progressive Daily USD v5.0 — Strategy Adoption Audit
Date: 2026-10-24
Scope: project-only review; no MT5 settings changed; no orders sent.

## Decision
The user-provided v5.0 strategy is the requested strategy specification for the next research iteration. It is NOT installed on a live chart, compiled/deployed, or enabled for execution. Existing VoomSystemEA.mq5 is a separate analysis-only bridge and must remain unchanged until the new strategy passes review.

## Five-core logic as actually implemented
1. H1 EMA200: compares current-chart close (shift 0, still-forming bar) against H1 EMA200 shift 0 (also still-forming); not a completed-bar-only trend test.
2. Liquidity sweep: uses previous chart candle (shift 1) and prior lookback from shift 2; reasonable basic sweep check, but lacks separate confirmation of reclaim/tick timing.
3. FVG: checks the 3-candle gap on bars 3 and 1. Despite function name/comment, no Order Block candle/zone is detected or required.
4. OB/FVG confluence: only FVG is tested. Thus the advertised five-core engine is not actually five independently verified confirmations.
5. Tick velocity: counts OnTick calls using GetTickCount. It appends one timestamp per event and does not deduplicate quotes or price changes; it can signal high event rate, not necessarily directional tick velocity. It retains at most 500 entries after cleanup. The rolling count logic assumes timestamps are stored in chronological order, which normally holds but should be guarded.

## Critical correctness and risk issues
- Cent scaling is not safe to infer from InpAccountType. The account's actual deposit currency and broker conventions must be checked. A USC account often expresses balance/equity in cents, but broker-specific contract/tick-value semantics must be verified; multiplying targets by 100 may be right for account-currency cents yet still wrong if account data is already normalized.
- g_current_day_step is memory-only and resets to 1 after EA/terminal restart. It can also advance on target achievement and then advance again on a later day, so the step progression does not clearly mean consecutive profitable days. Define intended progression explicitly and persist it safely if desired.
- Daily P/L uses equity minus the equity sampled at EA initialization/day rollover. Restarting the EA mid-day resets the baseline and can bypass the daily loss/target circuit breaker. Floating P/L affects the threshold, but realized daily P/L history is not separately reconciled.
- At a new day, g_target_reached resets but positions are not reconciled first; a position opened before midnight can continue into the next day.
- CloseAllPositions only closes matching symbol and magic. If the daily guard is intended to protect the whole account, it does not. If intended to protect this EA only, document that.
- CloseAllPositions ignores close return codes. A failed close can leave exposure while the EA marks the day locked.
- CTrade Buy/Sell returning true alone does not prove a deal was filled. Must check ResultRetcode/description, resulting deal/order and position state.
- ORDER_FILLING_IOC is hard-coded; some symbols/accounts may require a different supported filling mode.
- SL/TP are calculated from _Point but input comments mix pips and points. For a 2-digit XAUUSD symbol, 150 points equals 1.50 price units; for 3/5-digit FX symbols, pip meaning differs. Normalize prices and validate SYMBOL_TRADE_STOPS_LEVEL / freeze level and volume min/max/step.
- No broker-specific risk-based lot sizing: fixed 0.01 lots means actual risk varies by symbol, stop distance, tick value, and account currency.
- Target threshold uses current equity, and CloseAllPositions may realize slippage/fees after the threshold; final realized outcome can exceed target/loss limit.
- CheckMTFTrend creates an iMA handle on every call and never releases it. It also returns early on CopyBuffer failure without releasing handle; create persistent handles in OnInit and release in OnDeinit.
- OnInit does not validate account type/currency, symbol trading permissions, market availability, volume validity, stop distances, or enough historical bars.
- ArrayResize appends one timestamp on every tick without preallocation; cleanup occurs only after total_ticks > 500. Not a major memory leak but can be made more efficient.
- Signal is evaluated on every tick while sweep/FVG data is based on completed bars. Duplicate entries are guarded by CountOpenPositions, but after an execution rejection it can repeatedly attempt the same signal every tick. Add a per-bar signal latch and bounded retry policy.
- The code's FVG condition is a minimal gap test, not a complete ICT Order Block/FVG model.

## Required validation sequence before activation
1. Confirm broker account currency and whether balance/equity are shown as USC/cents or USD; confirm symbol contract/tick-value semantics.
2. Convert the strategy to a paper/signal-only variant first; never use the provided order-sending version for initial tests.
3. Fix daily guard persistence/restart handling, target progression semantics, close-result handling, filling mode, lot validation and stop-level validation.
4. Add a true Order Block detector if that core is required; document tick velocity as event-rate unless directional velocity is explicitly defined.
5. Test closed-bar signals, no lookahead, spread/slippage, commission, swap, broker-native XAUUSDc data, and tick-level behavior in MT5 Strategy Tester.
6. Run chronological walk-forward and untouched out-of-sample tests; report trade count, PF, expectancy, max DD, consecutive losses and daily guard behavior.
7. Demo forward test and verify telemetry/monitoring before separate human approval.
8. No real orders until the above checks pass and the user gives a separate explicit activation approval.

## Current project state
- Existing EA/VoomSystemEA.mq5 remains paper-only, analysis-only, and unchanged.
- Existing hybrid research data contains 100,019 broker-native XAUUSDc bars plus 17,824 external XAUUSD bars; external bars are not broker-native XAUUSDc.
- MT5 tick timestamp checks recently failed freshness validation: three read-only samples had the same tick timestamp and it was about 2h 5m ahead of the host UTC clock. Do not treat that quote as verified real-time.
- No orders sent; no EA inputs, terminal settings, Windows clock, Cloudflare or dashboard configuration changed.

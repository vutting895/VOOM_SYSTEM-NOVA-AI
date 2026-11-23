# NOVA EA v1.82 → Core Strategy Parity and EA Bridge

## Source of truth

The source for this migration is the user's local MT5 file:

`MQL5/Experts/nova v.1.82/Nova_EA_v1.82.mq5`

The source reports `#property version "1.82"` and contains a 20-module registry (14 kept modules and 6 disabled/removed modules). Its inspected local copy is 522,707 bytes / 8,025 source lines, SHA-256 `F6B0EFD2D00F9DE7644BB4403CC47A2088800E3AB3C015E2EC93A6341C431D8A`. This migration does not import the v1.83 SAFE_READONLY file as a substitute.

The original EA is not safe to execute as-is: it contains broker execution paths including `OrderSend`, `CTrade`, position close/modify operations, and live-operation inputs. The Core port extracts signal logic only. Those execution paths are deliberately excluded.

## What is in Core now

The first source-grounded Python parity slice implements eight active signal modules:

| EA module ID | Strategy | Port status |
|---:|---|---|
| 13 | SMC Full — confirmed swing BOS, OB/FVG retrace, Premium/Discount and wick confirmation | Implemented as stateful research signal |
| 4 | LiquidityPools — confirmed pivot clusters, sweep/reclaim, ATR stop and 1:2 reference target | Implemented with 10-bar cooldown and consumed-pool state key |
| 9 | SessionBox — London / New York completed-session range breakout | Implemented; requires explicit broker server UTC offset and bar duration |
| 1 | TrendPilot — EMA50/EMA200 trend plus RSI 45/55 crossing | Implemented; requires at least 210 completed bars |
| 6 | WyckoffPhase — range, spring/upthrust, displacement and LPS state machine | Implemented as stateful research signal |
| 2 | VolRegime-QEX — ATR percentile / Bollinger-width squeeze and range breakout | Implemented with state and 15-bar entry cooldown |
| 10 | FlowMatrix — normalized bounded-delta share and EMA50/EMA200 alignment | Implemented; requires the multi-symbol bar universe |
| 8 | SessionHeat — 30-day server-hour H1 statistics and H1 breakout | Implemented as intrabar research candidate; requires H1 history, server time, current bid and ask (buy references use Ask, sell references use Bid) |

All other IDs abstain with an explicit status. They do not receive synthetic direction/confidence scores.

The source has 20 module IDs. Its v1.22 audit marks six modules disabled/removed: SuperTrend (0), QEX-VolST (3), QEX-LiqSweep (5), RangeSniper (7), WickReject (12), and Trend_Trail (16). The 14 kept modules are IDs 1, 2, 4, 6, 8, 9, 10, 11, 13, 14, 15, 17, 18, and 19. The remaining kept registry entries are SATMAFlow (11), ZigZag_BreakPull (14), Martingale_Avg (15), Intraday_VolBreak (17), Trend_Adding (18), and GOLD_Breakout (19). These are marked DORMANT_NOT_DISPATCHED because no active call path was found in the inspected v1.82 MainWork/dispatch flow; they are not silently reactivated. The SATMA function exists, but its MainWork call is commented out.

This is not full 20-module parity. The previous deterministic placeholder in `mtraders_strategies.py` has been removed; unsupported strategies now abstain rather than fabricate votes. Stateful setup/cooldown persistence is returned explicitly for the caller to persist after accepted entries. Exact broker-server session/DST behavior, multi-symbol universe ordering, and intrabar tick-vs-bar parity still need comparison tests against MT5 before these candidates are used in a production backtest.

## Core integration rules

- Input bars are strictly chronological, timezone-aware, validated OHLC, and completed candles only.
- Swing pivots are not visible until their right-side confirmation bars have closed.
- Stateful strategies return their state explicitly for persistence by the caller.
- Strategy output is a research candidate, never an execution instruction.\n- The evaluator is exported from `workers.quant_engine` and replaces the former MTRADERS compatibility stub. It is not yet wired into the live NOVA API route or Meta Decision Layer arbitration; that is a separate integration gate.
- Meta Decision Layer and Shared Risk Governor remain separate; ML outputs cannot authorize execution.
- The existing point-in-time backtest helpers remain separate and must be integrated into any backtest that consumes these candidates.
- Commission, slippage, spread, broker contract/tick-value conversion and untouched OOS validation remain mandatory before performance claims.

## EA-to-Core bridge

The new MQL5 include `integrations/mt5/NOVA_EA_Bridge_v1.82.mqh` provides a narrow two-second heartbeat sender for a future read-only build of the original v1.82 EA:

`POST http://127.0.0.1:8787/api/ea/heartbeat`

The local endpoint:
- accepts loopback traffic only;
- requires a separate random local token;
- validates a fixed schema;
- rejects any payload that does not explicitly set `orders_enabled=false` and `live_trading_enabled=false`;
- does not accept account credentials, orders, positions, or execution requests.

Cloud access is read-only: authenticated `GET /api/ea/status` flows through Supabase Auth → MT5 proxy → tenant-scoped Cloudflare relay → local bridge. Heartbeat status is online only for six seconds after the last accepted heartbeat. The heartbeat is held in memory by the local bridge; it is not yet durable database history.

Deployment caveat observed on 2026-11-23: the currently deployed Cloudflare relay returns HTTP 404 for GET /api/ea/status; this PR adds the route in source, but the production Worker/proxy update remains pending review and deployment. Local Bridge status is available; customer-facing cloud EA status is not yet verified.

A source-grounded READ-ONLY entrypoint is now included at integrations/mt5/Nova_EA_v1.82_READONLY.mq5. It is derived from the exact local v1.82 source SHA F6B0EFD2D00F9DE7644BB4403CC47A2088800E3AB3C015E2EC93A6341C431D8A, includes the bridge, and wires NovaEABridgeInit, NovaEABridgeHeartbeat(0), and NovaEABridgeDeinit into the EA lifecycle. Every native broker write call site was compiled out; the CTrade include/object was removed; the Live UI is hard-locked OFF and the dashboard labels the build READ-ONLY. Native MetaEditor 5 compile: 0 errors, 3 warnings. The original source remains untouched.

## Installation / verification gate

1. Keep the original live-capable v1.82 EA detached; use only Nova_EA_v1.82_READONLY.mq5.
2. Confirm its source safety scan has no broker write APIs and compile it with native MetaEditor 5.
3. Run tools/windows/provision-nova-ea-bridge-token.ps1 once on the intended Windows MT5 host.
4. Start the tenant-authenticated Python Bridge with tools/windows/run-bridge-from-git.ps1 after review/deployment.
5. Add http://127.0.0.1:8787 to MT5 Tools → Options → Expert Advisors → Allow WebRequest for listed URL.
6. Attach only the compiled READ-ONLY EA to the intended Exness Demo chart; keep Algo Trading disabled.
7. Verify local heartbeat HTTP 200 and authenticated GET /api/ea/status reports online; then verify bad token, non-loopback POST, stale heartbeat and tenant mismatch fail closed.
8. Deploy the updated Cloudflare relay/proxy Worker only after PR review; current production relay returns 404 for /api/ea/status, while the branch source includes that route.
9. Run read-only MT5 Strategy Tester validation.

The READ-ONLY source and compiled EX5 are installed in the local MT5 Experts/NOVA_READONLY folder but are not attached to a chart. No production deployment, chart attachment, merge, or live trading activation is implied. Algo Trading must remain disabled and Live Trading OFF.

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

This is not full 20-module parity. The former deterministic placeholder in `mtraders_strategies.py` is now a compatibility facade over the source-grounded v1.82 evaluator; unsupported and dormant modules abstain rather than fabricate votes. Each result carries source/version, strategy family, symbol, timeframe and timestamp provenance. Stateful setup/cooldown persistence is returned explicitly for the caller to persist after accepted entries. Exact broker-server session/DST behavior, multi-symbol universe ordering, and intrabar tick-vs-bar parity still need comparison tests against MT5 before these candidates are used in a production backtest.

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

Deployment/verification status on 2026-11-23: the Windows local Bridge returns authenticated health 200 and the outbound tenant-authenticated WSS connection to the Cloudflare relay is established. The EA is loaded on XAUUSDm M15, but its heartbeat is still blocked by MT5 WebRequest error 4014 until `http://127.0.0.1:8787` is added manually to the MT5 WebRequest allowlist. Consequently the local `/api/ea/status` remains disconnected; customer-facing Supabase-authenticated proxy status is not yet verified.

A source-grounded READ-ONLY entrypoint is included at `integrations/mt5/Nova_EA_v1.82_READONLY.mq5`. It is derived from the exact local v1.82 source SHA `F6B0EFD2D00F9DE7644BB4403CC47A2088800E3AB3C015E2EC93A6341C431D8A`, includes the Bridge and wires init/heartbeat/deinit into the EA lifecycle. Heartbeats run from OnTick and OnTimer; idle periods retain the last actual tick timestamp. Broker write call sites are compiled out, the CTrade include/object is removed, MagicBase and Sniper magic are isolated, and the EA hard-locks `g_V162_Live=false` plus `manual_pause=1` on every Tick/Timer. The READ-ONLY build also disables EA-side model inference, local training, ONNX export, auto-learning, auto-tune and optimization; NOVA Core is authoritative for those functions. The stale 30-module status label is corrected to 20 registered / 14 kept / 8 active dispatch. Native MetaEditor 5 compile: 0 errors, 3 warnings. The original source remains untouched.

## Installation / verification gate

1. Keep the original live-capable v1.82 EA detached; use only `Nova_EA_v1.82_READONLY_PR.ex5` built from the reviewed source.
2. Confirm the source safety scan has no broker write APIs and compile it with native MetaEditor 5.
3. Run `tools/windows/provision-nova-ea-bridge-token.ps1` once on the intended Windows MT5 host.
4. Start the tenant-authenticated Python Bridge; confirm local health 200 and authenticated outbound WSS connection.
5. Add `http://127.0.0.1:8787` to MT5 Tools → Options → Expert Advisors → Allow WebRequest for listed URL. This is the current manual blocker; error 4014 means no heartbeat has been accepted yet.
6. Keep the global Algo Trading control disabled. The current terminal reports `terminal_trade_allowed=false`; the EA source is also hard-locked READ-ONLY.
7. Verify local heartbeat HTTP 200 and authenticated GET `/api/ea/status` reports online; then verify bad token, non-loopback POST, stale heartbeat and tenant mismatch fail closed.
8. Deploy the reviewed Cloudflare relay/proxy Worker only after PR review; verify the customer Supabase-authenticated proxy path before marking a connection connected.
9. Run read-only MT5 Strategy Tester parity validation.

Current Windows-host evidence: `Nova_EA_v1.82_READONLY_PR` is attached to `XAUUSDm,M15`; MetaEditor 5 compile passed with 0 errors / 3 warnings; local Bridge health is 200; authenticated outbound WSS relay is established; `terminal_trade_allowed=false`; EA heartbeat remains BLOCKED by WebRequest error 4014 pending the user allowlist step. No production deployment or merge has occurred. Live Trading remains OFF.

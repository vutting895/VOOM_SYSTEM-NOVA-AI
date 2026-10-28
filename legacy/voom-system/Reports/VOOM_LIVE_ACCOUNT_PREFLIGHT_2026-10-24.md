# VOOM Live-account preflight audit — 2026-10-24

## Requested operating mode
- Account intent: real broker account
- Desired mode: signal-only; no order execution
- Requested risk reference: 0.25% per trade
- Scope: project folder only
- Audit outcome: **BLOCKED for live account activation; signal-only validation can continue**

## Checks completed
- Local analysis API `http://127.0.0.1:8000/health`: HTTP 200; reports version `6.2-safe`, `paper_only=true`, `live_trading_enabled=false`, `order_execution=disabled`.
- `EA/VoomSystemEA.mq5` and `EA/VoomSource1Bridge.mq5`: source explicitly says analysis/paper-only; both have `InpPaperOnly=true` guard and static scan found no OrderSend/OrderCheck/PositionOpen/PositionClose/Buy/Sell/CTrade call matches.
- EA compile logs: both report 0 errors and 0 warnings.
- Targeted research tests: 5/5 passed when run from the Backtest directory.
- Selected candidate config is still `RESEARCH_ONLY_NOT_APPROVED_FOR_LIVE`; data SHA-256 matches the current hybrid CSV: `d4705d36d9128268c3785e825623cc1e2750b846d114a6f43e4f39a2d73bd7fb`.
- Hybrid research dataset: 117,843 bars, mixed broker-native and external spot data. Not 5 years of broker-native XAUUSDc history.
- Candidate results remain small-sample proxies: development 41 trades, validation 10, frozen OOS 13; OOS PF proxy 1.998 and return proxy +1.1476%. Not account returns.

## Blockers / unverified
1. A read-only probe of local bridge port 8081 was refused; that bridge endpoint is not currently listening.
2. Existing project status snapshot (generated 2026-10-24 03:30:57 +07:00) says terminal process was running, but Cloudflare connected=false, telemetry in KV=false, end-to-end telemetry unverified, and EA inputs not confirmed reloaded.
3. Process existence does not prove the MT5 terminal is logged into the intended broker account. Current account login/server/connection was not independently confirmed.
4. Signal-only EA does not calculate broker-valid lot size or place SL/TP orders; it only validates and displays candidate price levels. Backtest `risk_fraction_proxy=0.0025` and `units_proxy` are not verified MT5 lots.
5. Contract size, tick value, volume min/step/max, account-currency conversion, commissions, swaps, actual spread/slippage, and broker-native tick replay remain unverified.
6. The adaptive-regime strategy's 13 OOS trades are too few to establish robust performance. It is a research candidate only.

## Safety decision
- Do not enable live order execution.
- Do not change account/EA settings or send orders as part of this audit.
- Continue only with read-only status checks and signal-only validation until broker/account connectivity, end-to-end telemetry, symbol contract math, and realistic MT5 tests are verified.
- Requires a separate explicit final approval before any future execution mode change.

## Scope note
During the initial broad test discovery, `Backtest/test_safety_regression.py` was inadvertently executed. That test changes its working directory to `C:\\Program Files\\AI_Bridge` and imports a module there, despite the requested project-only scope. Its reported checks passed and it wrote its report under this project, but I cannot guarantee that the import had no external cache side effect. No intentional edits to external files, MT5 settings, or orders were made. Further testing will avoid that script and stay within this project.

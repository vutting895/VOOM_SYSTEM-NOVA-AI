# VOOM Research Roadmap — Evidence to Implementation
Updated: 2026-10-23
Status: Research and verification only. No production trading settings changed.

## Existing project facts reviewed
- Root contains EA, Python bridge, Worker, config template, logs, and isolated Backtest folder.
- Root README describes Worker as secondary AI veto only; it must not originate or alter direction, lot size, SL, or TP.
- Current backtest report covers GOLD M15 from 2026-07-20 through 2026-10-20 (6,062 bars); chronological 80/20 split.
- Illustrative EMA20/EMA50 + RSI14 + ATR14 baseline holdout metrics: return -2.42%, max drawdown -2.46%, 87 trades, win rate 44.83%, profit factor 0.68, Sharpe -7.68.
- This is not the production RandomForest/SMC strategy and omits variable historical spread, commission, swap, tick-level fill ordering, broker lot rules and production daily guard. It cannot judge production strategy performance.
- Existing safety regression report records daily-loss blocking and fail-closed behavior for unavailable deal history as passed. A fresh test run has not been confirmed in this task.

## Priority 0 — preserve safety
1. Keep demo/paper mode as default; do not enable live trading from research results.
2. Never copy real credentials into docs. Use secret storage and redacted logs.
3. Treat AI as advisory/veto. EA-side deterministic guards must validate every order.
4. Never auto-edit live strategy parameters from research findings.

## Priority 1 — verify the real trading path
- Review current EA, Python bridge, Worker routes, configuration and recent logs.
- Verify one canonical JSON/signal contract: schema version, request ID, timestamp, symbol allowlist, quote freshness, direction, confidence, SL/TP, expiry and reason codes.
- Confirm idempotency and duplicate-order protection.
- Confirm broker-aware sizing from tick value/size, contract size, account currency, volume step, min/max volume, stop levels and margin.
- Test daily/weekly loss guard, max aggregate open risk, spread/slippage, stale data, API timeout, invalid response, repeated rejection, reconnect/restart and emergency stop.
- Run compilation and regression tests in the trusted development environment; do not infer success from file presence.

## Priority 2 — research with primary sources
A. Institutional execution: benchmark choice, implementation shortfall, market impact, spread, urgency and fill quality. Source: CFA Institute.
B. Automated trading governance: documented testing, pre/post-trade controls, staged deployment, limits and monitoring. Sources: FCA and ESMA.
C. Retail strategy hypotheses: trend, range, SMC, FVG, liquidity sweep and Elliott labels. Treat as hypotheses until reproducible tests pass.
D. Engineering and web UX: official MQL5, Python, TypeScript/React/Next.js, Cloudflare, Supabase and W3C documentation.

## Priority 3 — experiment protocol
- Freeze strategy version and rules before each run.
- Split development, validation and untouched final holdout chronologically.
- Model realistic bid/ask spread, commission, swap, slippage, latency, stop/limit execution and broker volume rules.
- Compare with a simple baseline and no-trade benchmark.
- Report net return, expectancy in R, profit factor, max equity drawdown, recovery, average win/loss, trade count, exposure, cost share and worst day/week.
- Test multiple market regimes, instruments and parameter neighborhoods; investigate overfitting.
- Promote only after independent review and demo forward testing.

## Acceptance gates
1. Code gate: compile cleanly; static checks and unit/contract tests pass.
2. Safety gate: failure-mode tests fail closed; no order bypasses local risk controls.
3. Research gate: reproducible, cost-aware out-of-sample results with adequate sample and stability.
4. Demo gate: forward test matches intended behavior; orders and logs reconcile with broker.
5. Release gate: reviewed diff, versioned config, rollback plan and explicit operator authorization.

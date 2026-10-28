# Voom_system architecture

## Components
- `dashboard/`: Base44 dashboard and operator-facing status.
- `backend/app.js`: Express API with health, status, and authenticated telemetry-only ingestion.
- `backend/server.js`: standalone Node server.
- `api/index.js`: Vercel serverless entry point.
- `ai/`: future external AI analysis and signal validation; AI analysis is not execution authorization.
- `mt5-ea/`: future verified MT5 Expert Advisor bridge. No EA source is currently verified in this repository.
- `database/`: future reviewed migrations and least-privilege policies.
- `docs/`: setup, threat model, test evidence, and operations.

## Safety invariants
1. Default to `TRADING_MODE=paper` and `LIVE_TRADING_ENABLED=false`.
2. Never store HFM passwords, MT5 investor/master passwords, API keys, or bridge secrets in Git, browser code, dashboard entities, or logs.
3. Current API has no order execution endpoints. Do not add them without a separate design review and explicit test sign-off.
4. AI output is untrusted input. Future signal validation must check symbol, volume, direction, stop-loss, take-profit, freshness, risk limits, and idempotency server-side.
5. Dashboard status is not proof of an MT5 connection. Display timestamps and source for all telemetry.
6. Keep Telegram notifications out of scope; the Base44 dashboard is the operator interface.

## Integration status
The backend scaffold is now present. `POST /api/mt5/telemetry` requires a server-side shared secret, rejects unknown fields and stale timestamps, and accepts only paper-mode telemetry. Current telemetry storage is in-process memory and is not durable. There is no verified HFM/MT5 connection, EA implementation, AI signal execution path, or production database integration yet.

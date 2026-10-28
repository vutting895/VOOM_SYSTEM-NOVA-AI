# Voom_system API contract

## Current scope

This is an initial online-safe backend scaffold. It accepts authenticated **telemetry only**. It has no order placement, order modification, or close-position endpoint. Data is held in process memory for smoke testing; it is not durable and must not be treated as a production data store.

## Endpoints

- `GET /api/health`: service status and explicit paper-only flags.
- `GET /api/dashboard/status`: public, read-only, sanitized payload for the hosted Base44 dashboard. Reports connection freshness and paper-only flags; excludes account balance/equity and credentials.
- `GET /api/mt5/status`: most recently accepted telemetry with only dashboard-safe fields; excludes account balance/equity and credentials.
- `POST /api/mt5/telemetry`: authenticated telemetry ingest. Requires `X-Voom-Bridge-Secret`.

The telemetry JSON body must include `source: "mt5-ea"`, `mode: "paper"`, an ISO timestamp with timezone, `terminalConnected`, and `accountConnected`. Optional fields include symbol, timeframe, bid, ask, balance, and equity. Unknown fields are rejected. Timestamps older than five minutes or more than one minute in the future are rejected.

## Safety

- `LIVE_TRADING_ENABLED=false` is the only supported behavior in this scaffold.
- No endpoint can place a trade.
- The bridge secret must be at least 32 characters and must be configured in the hosting provider's secret manager, never in Git or browser code.
- Set `CORS_ORIGINS` to exact trusted dashboard origins, comma-separated. Do not use `*`.
- Use TLS at the host/proxy.
- Do not send account passwords, investor passwords, API keys, or other credentials as telemetry.

## Limitations

The in-memory status is ephemeral and may differ between serverless instances. Before production telemetry, add durable storage, user authentication/authorization, request replay protection, observability, and an explicit data-retention policy. This service is not yet a verified HFM MT5 connection or EA.

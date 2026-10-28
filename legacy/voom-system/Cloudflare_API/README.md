# Voom_system Cloudflare API

Worker: `voom-system-api`
Base URL: `https://voom-system-api.suwapat787.workers.dev`

## Canonical endpoints
- `GET /api/health`: health and safety flags.
- `GET /api/dashboard/status`: sanitized latest MT5 telemetry.
- `GET /api/mt5/status`: compatibility alias returning the same sanitized status payload.
- `POST /api/mt5/telemetry`: protected ingestion endpoint. Requires the server-side Worker secret `VOOM_BRIDGE_SHARED_SECRET` in `X-Voom-Bridge-Secret`.

## Data flow
`VoomSource1Bridge.mq5` → authenticated local API `http://127.0.0.1:8000/mt5/telemetry` → Cloudflare Worker → KV key `latest_mt5_telemetry` → status endpoint → dashboard.

The local relay reads its secret from `Logs/bridge_secret.tmp`; the value must match the Worker secret, but must never be committed or pasted into chat. Telemetry is paper-only, sanitized, expires from KV after 24 hours, and status is considered connected only while the latest record is fresh and both terminal/account flags are true. No order-execution endpoint exists.

## Current verification
- The deployed `/api/health`, `/api/dashboard/status`, and `/api/mt5/status` endpoints respond.
- Latest live status check: `connected=false`, `telemetry=null`. End-to-end telemetry is therefore **not yet verified**.
- The local EA source and compiled `.ex5` match the central project copies by size and modified timestamp; compilation log reports 0 errors and 0 warnings.
- The hosted Base44 app is separate from `Dashboard/api-config.js`; changing local files does not update the hosted Base44 app.
- Verify Worker secret configuration and safely reload only `VoomSource1Bridge` in MT5. Keep Paper mode; do not enable legacy `VoomSystemEA`.

Cloudflare KV stores only the latest sanitized telemetry for 24 hours. Balance, equity, account IDs, and secrets are not stored or returned.

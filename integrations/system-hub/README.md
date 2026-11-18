# NOVA System Integration Hub

Cloudflare Worker name: `voom-system-hub`

This is the control plane for viewing integration metadata, listing the signed-in user's own connection records, and verifying the read-only Exness MT5 account-read path. It is deliberately separate from provider adapters and does not contain the legacy Alpaca OAuth callback.

## Endpoints

- `GET /health` — public process/readiness status only. It does not prove Supabase, a bridge, or a broker terminal is reachable.
- `GET /v1/integrations` — authenticated registry of known integration adapters and declared capabilities.
- `GET /v1/connections` — authenticated list of connection records visible to the current user through Supabase RLS.
- `POST /v1/connections` — create an idempotent pending Exness Demo request for the authenticated user; the caller cannot choose or assign a tenant route.
- `GET /v1/connections/:connectionId/status` — status of the current user's record; deliberately does not claim live connectivity.
- `POST /v1/connections/:connectionId/check` — verifies a read-only account request through the MT5 proxy. The account response is discarded; only a sanitized status is returned.
- `GET /v1/connections/:connectionId/account` — returns a small, credential-free account summary only after the authenticated Proxy read succeeds.
- `GET /v1/connections/:connectionId/quotes?symbol=XAUUSDm&timeframe=M1&count=3` — reads bounded quotes/candles from the user's connected Demo terminal through the MT5 Proxy.

Protected endpoints validate the Supabase access token with Supabase Auth, then scope database reads to the authenticated user ID and forward the user token to PostgREST so RLS remains in force. A different user's connection is returned as not found. Upstream URLs are fixed/allowlisted; callers cannot choose an arbitrary URL.

## Deployment

`wrangler.jsonc` declares the Worker name and the fixed UI/MT5 adapter URLs. The GitHub Actions Cloudflare deployment workflow passes `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from existing Actions secrets at deploy time. The customer-facing Broker Settings page uses `NEXT_PUBLIC_SYSTEM_HUB_URL` (defaulting to this Worker) and sends the signed-in Supabase access token; it no longer calls the MT5 Proxy directly. Do not put credentials or tokens in source control.

Before the control plane can report an Exness connection as data-verified, the account record must be owned by the user, status must be connected, a tenant bridge route must be allocated, and the real MT5 proxy account-read request must succeed. Until that happens, status remains pending/configured/unavailable rather than reporting a false positive.


## NOVA asynchronous SMC analysis dispatch

The authenticated endpoint `POST /v1/connections/{connectionId}/analyze` starts a research-only SMC + Elliott task from the connected user's Exness MT5 Demo feed.

Example request body:

```json
{
  "symbol": "EURUSD",
  "timeframe": "M5",
  "count": 200
}
```

- Supabase Auth derives the owner; the caller cannot submit a tenant or owner ID.
- The Hub resolves the connection under that owner and requires a connected Demo record with a provisioned Bridge route.
- The Hub fetches `count + 1` MT5 bars and drops the final, still-forming candle before dispatch.
- Closed OHLCV is normalized and checked for chronology, finite positive prices, OHLC consistency and volume validity.
- The Hub sends the normalized snapshot to the fixed internal dispatcher using a separate service token. The Supabase session token is not forwarded.
- The response is HTTP 202 with a Celery task ID. OHLC data and account details are not echoed to the browser.

Required Worker configuration (set outside source control):

- `NOVA_ANALYSIS_DISPATCH_URL`: exact HTTPS URL ending in `/internal/v1/analysis/smc`.
- `NOVA_ANALYSIS_DISPATCH_HOST`: exact hostname of that URL; the Worker rejects host mismatches.
- `NOVA_ANALYSIS_DISPATCH_TOKEN`: high-entropy secret (at least 32 characters), stored as a Worker secret.

The private dispatcher service requires the same value in `NOVA_ANALYSIS_INTERNAL_TOKEN`. It is bound to loopback by Docker Compose and must be exposed to the Hub only through a separately approved authenticated private ingress/tunnel. Do not publish port 8000 directly to the Internet. The endpoint has no browser CORS route and no public task-submission route.

The dispatcher accepts only Exness MT5 Demo market snapshots, UUID owner/connection references, supported symbols/timeframes, 25–500 closed bars, and a strict payload schema. It queues a tenant-scoped research task; bot-bound tasks still require the bot state to be ACTIVE. No broker credential, Supabase bearer token, bridge token or order payload enters Redis/Celery.

Example response:

```json
{
  "connectionId": "22222222-2222-4222-8222-222222222222",
  "taskId": "celery-task-id",
  "status": "QUEUED",
  "symbol": "EURUSD",
  "timeframe": "M5",
  "analyzedBarCount": 200,
  "dataVerified": true,
  "ordersEnabled": false,
  "executionEnabled": false,
  "liveTradingEnabled": false
}
```

A queued response confirms task acceptance only; it does not claim analysis completion. Result retrieval/persistence and a durable job-status API are separate follow-up work.

## Safety

- Read-only only.
- `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- No order-placement endpoint is implemented.
- No broker password, access token, account payload, or bridge token is returned by the Hub.
- The former `voom-alpaca-oauth` implementation is not used by this Hub and its source folder is retired by a separate reviewed repository cleanup. This does not delete/disable a Worker in the Cloudflare account or drop any Supabase table/data; confirm provider-side consumers and retention before decommissioning. Keep applied Alpaca migration files as historical schema records.

## Multi-broker API adapter pilot — Binance public market data

A first isolated adapter prototype is available at `adapters/binance-spot-readonly.js`. It is intentionally not wired into the production Worker routes yet.

Supported public capabilities:
- `getTickerPrice`: fixed `data-api.binance.vision/api/v3/ticker/price`
- `getCandles`: fixed `data-api.binance.vision/api/v3/klines`, bounded to 1–500 candles and an explicit interval allowlist
- `getExchangeInfo`: fixed `data-api.binance.vision/api/v3/exchangeInfo`

Security boundary:
- GET only; fixed HTTPS host; redirects rejected; no API key or Authorization header; 8-second timeout.
- No account, wallet, order, trade, transfer, deposit, withdrawal, or funding methods exist in this adapter.
- Decimal price/volume values are retained as strings. Candle timestamps and OHLC consistency are validated.
- This is a public-data adapter only; it does not prove private account access or customer connection readiness.
- The current pilot is not deployed or registered in the active Worker. Do not report it as live until a separately reviewed integration PR and staging smoke test pass.

Tests: `node --test integrations/system-hub/tests/binance-spot-readonly.test.mjs`

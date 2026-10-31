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

## Safety

- Read-only only.
- `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- No order-placement endpoint is implemented.
- No broker password, access token, account payload, or bridge token is returned by the Hub.
- The former `voom-alpaca-oauth` implementation is not used by this Hub and its source folder is retired by a separate reviewed repository cleanup. This does not delete/disable a Worker in the Cloudflare account or drop any Supabase table/data; confirm provider-side consumers and retention before decommissioning. Keep applied Alpaca migration files as historical schema records.

## Exness Trader API adapter (isolated, not yet activated)

`exness-api.js` contains a server-side, dependency-injected Exness Trader API client for the official Ed25519 signed-GET flow. It currently supports only:
- Signed Gateway discovery: `GET /v1/trading/access-point?account_id=...`
- Signed account snapshot: `GET /v1/configuration/accounts/{account_id}/account` on the discovered Access Point.

The client validates HTTPS Exness hosts, uint64 account IDs, the returned Access Point/account identity, response size, and the Ed25519 key format. It does not accept caller-provided URLs or arbitrary paths. It exposes no trading, order mutation, withdrawal, transfer, or Live Trading capability. The account read is bound to the Access Point discovered for the same account.

This module is intentionally **not wired to public Worker routes or customer records yet**. Customer credential retrieval remains blocked by `docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md`; do not place a customer's private key in a shared Worker secret, generic `service_role` Vault access, frontend variables, GitHub, or chat. The next integration gate is a reviewed per-tenant secret-custody path, followed by owner-bound API account metadata and two-customer isolation tests.

The API client must receive its key material from an approved server-only credential provider at runtime. Its injected dependencies make signing and transport testable with synthetic credentials without contacting Exness or requiring real customer secrets.

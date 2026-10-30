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


## NOVA Sentinel — bounded intrusion detection and response

The System Hub includes the NOVA Sentinel implementation candidate in `sentinel.js`. It correlates repeated authentication failures and rejected Origins by a pseudonymous source-IP actor, and repeated resource probes by the authenticated user actor. It applies only short, actor-scoped HTTP cooldowns; it does not attack external hosts or revoke/delete resources.

Sentinel is disabled by default (`SENTINEL_ENABLED=false`). If explicitly enabled, it requires the `SENTINEL_STATE` Durable Object binding and the out-of-band `SENTINEL_HASH_SECRET` Worker Secret. Do not add that secret to source control, GitHub Actions output, browser variables, chat, or AI/MCP payloads. Missing protection dependencies fail closed for protected routes only when the feature is explicitly enabled.

See `docs/implementation/NOVA-SENTINEL-AUTONOMOUS-DEFENSE.md` for activation gates, event thresholds, privacy, false-positive considerations, and the limits of the first release. This is deterministic event correlation, not self-training ML; policy updates require review and regression tests.

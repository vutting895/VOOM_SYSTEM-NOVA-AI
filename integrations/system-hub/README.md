# NOVA System Integration Hub

Cloudflare Worker name: `voom-system-hub`

This is the control plane for viewing integration metadata, listing the signed-in user's own connection records, and verifying the read-only Exness MT5 account-read path. It is deliberately separate from provider adapters and does not contain the legacy Alpaca OAuth callback.

## Endpoints

- `GET /health` — public process/readiness status only. It does not prove Supabase, a bridge, or a broker terminal is reachable.
- `GET /v1/integrations` — authenticated registry of known integration adapters and declared capabilities.
- `GET /v1/connections` — authenticated list of connection records visible to the current user through Supabase RLS.
- `GET /v1/connections/:connectionId/status` — status of the current user's record; deliberately does not claim live connectivity.
- `POST /v1/connections/:connectionId/check` — verifies a read-only account request through the MT5 proxy. The account response is discarded; only a sanitized status is returned.

Protected endpoints validate the Supabase access token with Supabase Auth, then scope database reads to the authenticated user ID and forward the user token to PostgREST so RLS remains in force. A different user's connection is returned as not found. Upstream URLs are fixed/allowlisted; callers cannot choose an arbitrary URL.

## Deployment

`wrangler.jsonc` declares the Worker name and the fixed UI/MT5 adapter URLs. The GitHub Actions Cloudflare backend deployment workflow passes `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from existing Actions secrets at deploy time. Do not put credentials or tokens in this file or in source control.

Before the control plane can report an Exness connection as data-verified, the account record must be owned by the user, status must be connected, a tenant bridge route must be allocated, and the real MT5 proxy account-read request must succeed. Until that happens, status remains pending/configured/unavailable rather than reporting a false positive.

## Safety

- Read-only only.
- `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- No order-placement endpoint is implemented.
- No broker password, access token, account payload, or bridge token is returned by the Hub.
- The legacy `voom-alpaca-oauth` Worker is not overwritten or deleted by this migration. Disable it only after its production consumers, OAuth configuration, stored data, and rollback needs have been reviewed.

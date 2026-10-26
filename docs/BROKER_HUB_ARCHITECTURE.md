# VOOM_SYSTEM Broker Hub — design and implementation notes

## Scope
- Multi-market provider selection for Forex, Crypto and Stocks.
- Read-only account access and AI research only.
- No order placement endpoint is added. Existing status responses keep `tradingEnabled: false`.
- The UI distinguishes provider catalog selection from verified account connection.

## Provider catalog
- Forex: MetaTrader 5 (secured Windows/VPS bridge required), OANDA API (availability depends on account and region).
- Crypto: Binance, Bybit, OKX, Coinbase Advanced, Kraken, Bitget.
- Stocks: Alpaca, Interactive Brokers, Charles Schwab, SETTrade Open API (availability depends on brokerage approval).
- These are catalog entries, not claims that user accounts are connected or that every adapter is implemented.

## Architecture
1. Vercel Next.js Broker Hub UI.
2. Cloudflare Worker or server-side adapter layer for provider-specific authentication and request signing.
3. Supabase for user ownership, connection metadata and audit events; credentials/tokens must be encrypted and never browser-readable.
4. AI Research consumes normalized, permissioned market/account data; learning jobs store provenance and evaluation metadata.
5. No execution adapter is exposed in this phase.

## Normalized connection record
- `id`, `user_id`, `provider_id`, `market`, `status`, `permission_scopes`, `last_checked_at`, `last_error_code`, `created_at`, `updated_at`.
- Never store raw API secrets in a client-readable table. Prefer provider OAuth where officially supported; otherwise store narrowly scoped API keys encrypted server-side.
- Browser clients must not be allowed to read tokens or secrets via Supabase RLS.

## Implementation sequence
1. Add the catalog UI and safe status-check response.
2. Add authenticated user sessions and tenant isolation before any private-account endpoint.
3. Add one provider adapter at a time, with read-only permission validation, request timeouts, rate limits, redacted logs and credential rotation.
4. Normalize candles, positions, balances and transactions into shared schemas.
5. Connect normalized data to AI Research and Learning Universe, preserving source timestamps and provenance.
6. Add integration tests with mocked provider responses; test unauthorized access and ensure all paths return `tradingEnabled: false`.
7. Deploy only after typecheck/build, endpoint tests, security review and environment-variable audit pass.

## Current limitations / gates
- A public market endpoint response does not prove a customer account is connected.
- MT5 needs a separately installed and secured Windows/VPS bridge; Cloudflare Workers cannot run the MT5 desktop terminal.
- Provider-specific OAuth/app approval and regional availability must be verified.
- Do not expose private-account status routes publicly until authentication, per-user credential storage, rate limiting and audit logging exist.
- No live trading and no automatic order execution.

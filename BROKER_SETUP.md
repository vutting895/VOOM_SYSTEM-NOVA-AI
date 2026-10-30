# Broker connectivity setup (NOVA)

This repository uses the NOVA System Integration Hub as the control plane for private broker-account access. The Next.js endpoint `/api/broker/status` is a compatibility facade for the Broker Hub UI; Exness MT5 account status is delegated to the authenticated System Hub. It does not call the MT5 Proxy directly.

## Exness MT5 Demo

Initial supported customer-account integration:

`Supabase Auth → Next.js broker status API → System Hub → MT5 Read-only Proxy → Tenant Bridge Relay → Windows MT5 Bridge`

- The customer signs in to NOVA; the browser sends the short-lived Supabase access token in the Authorization header.
- The API forwards that bearer session to the fixed HTTPS System Hub endpoint. The Hub validates the session and resolves only connections owned by that user.
- `GET /api/broker/status?broker=mt5` reads the user's own Exness Demo connection. It does not create a connection.
- `POST /api/broker/status?broker=mt5` requests an idempotent pending Exness Demo connection. It does not claim the terminal is connected.
- The API reports `connected` only after `POST /v1/connections/:id/check` has completed a successful authenticated account read through the full tenant-specific Bridge path.
- A pending connection remains pending until an administrator provisions the customer's dedicated MT5 Bridge route.
- No MT5 password or broker credentials are accepted through chat or this status API.

The Windows Bridge, Relay and Proxy stay tenant-scoped and read-only. Do not create a second MT5 gateway or put the MetaTrader5 Python SDK inside a Cloudflare Worker.

## Other exchanges

Public market-clock checks may be available for supported providers. A public market endpoint response is not proof that a customer's private exchange account is connected.

Private Binance, Bybit, OKX, Coinbase, Kraken and Bitget account adapters are not enabled by this status API. Do not configure or submit API keys through this route. A future private-account adapter must use the approved server-side Vault path, a compiled provider allowlist, least-privilege provider scopes, per-customer isolation, redaction and security tests.

## Local development

Configure only public Supabase project settings and the fixed System Hub origin in the frontend environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only)
- `NEXT_PUBLIC_SYSTEM_HUB_URL` (defaults to `https://voom-system-hub.suwapat787.workers.dev`)

Do not put service-role keys, MT5 passwords, exchange API secrets, or tenant bridge tokens in browser-visible environment variables. Dedicated Bridge secrets are provisioned outside the customer-facing app and never returned by the Hub.

## Security and release gate

- Supabase Auth and the System Hub are responsible for session validation and owner-scoped access.
- The Hub/Proxy enforce both connection ID and authenticated user ID; Relay/Bridge enforce tenant-specific credentials.
- Status is based on a real account read, not merely a process or public health endpoint.
- API responses use `Cache-Control: no-store` and keep `tradingEnabled`, `ordersEnabled`, `executionEnabled`, and `liveTradingEnabled` false.
- No order placement/cancellation, position mutation, withdrawal, transfer, or live execution is implemented.
- Vault access, per-customer private exchange credentials, additional provider runtimes and hosted Staging acceptance remain separate review gates.

Passing CI proves contract and mocked/control-plane behavior only. It does not prove that a customer's live Windows terminal is provisioned or currently connected. Do not merge/deploy or enable further providers without review and recorded Staging evidence.

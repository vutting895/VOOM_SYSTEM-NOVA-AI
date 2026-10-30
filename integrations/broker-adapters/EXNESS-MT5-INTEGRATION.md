# Exness MT5 adapter integration boundary

Status: implementation plan for PR #103 and Issue #78. This document does not activate a broker connection.

## Decision

The first NOVA provider adapter is Exness MT5 Demo, but the adapter must reuse the existing System Integration Hub and the authenticated MT5 Bridge → Relay → Proxy path. Do not create another MT5 process, relay, proxy, route allocator, or credential store.

The Python BrokerReadOnlyAdapter contract is a provider-neutral interface for isolated runtimes and tests. It is not permission to load the MetaTrader5 package in a Cloudflare Worker or to bypass the existing JavaScript Hub.

## Existing request path

1. Customer authenticates with Supabase Auth.
2. System Hub resolves the caller's own connection record using the authenticated user ID/RLS.
3. System Hub invokes the fixed MT5 read-only Proxy URL with the current user session and connection ID.
4. Proxy verifies Supabase identity, loads only a row matching both connection ID and authenticated user ID, and verifies Exness + Demo + connected + allocated bridge route.
5. Proxy selects the tenant-specific route and calls the stable MT5 Bridge Relay.
6. Relay validates tenant ID and tenant-specific bearer token, then forwards only allowlisted GET paths to the Windows loopback Bridge.
7. Bridge validates the bearer token and tenant ID, reads the attached MT5 terminal, and returns read-only account/market data.
8. System Hub returns only the documented sanitized response to the customer.

Relevant existing Hub operations:
- GET /v1/connections/:connectionId/status
- POST /v1/connections/:connectionId/check
- GET /v1/connections/:connectionId/account
- GET /v1/connections/:connectionId/quotes?symbol=...&timeframe=...&count=...

The exact route implementation remains authoritative in integrations/system-hub/worker.js; the public contract is documented in integrations/system-hub/README.md.

## Mapping to the typed adapter contract

| Contract | Existing source / rule |
|---|---|
| provider_id | Fixed literal exness_mt5; never caller-selected |
| environment | Fixed demo for initial release |
| connection_id | Validated UUID; resolved against authenticated owner |
| owner_id | Derived from Supabase Auth, never accepted from model/caller |
| verify() | Hub POST .../:id/check; requires a successful real account read |
| account_snapshot() | Hub GET .../:id/account; normalize only after successful proxy read |
| market_data_snapshot() | Hub GET .../:id/quotes; bounded symbol/timeframe/count allowlist |
| close() | No persistent Python MT5 session is owned by the Hub adapter; relay/bridge lifecycle stays with its existing Windows service |

## Readiness and identity rules

- A pending database row, public relay health response, process start, or allocated route is not proof of a connected broker.
- Only a successful authenticated request through the full owner-scoped path can advance the connection to data-verified.
- Preserve provider provenance and observation timestamps.
- Mask provider account identifiers before exposing them outside the trusted integration boundary.
- Do not claim legal/KYC owner identity from the account label or terminal metadata.
- A missing route, wrong owner, wrong tenant, disconnected Bridge, timeout, malformed provider response, or revoked session fails closed.
- Do not log bearer tokens, account payloads, raw provider exceptions, or secret material.

## Explicit non-capabilities

The adapter exposes only connection verification, account reads, and bounded market-data reads. It must never expose:
- order placement or cancellation;
- position or account mutation;
- withdrawals or transfers;
- arbitrary host, port, URL, or proxy selection;
- shared/global tenant route-map mutation.

ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false remain mandatory at every layer.

## Acceptance evidence before implementation is marked complete

1. Exact-head CI passes for PR #103.
2. Existing System Hub and MT5 Bridge/Relay/Proxy test suites pass.
3. Owner A can read only A's connection; owner B cannot inspect, check, or read A's connection.
4. Tenant A relay credentials cannot reach tenant B's Bridge.
5. End-to-end Exness Demo account read succeeds and the returned data is sanitized.
6. Failure, timeout, revocation, missing route, and malformed response cases fail closed.
7. Hosted staging evidence is recorded before any production activation.

No Vault grant, credential intake, new route allocation, hosted secret, migration, deployment, or broker write is authorized by this document.
# Exness Trader API adapter — implementation status

**Base:** `main` at `574466a9ccce545ea8ff81ad8cc11f3bc0f0675e`  
**Implementation branch:** `feat/exness-trader-api-readonly-adapter-20261031`  
**Runtime target:** existing System Integration Hub  
**Activation:** blocked until dedicated customer-secret custody is reviewed and implemented  
**Trading safety:** read-only only; every trading/execution flag remains false

## Implemented in this branch

- Isolated adapter module at `integrations/system-hub/exness-readonly-adapter.js`.
- Ed25519 signed GET request headers using the documented `EXN-*` protocol.
- Support for Exness-generated 128-character hex private keys (64 bytes; first 32 bytes are the Ed25519 seed) and PKCS#8 PEM private keys.
- Signed account Access Point discovery through `GET /v1/trading/access-point?account_id=...`.
- Account details, account limits and available-instrument GET reads.
- Bounded candle-history GET reads, constrained to the account instrument list and the live `max_candles_per_request` / `history_age_days` returned by the account limits endpoint; missing limit metadata fails closed. OHLC responses are validated for chronology and price consistency.
- Fixed HTTPS Exness host suffix checks, strict endpoint/query allowlists, redirect rejection, no-store requests, timeouts, and sanitized upstream errors.
- Synthetic RFC 8032 / Exness test-vector coverage and adapter fail-closed tests.

## Credential boundary — not yet enabled

The adapter accepts credentials only from an injected server-side `resolveCredentials({ ownerId, connectionId, provider })` function. It does not expose a credential-ingress route, read request-body credentials, persist secrets, or connect directly to Supabase Vault.

The current secret-manager readiness record blocks customer credential reads/writes because the inspected Vault `service_role` has broad access and the dedicated least-privilege owner-bound role/path is not yet available. Therefore:

- Do not wire a resolver to the current generic Supabase `service_role`.
- Do not place the private key in a generic Worker secret, frontend/Netlify variables, browser storage, Git, logs, chat, or a client-readable table.
- Do not enable an API-key submission endpoint.
- Keep the adapter disconnected from public Hub routes until the dedicated secret-custody gate and two-owner isolation tests pass.
- The owner may retain the API key and private signing key in their own approved secure storage. Never send either value to ChatGPT or GitHub.

## Exact currently supported upstream operations

| Operation | Method and path |
|---|---|
| Access Point discovery | `GET /v1/trading/access-point?account_id={account_id}` |
| Account details | `GET /v1/configuration/accounts/{account_id}/account` |
| Account limits | `GET /v1/configuration/accounts/{account_id}/limits` |
| Available instruments | `GET /v1/configuration/accounts/{account_id}/instruments` |
| Effective account/API limits | `GET /v1/configuration/accounts/{account_id}/limits` |
| Candle history | `GET /v1/market-data/accounts/{account_id}/candles` (count and history age must be within the current account limits) |

No order, position mutation, account switch, transfer, deposit, withdrawal, or payment method exists in the adapter. Tick WebSocket support is deferred to a separate runtime design and test because the current Hub does not yet own a persistent streaming lifecycle.

## Verification still required

1. Run the System Hub Node test suite on this exact PR head; confirm the Ed25519 vector against the official Exness sample.
2. Review Cloudflare Workers WebCrypto Ed25519 compatibility on the deployed compatibility date.
3. Implement and review a dedicated owner-bound Vault access path; prove user A can retrieve only user A's connection secret and user B is denied.
4. Connect the resolver only to that approved path.
5. Use the owner's own secure setup to configure the credential reference and account ID; no credential value enters GitHub or chat.
6. Run authenticated staging reads for discovery, account details, limits, instruments and candles. Record sanitized status, response schema and source timestamps only.
7. Add negative tests for revoked/expired key, invalid signature, insufficient scope, unsupported instrument, stale data, malformed candles, rate limiting and cross-tenant access.
8. Update the System Hub integration registry and Dashboard only after staging proof. Keep the existing MT5 Bridge path as a separate legacy adapter and rollback.

## Official references

- Authentication and Ed25519 signing: https://www.exness-api.com/documentation/authentication
- API key and host setup: https://www.exness-api.com/authentication/api-key-and-host-setup
- Code examples and synthetic signing vector: https://www.exness-api.com/trading/guides/code-examples
- Access Point discovery: https://www.exness-api.com/documentation/access-point-host-discovery
- Account details: https://www.exness-api.com/reference/trading/get-account-details
- Account limits: https://www.exness-api.com/reference/trading/get-limits
- Available instruments: https://www.exness-api.com/reference/trading/get-available-instrument-list
- Candle history: https://www.exness-api.com/reference/get-candle-history

**Status rule:** source code in this branch is not proof of a connected account. Until the credential-custody and authenticated staging gates pass, the Dashboard must show setup/verification pending, not Connected or live prices.

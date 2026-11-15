# NOVA Exness Trader API — Read-only integration decision

**Status:** implementation gate / API migration specification  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Source of truth:** `main`  
**Target runtime:** existing Cloudflare `voom-system-hub` Worker  
**Initial environment:** Exness API-eligible Demo account only  
**Safety:** account/market reads and AI analysis only; all trading, payment, transfer and withdrawal operations prohibited.

## 1. Decision

Move the intended NOVA Exness integration toward the official Exness Trader API instead of making the Windows MT5 terminal/Bridge a long-term dependency.

The target request path is:

`NOVA Dashboard → Supabase Auth → existing System Hub → Exness API adapter → Exness Gateway discovery → account Access Point`

The System Hub remains the identity, owner, tenant and capability enforcement boundary. Do not create a second Cloudflare Worker or a generic URL proxy.

The current MT5 Bridge/Relay/Proxy implementation is retained temporarily as rollback/reference only. Do not delete its code, disable its Worker, change customer connection rows, or claim API cutover until the API path has passed the acceptance gates below.

## 2. Exness account eligibility is a hard prerequisite

Exness Help Center's API article (updated 2026-10-23) states that standard MetaTrader accounts cannot connect to the Exness API; only supported Exness trading accounts are eligible. API access also requires full account verification (POI and POA) and API credentials created in the Exness Personal Area.

Therefore the existing Exness MT5 Demo account must not be assumed API-compatible. Before runtime activation, confirm in Exness Key Management that the exact account can be selected for an API key and that Exness provides its API Gateway host. If the current MT5 Demo account is not eligible, use a separate API-eligible Demo account only after the account owner explicitly chooses it. Do not silently substitute an account or label a different account as the existing MT5 account.

Official references:
- Exness Help Center — Exness API: https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API
- Exness API Developer Portal — API Key & Host Setup: https://www.exness-api.com/authentication/api-key-and-host-setup
- Exness API Developer Portal — Authentication / Request signing: https://www.exness-api.com/documentation/authentication
- Exness API Developer Portal — Access Point / Host Discovery: https://www.exness-api.com/trading/get-started/access-point-host-discovery

## 3. API authentication contract

Use the current Exness Trader API signing protocol, not a guessed OAuth flow:

- `EXN-API-KEY`: API key identifier from Exness Key Management.
- `EXN-IDEMPOTENCY-KEY`: required empty header value for signed GET requests.
- `EXN-TIMESTAMP`: fresh Unix timestamp in milliseconds.
- `EXN-SIGN-VERSION`: `1`.
- `EXN-DATA`: base64url-encoded JSON signing payload without padding.
- `EXN-SIGN`: Ed25519 signature over the decoded EXN-DATA payload bytes, base64url without padding.

The signed payload binds the API key, empty GET idempotency key, timestamp, version, uppercase method, exact request path including query string, and SHA-256 body hash. Generate a fresh signature per request. Query parameters must not be reordered or rewritten after signing.

The Gateway host must be copied from the user's Exness Key Management DNS widget. Resolve the account Access Point using signed `GET /v1/trading/access-point?account_id=<id>`; use the returned `access_point` for account-scoped REST and WebSocket calls. Never hardcode or guess an Exness host from documentation examples.

Support both documented private-key representations in the adapter only after tests:
- Exness-generated 128-character hex Ed25519 private key (64 bytes).
- Customer-generated PKCS#8 Ed25519 PEM private key.

## 4. Read-only capability allowlist

The adapter must use a fixed route/method allowlist sourced from the current Exness OpenAPI reference. Initially allow only the required signed GET operations for:
- API/account capability discovery and account snapshot.
- Instrument/symbol metadata.
- Market prices, candles and permitted historical market data.
- Read-only positions/orders/history only where the exact GET endpoint and account scope are documented and needed for analysis.

Do not implement or expose:
- order create, amend, cancel, close, or any other trading mutation;
- position mutation or leverage/margin changes;
- deposits, withdrawals, transfers, payment operations;
- generic HTTP forwarding, arbitrary host selection, arbitrary paths, or user-supplied methods;
- WebSocket write/command messages.

The adapter must reject non-GET methods before signing or making any upstream request. A static allowlist is required; a caller-provided URL/path is never trusted. UI, Hub, tests and provider registry must all report `orderSubmission=false`, `tradeMutation=false`, `withdrawal=false`, `transfer=false`, and `liveTradingEnabled=false`.

## 5. Secret custody and tenant boundary

The private signing key must never be sent to ChatGPT, stored in GitHub, exposed to the browser, included in a URL, written to logs/traces, or passed to AI/MCP context.

The current repository security decision blocks customer credential reads/writes until a separately reviewed secret-custody path is approved and passes its isolation tests. PRs #95, #105, #112 and #130 are related candidate/security work; their existence is not approval to bypass the gate. Do not put a customer private key in the generic Supabase `service_role` Vault path or in a shared platform Worker secret.

Before enabling customer API credentials:
1. Complete the separate secret-custody design and independent review.
2. Prove owner/tenant binding and two-customer isolation using synthetic keys in local tests.
3. Prove credential rotation, revocation, replay/fencing and sanitized error behavior.
4. Confirm the private key is available only to the narrowly scoped server-side signer/adapter and never returned by any API.
5. Confirm Exness API key permissions are restricted to read-only scopes in Key Management. If the UI cannot express read-only scopes, the adapter's GET-only allowlist remains mandatory and API activation must be explicitly reviewed.

## 6. Connection lifecycle and UI truthfulness

Expose distinct states: `not_configured`, `account_eligibility_pending`, `credential_pending`, `verifying`, `reachable`, `authenticated`, `data_verified`, `verification_failed`, `revoked`, and `unavailable`.

A connection is not `data_verified` until the exact account's signed API request succeeds and its account identity matches the selected account. Do not infer connectivity from a saved key reference, successful Worker deployment, DNS discovery alone, or a healthy Hub process.

The UI must clearly distinguish:
- existing MT5 Demo connection (legacy Bridge path);
- Exness Trader API connection (separate API eligibility and account identity).

Do not show the API path as connected before real API evidence. Do not merge the two connection identities or copy the MT5 account ID into the API account field without provider confirmation.

## 7. Implementation sequence

1. Verify exact Exness API eligibility for the intended Demo account and obtain the Gateway host from Key Management.
2. Complete the approved secret-custody gate; do not collect or paste the private key into chat or GitHub.
3. Implement the Exness signing/discovery/read-only adapter inside the existing System Hub integration boundary, with fixed upstream hosts discovered from trusted provider configuration and strict request allowlists.
4. Add synthetic Ed25519 known-answer tests, exact-path/query signing tests, GET-only enforcement tests, account identity mismatch tests, rate-limit/timeout handling, secret-redaction tests, and two-tenant isolation tests.
5. Integrate an additive API connection state without mutating or deleting legacy MT5 records.
6. Open a reviewed PR; run exact-head CI and security review. Keep the PR unmerged until acceptance evidence exists.
7. Test with the API-eligible Demo account; record sanitized response metadata and exact account match without storing raw provider payloads.
8. Only after verified API reads and explicit owner approval consider retiring the old Bridge path. Trading remains disabled regardless.

## 8. Acceptance gates

- [ ] Exness confirms the intended Demo account is API-eligible.
- [ ] API key and Gateway host are created/retrieved in Exness Key Management; private key remains outside GitHub/chat.
- [ ] Secret-custody gate is approved and passes synthetic two-tenant isolation.
- [ ] Ed25519 signing matches official known-answer/test vectors.
- [ ] Gateway discovery returns the account Access Point for the exact selected account.
- [ ] Signed account GET succeeds and account identity matches.
- [ ] Required market-data GET succeeds with bounded response sizes and rate-limit handling.
- [ ] Non-GET, order, position-mutation, withdrawal, transfer and arbitrary URL/path attempts are rejected locally with zero outbound calls.
- [ ] Secret-leak and cross-tenant tests pass.
- [ ] Exact PR head CI passes and code is reviewed before merge.
- [ ] Production/hosted activation is separately approved and verified.

**Non-negotiable safety invariant:** Demo only; read-only + AI Analysis; `order_submission_enabled=false`; Live Trading OFF. A successful account API read does not authorize any trading or payment operation.

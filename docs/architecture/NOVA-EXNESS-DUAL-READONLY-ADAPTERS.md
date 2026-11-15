# Exness Dual Read-only Adapters — Implementation Contract

- Date: 2026-10-31
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base: `main` at `a8701b07f4746d08fcba462e0dc7f720b53e5a48`
- Control plane: existing `integrations/system-hub`
- Decision: retain Exness MT5 Demo Bridge and add a separate Exness Trader API adapter
- State: design/implementation gate only; no API key has been supplied or connected
- Safety: read-only + AI analysis; all order/execution/live flags remain false

## 1. Adapter separation

The two Exness paths are distinct products and must never share credentials, transport assumptions, readiness state, or adapter implementation.

| Adapter ID | Provider path | Authentication | Intended data | Current state |
|---|---|---|---|---|
| `exness-mt5-demo` | Windows MT5 terminal → tenant Bridge → Relay → read-only Proxy → System Hub | Existing per-tenant Bridge token and authenticated Supabase session | Demo account summary, symbols, quotes, candles | Existing path; tenant Bridge allocation and end-to-end account verification remain prerequisites |
| `exness-trader-api` | System Hub → Exness Trader API Gateway/discovery → account Access Point | Exness API key ID + Ed25519 signing private key | Supported account details, instruments, quotes and history, limited to documented GET operations | Not configured; API eligibility and secure credential custody unverified |

The System Hub remains the only control plane for identity, connection ownership, provider registry, capability checks, rate limits and sanitized audit correlation. Do not create a second gateway, route Trader API traffic through the MT5 Proxy, or use MT5 credentials to authenticate Trader API.

## 2. Important account/API eligibility gate

Exness Help Center states that Standard MetaTrader accounts cannot connect to the current Exness API. API access is eligibility-gated and requires the customer to create an API key in Exness Personal Area after meeting the provider's account-verification requirements.

Therefore:
- An existing MT5 Demo account or its MT5 login/password must not be assumed to be a valid Trader API account.
- Before implementation is activated, the customer must confirm that the relevant Exness trading account appears as selectable in API Key Management and that the API product is available to that account.
- If the MT5 Demo account is not eligible, keep the MT5 Bridge adapter as the working Demo route and register a separate API connection only for an eligible Exness API account.
- Do not infer that a successful MT5 read proves Trader API eligibility, or that Trader API account data proves the MT5 terminal is connected.

Official eligibility reference: https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API

## 3. Trader API authentication contract

The current Exness Trader API documentation describes Ed25519 request signing. The signed request uses these headers:
- `EXN-API-KEY`
- `EXN-IDEMPOTENCY-KEY` (present but empty for signed GET requests)
- `EXN-TIMESTAMP` (Unix milliseconds)
- `EXN-SIGN-VERSION` (currently `1`)
- `EXN-DATA` (base64url, no padding)
- `EXN-SIGN` (Ed25519 signature, base64url, no padding)

The signed payload binds the API key, idempotency key, timestamp, sign version, uppercase HTTP method, exact path plus query string, and SHA-256 body hash. For a GET without a body, sign the SHA-256 hash of the empty body. Generate a fresh timestamp and signature for each request; query parameters must not be reordered or re-encoded after signing.

Host selection is dynamic:
1. The customer creates/revokes the key in Exness Key Management.
2. The current Trader API Gateway host is obtained from the Key Management DNS widget / approved discovery contract.
3. The account Access Point is resolved through the documented discovery flow.
4. Account-scoped REST/WebSocket traffic uses the returned Access Point, not a hard-coded example host.

Do not use documentation example hosts as runtime fallbacks. Do not accept an arbitrary host, URL, port, redirect target, or proxy address from the browser/model. Host discovery and every returned origin must be validated against a reviewed Exness-origin policy before use. Redirects are rejected unless a separately reviewed same-provider-origin rule explicitly permits them.

Official references:
- https://www.exness-api.com/authentication/api-key-and-host-setup
- https://www.exness-api.com/documentation/authentication
- https://www.exness-api.com/documentation/access-point-host-discovery
- https://www.exness-api.com/reference/exness-trader-api

## 4. Read-only enforcement

The Trader API includes trading functionality at the provider platform level. NOVA must expose a deliberately smaller interface:
- Signed `GET` requests only.
- Compiled endpoint allowlist sourced from the pinned Exness OpenAPI specification.
- Explicit capability allowlist per API account and environment.
- Reject every non-GET method before signing or network access.
- No order, cancel, amend, close-position, transfer, deposit, withdrawal, payment, or funding endpoint in adapter code, registry, MCP tools, or UI.
- No generic HTTP proxy, arbitrary path, caller-selected host, dynamic endpoint construction from model output, or unrestricted WebSocket command surface.
- Do not assume an Exness key offers a universal read-only scope. Inspect the actual Key Management permission options. If trade/write scopes cannot be excluded at provider level, NOVA's adapter must still enforce GET-only and must show that provider-side scope limitation explicitly; do not claim provider permission verification.

Required immutable safety values:
```js
ordersEnabled = false;
executionEnabled = false;
order_submission_enabled = false;
liveTradingEnabled = false;
```

## 5. Credential custody — hard blocker

The API key identifier and Ed25519 private signing key are customer credentials. They must not enter Git, chat, voice, browser storage, frontend environment variables, MCP/model context, issues, logs, traces, analytics, test fixtures, or API responses.

The current repository contains an OpenBao Transit client scaffold, but the OpenBao staging closure checklist says Staging is not installed, connected, or activated. The older Supabase Vault readiness check also blocks direct customer credential reads/writes because the observed grants were too broad. Neither system may be treated as an operational credential vault today.

Before enabling Trader API credential intake:
1. Close the OpenBao staging infrastructure, TLS, identity, policy, audit, backup/restore and private Cloudflare VPC gates; OR approve another reviewed server-only custody design.
2. Define how the Ed25519 signing key is encrypted/stored and used without exposing plaintext to the browser or model. Transit encryption alone does not automatically provide signing operations; verify the selected cryptographic design supports Ed25519 signing or use a narrowly isolated signing service.
3. Bind each secret reference to authenticated owner + exact connection ID + provider + environment.
4. Prove two-owner isolation, rotation, revocation, stale-reference denial and secret-leak tests.
5. Return only an opaque secret reference and sanitized connection state to the frontend.

Until then, the Trader API credential endpoint and UI remain disabled and return a sanitized `credential_vault_unavailable` / `not_configured` state. Do not request the API key from the customer in chat.

## 6. Registry and connection model

Register separate provider records:
- `exness-mt5-demo`: adapter `voom-mt5-readonly-proxy`, environment `demo`, auth `supabase-session+tenant-bridge`.
- `exness-trader-api`: adapter `voom-exness-trader-api-readonly`, environment only when confirmed by the account/API product, auth `exness-ed25519-signed-request`.

The API connection must have its own connection ID, owner, provider account reference, credential reference, discovered Gateway/Access Point metadata, capabilities, verification timestamps and lifecycle state. Never overload the existing `provider='exness_mt5'` row or `bridge_route_id` for Trader API.

Suggested lifecycle:
`not_configured → eligibility_pending → credential_pending → pending_verification → authenticated → identity_verified → data_verified`

Failure states include `api_access_ineligible`, `credential_vault_unavailable`, `reauth_required`, `scope_insufficient`, `host_discovery_failed`, `provider_unavailable`, `verification_failed`, and `revoked`. Do not label a connection connected until a real signed read succeeds and account/connection ownership is verified.

## 7. Test and activation gates

### MT5 Bridge adapter
- Keep existing Bridge → Relay → Proxy route unchanged.
- Allocate a dedicated tenant route; never hand-edit a shared route map as a customer onboarding action.
- Test authenticated account and quote reads, wrong-tenant denial, missing route fail-closed behavior, bounded timeouts and sanitized errors.
- Preserve the Windows Bridge rollback until replacement routes pass staging acceptance.

### Trader API adapter (before credentials)
- Unit-test canonical payload serialization, SHA-256 empty-body hash, base64url without padding, Ed25519 signature verification with generated test keys, timestamp binding, exact path/query binding and key/account binding.
- Test that non-GET methods, unknown paths, arbitrary hosts, redirects, duplicate query parameters, stale timestamps and malformed discovery responses fail before provider access.
- Use synthetic test keys only; never use customer credentials in tests.
- Confirm the chosen Cloudflare Worker runtime supports the required Ed25519 import/sign operation. If unsupported, use an approved isolated signer; do not silently fall back to weaker signing.

### Trader API adapter (after eligibility + secure custody)
- Perform minimal signed GET account read and supported instrument/market-data reads.
- Record only sanitized HTTP outcome, capability, provider timestamp, latency and correlation ID.
- Test invalid/expired key, invalid signature, permission denied, wrong account, rate limit, timeout, malformed payload and provider outage.
- Verify owner-vs-foreign-owner isolation using two staging users.
- Run exact-commit CI and staging smoke tests before any registry activation.

## 8. Delivery order

1. Resolve the existing hosted GitHub Actions runner-admission blocker; do not treat absent runner steps as source-code test failures.
2. Review this dual-adapter contract and merge it through a focused PR.
3. Keep MT5 Bridge path operationally separate and close its tenant allocation/read-only end-to-end acceptance.
4. Close OpenBao or another approved secret-custody path before asking the customer to create/submit any API key.
5. Implement and test the isolated Trader API signer + GET-only adapter on a feature branch.
6. Verify API eligibility in the customer's Exness Personal Area. The customer creates the key there; NOVA never creates API keys.
7. Run two-owner staging, secret-leak and signed GET smoke tests.
8. Activate Trader API registry/UI only after explicit review and approval. Production deployment is a separate gate.

No API credentials, broker settings, Supabase data/grants, Cloudflare bindings, Worker routes, or deployments are changed by this contract.

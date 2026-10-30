# NOVA Customer Multi-Broker Connections & AI Automatic Connect

- Status: design extension for GitHub Issues #78 and #82; implementation not yet complete
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base branch: `main`
- Control plane: existing NOVA System Integration Hub (`integrations/system-hub`)
- Customer surface: canonical NOVA frontend and tenant-owned Personal AI workspace
- Safety baseline: read-only + AI analysis / paper research; `ordersEnabled=false`; `executionEnabled=false`; Live Trading OFF

## 1. Product outcome

A customer connects one or more of their own supported broker accounts from the NOVA customer workspace. The customer can ask Personal AI to check a connection, retry a safe health probe, refresh an account snapshot, or switch the workspace's selected account. The Hub—not the model—authenticates the customer, resolves ownership, retrieves any approved secret reference, chooses the registered adapter, and authorizes the operation.

This extends the existing self-service integration design in Issue #78 and the customer-owned workspace design in Issue #82. It must not create a second gateway, a parallel customer app, or an unrestricted broker proxy.

The first customer release remains **Exness MT5 Demo read-only**. IBKR and CCXT exchanges are planned adapter families, not a claim that they are currently connected or production-ready.

## 2. Customer-facing experience

### Connection onboarding

1. Customer signs in through NOVA/Supabase Auth.
2. The customer opens **Connections** from their own workspace and chooses an allowlisted provider and environment.
3. NOVA explains the requested permissions and supported data before credential entry.
4. Credentials are entered only in a dedicated authenticated HTTPS connection dialog or an official OAuth flow. Never ask for a broker password/API secret in Personal AI chat, a voice transcript, a query string, or a workspace-generated form.
5. The Hub creates an owner-scoped connection request and hands credentials directly to the approved server-side vault adapter. It returns only a non-secret connection ID and lifecycle state.
6. The provider adapter performs a bounded, read-only verification. MT5 additionally waits for tenant-specific Bridge/Relay provisioning and a real account read.
7. The workspace shows connection state, provider account metadata, environment, granted read-only capabilities, last verified time, and sanitized next action.

The dashboard must not describe a connection as “connected” merely because a credential was saved, an adapter process exists, or a public market endpoint responded.

### Chat-driven automatic actions

Personal AI may interpret requests such as:
- “ตรวจสถานะ Exness Demo”
- “ลองตรวจ Binance ที่เชื่อมไว้ใหม่”
- “เช็คยอดเงินของบัญชีที่เลือก”
- “สลับ workspace ไปใช้บัญชี IBKR …”

The model emits a typed intent containing an allowlisted operation and, where applicable, a connection reference. The Hub re-authenticates the session and independently checks that the connection belongs to the current user/tenant and that the operation is supported. A model-supplied connection ID, tenant ID, user ID, provider URL, host, port, or credential ID is never proof of authority.

A chat request may initiate a safe status probe or read-only snapshot. Adding a new credential requires the dedicated connection dialog/OAuth handoff. Switching the workspace's selected account must be explicit and confirmed in the UI; the model cannot silently change tenant ownership, route assignment, or broker permissions.

### Generative UI

Use the existing fixed, allowlisted workspace component catalogue. Initial broker components:
- `broker_connection_status`: provider, environment, readiness, last checked, sanitized error.
- `broker_account_identity`: provider-returned display name/account ID with provenance and masking.
- `broker_account_summary`: balance/equity/currency and data timestamp, only after an owner-scoped account read succeeds.
- `broker_account_selector`: list of the signed-in user's verified connections; explicit selection action.
- `broker_reauthentication_notice`: shown when credentials are expired/revoked or the provider requires customer action.
- `portfolio_balance_by_currency`: grouped values with provider, account, currency, and timestamp.

Model output is data-only JSON validated against the component schemas. Never execute model-generated HTML, JavaScript, JSX, MCP arguments as code, or arbitrary URLs.

## 3. Provider and runtime boundaries

All adapters are registered in the System Integration Hub through a server-owned provider registry. Each registry entry declares its provider ID, environment support, authentication method, credential schema, official fixed API origins, read-only verification operation, supported fields, rate limits, timeout, safe retry policy, and capability allowlist.

| Provider family | Initial adapter boundary | Required isolation |
|---|---|---|
| Exness MT5 | Reuse the current authenticated Bridge → Relay → read-only Proxy → System Hub path. First target remains Exness Demo. | One allocated terminal/Bridge session and route per customer connection. Never use a shared MT5 login or shared mutable process session. |
| IBKR | Add an `ib_async` read-only account adapter only behind an approved, isolated IB Gateway/TWS runtime or customer-side connector. | The cloud Hub cannot assume `127.0.0.1:7497` points to a customer's machine. Never accept customer-supplied host/port or scan arbitrary networks. |
| Binance / other CCXT exchanges | Add one explicit CCXT adapter per approved exchange ID (for example Binance or Bybit) using official fixed endpoints and account-read operations only. | Credentials are per owner + connection. Require keys with read-only/account scopes and trade/withdrawal permissions disabled at the provider. |

### MT5 constraints

- Do not import or run the MetaTrader5 Python package inside Cloudflare Workers or the shared System Hub.
- The Python MT5 package is a terminal-side integration; use the existing Windows Bridge/Relay architecture and its tenant guard.
- The current `MT5_TENANT_ROUTES` map is not a safe multi-customer allocator. Do not append, replace, or manually edit it per customer as an onboarding flow.
- Use an idempotent control-plane allocator/tenant registry or an equivalent per-tenant Durable Object design. Route assignment and revocation must be atomic and must not overwrite other customers' entries.
- MT5 remains pending until the assigned tenant Bridge is reachable and a real read-only account request succeeds.

### IBKR constraints

- The adapter must use a managed isolated IB Gateway/TWS runtime or a separately authenticated connector agent with a fixed egress/identity contract.
- The Hub must not attempt to connect to a user's private `localhost` from a cloud Worker.
- Account selection must be based on account IDs returned by the authenticated IBKR session and authorized for the current connection.
- Read-only mode must be enforced by the connector's API permissions and an explicit method allowlist; no order classes or order-placement methods are exposed.

### CCXT/exchange constraints

- `exchange_id` is selected from a compiled allowlist, never passed to dynamic `getattr` without validation.
- Use a dedicated per-request/per-connection client lifecycle; close clients in `finally` and avoid keeping credentials in a shared global connection dictionary.
- Request only required private read endpoints. Public market-data availability is a separate state and must not be treated as customer account authentication.
- Reject API keys that have trade, withdrawal, transfer, or other mutation permissions where the provider can report scopes/permissions. Where scopes cannot be verified, show the limitation and require explicit customer confirmation after explaining the provider-side setting; do not claim permission verification.
- Disable trading, withdrawals, transfers, borrowing, and other write operations at both provider-key setup and NOVA adapter/tool layers.

## 4. Secure credential lifecycle

### Supabase Vault evaluation

Supabase Vault is the preferred candidate for the first implementation because it stores secrets encrypted on disk and exposes a decrypted view for authorized database operations. It is not safe merely because the extension exists: access to `vault.decrypted_secrets` is equivalent to access to plaintext. The Vault schema, table, view, and functions must remain unavailable to `anon` and `authenticated`, and only a narrowly scoped server-side role/path may retrieve a secret for the exact connection owner. Never expose Vault through the public Data API or a public SQL function that returns decrypted values.

Before enabling credential writes, verify in the NOVA staging project:
- Vault extension availability and current behavior for this project/plan;
- current grants on `vault` schema, `vault.secrets`, `vault.decrypted_secrets`, and Vault functions;
- the server-only database access path and how it proves user + connection ownership;
- encryption/key lifecycle, backup/restore implications, rotation, deletion, and audit trail;
- safe secret creation that does not place credentials in SQL literals, statement logs, error details, or application traces.

If any gate is unresolved, credential submission stays disabled and the Hub returns a sanitized `credential_vault_unavailable` state. Cloudflare Worker secrets are deployment-level configuration, not a per-customer credential vault.

### Storage invariants

- Public application tables store only an opaque `credential_secret_ref`, non-secret provider metadata, permission flags, verification timestamps, and sanitized error codes.
- Broker credentials must never appear in browser state, URL/query parameters, chat/voice transcripts, model context, MCP tool output, checkpoints, issue text, Git, logs, traces, analytics, test snapshots, or client-side error messages.
- Never use placeholder/default credentials such as `mock_key`, `mock_secret`, a default MT5 login/password, or a “secret” fallback. Missing configuration fails closed.
- Rotation uses staged replacement: verify the new secret first, atomically activate its reference, then revoke/delete the old reference. If validation fails, keep the prior working reference unless the provider has already revoked it.
- Revoke/disconnect prevents further adapter calls immediately, then schedules provider revocation and safe cleanup of tenant runtime resources.
- Audit events include actor, connection ID, provider, operation, outcome, correlation ID, and timestamp only; never include secret material or raw secret-bearing provider responses.

### Credential handoff

Credentials go from the authenticated browser dialog directly to the Hub over TLS with strict size limits and CSRF/origin protections, then to the approved vault interface over a server-only connection. Credentials are never sent to the LLM or MCP. The response returns an opaque reference and sanitized state only.

OAuth providers must use state/nonce, PKCE where supported, exact registered redirect URIs, one-time callback state, and server-side token exchange. Do not imply OAuth availability for a provider until a provider partner program or official flow is confirmed.

## 5. Connection state and health-check semantics

Connection lifecycle:
`not_configured → pending_verification → configured → reachable → authenticated → identity_verified → data_verified`

Degraded/terminal states include:
`verification_failed`, `reauth_required`, `degraded`, `revoked`, `disconnected`, and `unavailable`.

Identity assurance is independent:
- `unavailable`: no authoritative provider identity endpoint/field is available.
- `provider_account_verified`: a documented provider endpoint returned account metadata with source and timestamp.
- `legal_owner_verified`: only when an authoritative provider/KYC assertion explicitly establishes the legal owner. Never infer it from an account label, API key, email, or customer-entered name.

A health check must perform a real bounded read-only operation appropriate to the adapter and report the measured result:
- Hub/auth availability;
- adapter runtime/Bridge availability;
- provider API reachability;
- authentication/credential acceptance;
- account data read success;
- observed latency and `as_of` timestamp.

Do not return a hard-coded latency or mark every object in an in-memory dictionary as ONLINE. Process memory is not a durable multi-tenant connection registry.

### Retry and re-authentication

- Safe transient failures may be retried at most three times with exponential backoff, jitter, a total deadline, and a provider-aware rate limit.
- Do not retry invalid/expired credentials, revoked keys, insufficient scopes, tenant guard denials, or policy rejections. Transition to `reauth_required` or the relevant blocked state and render the re-authentication card.
- Background checks may refresh status only while the customer has an active, authorized connection. Retries must not create new accounts, change provider permissions, or perform write operations.
- Reconnect means re-establishing the read-only transport with an existing valid credential reference. It does not mean silently replacing credentials or bypassing re-authentication.

## 6. Active account and balance aggregation

- A user may own multiple provider connections. A workspace may reference one explicitly selected active connection while retaining access only to that user's other verified connections.
- Account switching is a workspace preference bound to the authenticated owner; it does not modify the connection owner, tenant ID, secret reference, Bridge route, or provider-side account.
- Every balance item includes provider, connection ID, masked account identifier, amount, currency, timestamp, and verification state.
- Do not sum USD, USDT, EUR, THB, or other currencies as if they were the same unit. Return grouped totals by currency by default.
- A converted portfolio total is permitted only when a trusted, timestamped FX conversion source and explicit base currency are supplied. Show conversion time, FX source, and stale/unavailable status.
- Do not use a balance total as a risk score. Risk widgets must be computed separately from validated exposure, equity, margin, drawdown, and the strategy risk policy.
- Missing or stale balances are shown as unavailable/stale, never as zero or fabricated data.

## 7. FastMCP / Personal AI tool contract

The MCP layer is an authenticated tool surface, not a second credential vault or authorization engine. The System Hub remains authoritative.

Allowed read-only tool shapes (names are illustrative; reconcile with the existing MCP tool registry):
- `list_my_broker_connections()`
- `get_broker_connection_status(connection_id)`
- `verify_my_broker_connection(connection_id)`
- `get_readonly_account_snapshot(connection_id)`
- `select_workspace_account(workspace_id, connection_id)` — only after an explicit user confirmation and a fresh server-side ownership check.

Tool requirements:
- Derive the user/session from authenticated request context; never accept a free-form `user_id`, `tenant_id`, `route_id`, `host`, `port`, or secret as model-controlled authority.
- Never accept `credential_id=DEFAULT` as a global default. A connection reference must be looked up under the authenticated owner.
- AI can select only an allowlisted operation. The Hub rechecks ownership, capability, environment, current readiness, consent/entitlement, and rate limit on every call.
- Tools return normalized account data and sanitized diagnostic codes only. Never return API keys, passwords, access/refresh tokens, decrypted secret payloads, raw headers, or arbitrary provider bodies.
- Do not expose any order, position mutation, trade, transfer, withdrawal, deposit, or live execution tool.

## 8. Data model and API evolution

Reconcile with the existing `broker_connections` table and Issue #78 design before changing schema. Do not replace the current Exness Demo migration or duplicate the connection table.

Proposed additive connection metadata:
- `provider`, `environment`, `provider_account_id` (masked for UI), `account_label`;
- `credential_secret_ref` (opaque and server-only);
- lifecycle/verification/identity states and timestamps;
- granted read-only scopes and explicit capability booleans;
- sanitized `last_error_code`, retry-after, and revocation metadata;
- provider metadata provenance and `as_of` timestamps.

Existing migration constraint `provider='exness_mt5'` and `environment='demo'` is intentionally Exness-only today. A reviewed additive migration must expand provider/environment validation and carefully redesign uniqueness before enabling multiple accounts per provider/environment. Preserve the existing Exness row and route fields; backfill and test before replacing any constraint. The client must not be granted updates to provider status, identity claims, secret references, or route assignment.

Candidate Hub endpoints to extend (not deploy until implementation review):
- `GET /v1/integrations` — provider registry and capabilities.
- `GET/POST /v1/connections` — owner-scoped list/create request (idempotent).
- `POST /v1/connections/:id/credentials` — disabled until Vault gates pass.
- `POST /v1/connections/:id/verify` — bounded read-only verification.
- `GET /v1/connections/:id/status` — sanitized lifecycle and capability status.
- `GET /v1/connections/:id/account` — owner-scoped normalized account snapshot.
- `POST /v1/connections/:id/rotate`, `/revoke`, and disconnect lifecycle — server-side only.
- `PUT /v1/workspaces/:id/active-connection` — explicit owner-scoped selection; workspace API may be implemented in the canonical frontend if that is the existing boundary.

Do not add a generic upstream proxy, arbitrary endpoint/host field, or caller-selected route map.

## 9. Required verification

### Authorization and isolation
- User A cannot enumerate, read, verify, refresh, rotate, revoke, select, or disconnect User B's connection.
- Cross-tenant tests cover Hub, MCP tool calls, account snapshots, workspace selection, Vault secret lookup, and MT5 tenant routing.
- Missing, malformed, expired, or revoked sessions fail closed; Supabase Auth/Vault outage returns unavailable/503 rather than success.
- Idempotent connection creation and concurrent retries do not allocate duplicate Bridge sessions or overwrite another customer's route.

### Credential protection
- Assert that secrets do not appear in API responses, UI props, browser storage, prompts, MCP outputs, logs, traces, audit events, test snapshots, or Git.
- Verify secret rotation, revoke, delete, and stale-reference rejection.
- Test that Vault decrypted-view access is denied to public roles and only the server-side credential path can retrieve an owner-bound secret.

### Provider behavior
- Valid and invalid credentials, expiry/revocation, insufficient scopes, provider outage, timeout, rate limiting, malformed payloads, unsupported provider/environment, and stale account data.
- Health status measures a real operation; no hard-coded latency or process-local ONLINE state.
- CCXT adapter rejects unknown exchange IDs and never instantiates trading/withdrawal methods.
- IBKR adapter cannot connect to arbitrary user host/port and fails closed when its isolated Gateway/connector is unavailable.
- MT5 remains pending until allocated tenant Bridge and real Exness Demo account read are verified.

### Product and capability
- Customer can see all their own provider connections and switch the selected workspace account only after confirmation.
- Balance snapshots preserve account and currency provenance; aggregate totals are grouped by currency or converted using explicit trusted FX data.
- No broker order tools or endpoints exist in the customer release; `ordersEnabled=false`, `executionEnabled=false`, and Live Trading OFF are asserted by tests.
- Build, typecheck, worker tests, migration/RLS tests, staging integration, and deployment evidence must reference the exact commit. Anything not evidenced remains blocked/in progress.

## 10. Delivery sequence

1. **Design / API contract** — review this document with Issues #78 and #82; keep the credential-vault gate explicit.
2. **Tenant data contract** — additive migration for provider/account metadata, state model, secret reference, capability flags, uniqueness, and audit; run RLS/grant review.
3. **Vault integration** — test Supabase Vault in staging, isolate decrypted-secret access to the Hub's server-only path, and implement create/read/rotate/revoke without exposing secrets.
4. **Customer UI lifecycle** — provider registry, secure credential dialog/OAuth callback, connection status cards, re-authentication, active account selector, consent and disconnect flows.
5. **Adapter rollout** — finish Exness MT5 Demo allocator/Bridge first; then IBKR isolated Gateway; then allowlisted CCXT provider adapters.
6. **Personal AI / MCP** — expose only typed read-only status and account-snapshot tools through the existing authenticated Hub.
7. **Verification** — two-user/two-tenant tests, secret-leak tests, health/retry tests, build/typecheck, staging end-to-end and Cloudflare/Netlify deployment checks for exact SHA.
8. **Activation** — production activation only after review and explicit approval. Do not change hosted Supabase data, Cloudflare secrets/routes, Netlify configuration, or broker permissions as part of this design PR.

## 11. Reference implementation corrections

The illustrative `UnifiedBrokerAdapter` / FastMCP sample shared in the product brief must not be copied directly into production:

- It uses default/fallback MT5 credentials and mock exchange secrets; missing credentials must fail closed.
- It keeps process-local provider clients in a global dictionary, which is not a safe durable or isolated multi-tenant connection store.
- MT5 Python calls are terminal-runtime operations and belong in the existing dedicated Bridge, not the Cloudflare System Hub.
- IBKR `127.0.0.1:7497` only refers to the same runtime's loopback interface; a cloud service cannot use it to reach a customer's computer.
- Its health method does not inspect provider state, and the returned latency is fabricated. Health checks must use real bounded probes and measured timing.
- `fetch_balance` verifies only a permitted balance read; it does not prove legal account ownership. Identity requires a documented provider endpoint and provenance.
- Catch-all exceptions must be sanitized; never return raw provider exception text that may include secrets or account metadata.
- The FastMCP tool must derive the authenticated principal from request context and delegate to the Hub; it must not read a global `DEFAULT` credential or trust a model-supplied tenant ID.
- Keep the adapter interface read-only by construction. Do not import or expose `MarketOrder`, order endpoints, trade methods, withdrawals, transfers, or execution workers in this release.

## 12. Current status at design time

- Existing main branch has an Exness MT5 Demo pending-request path and authenticated Hub/Proxy/Relay checks.
- Existing customer onboarding still depends on per-customer Bridge allocation; the route map does not yet provide a safe self-service multi-tenant allocator.
- Existing API identity self-service (Issue #78 / PR #79) is design-only and gates credential writes on an approved vault.
- Existing customer-owned AI workspace (Issue #82 / PR #83) is design-only.
- No IBKR or customer CCXT account adapter, credential vault lifecycle, multi-provider balance aggregation, or background auto-reconnect is claimed as implemented by this document.

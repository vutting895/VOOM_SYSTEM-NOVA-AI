# API Identity Verification & Self-Service Connections

Status: implementation design for Issue #78
Target: extend the existing NOVA System Integration Hub; do not create a second gateway.

## 1. Product outcome

A customer signs in, chooses an allowlisted provider, submits provider credentials through a secure server-mediated flow when the provider supports them, and requests verification. NOVA verifies connectivity and permissions, fetches only provider-authoritative account metadata, and displays the result on the customer's dashboard. The customer can refresh, rotate, revoke, or disconnect the connection without an administrator manually editing per-customer records.

A successful API probe is not, by itself, proof of the legal identity of the person who owns the account. The UI and API must distinguish:
- `connection_verified`: the provider accepted the credential and the permitted read-only probe succeeded.
- `account_identity_verified`: an official provider endpoint returned the account identity fields, with provenance.
- `legal_owner_verified`: only available when an authoritative provider/KYC assertion explicitly establishes the legal owner. Never infer this from a display name, email, account label, API key, or customer-entered value.

## 2. Existing architecture to extend

The existing System Integration Hub already validates Supabase sessions, lists the signed-in user's `broker_connections`, creates pending Exness Demo requests, checks the read-only MT5 path, and returns sanitized account summaries. Existing ownership and RLS rules must remain authoritative.

Current gap: customer-created connections remain pending until a trusted administrator assigns `bridge_route_id`; MT5 Relay/Proxy consume a server-side `MT5_TENANT_ROUTES` map. The current one-tenant route helper is not a multi-tenant provisioning system and must not be used to append or replace a shared map.

Extend the existing Hub and adapter contracts. Do not add a generic `/proxy?url=` route, arbitrary provider URL, or caller-controlled tenant/route ID.

## 3. Customer flow

1. Sign in through Supabase Auth.
2. Select a provider from the Hub's allowlisted integration registry.
3. Review requested read-only scopes and supported identity fields.
4. Submit credentials only to an authenticated HTTPS Hub endpoint or an approved OAuth redirect flow. Do not put credentials in query strings, browser local/session storage, analytics, AI prompts, or client logs.
5. Hub validates the request, creates an owner-scoped connection in `pending_verification`, and stores credentials only through the approved server-side vault adapter.
6. A provider-specific adapter performs a bounded, rate-limited, read-only verification request.
7. Normalize only documented provider fields and attach provenance, scope, and verification timestamp.
8. For MT5, enqueue a tenant-provisioning request. A connection remains pending until an isolated Bridge/runtime and route have been allocated and the real read-only account check succeeds.
9. Dashboard displays connection, account identity, permission, and runtime states independently.
10. Customer can re-verify, rotate, revoke, or disconnect. Revocation must disable future adapter use and clean up or quarantine tenant runtime resources safely.

## 4. Provider adapter registry

Each adapter is explicitly registered in code and declares:
- stable provider ID and environment (demo/sandbox/production);
- authentication method (OAuth, API key/secret, MT5 terminal session, or unsupported);
- accepted credential schema and maximum request size;
- official verification endpoint/operation and fixed origin;
- required and optional scopes;
- whether account profile/identity fields are available;
- normalized fields and their source paths;
- supported read-only capabilities;
- timeouts, rate limits, and safe retry policy.

Only provider-owned fixed endpoints are allowed. Validate TLS, response content type, schema, response size, and redirects. Reject caller-supplied URLs, arbitrary headers, unsupported providers, write scopes, trading endpoints, withdrawal endpoints, and unknown capabilities.

### Initial provider order

**Exness MT5 Demo**
- Reuse the existing authenticated Bridge → Relay → read-only Proxy → Hub path.
- First deliver account metadata that the terminal actually exposes (for example account login/ID, server, account display/name field if present, currency, and demo/trade mode).
- Label fields as `provider_account_metadata`, not legal owner/KYC identity.
- Do not claim a natural-person owner name unless Exness exposes an authoritative identity endpoint and the implementation verifies its documented semantics.
- Tenant allocation must be automated by an idempotent allocator/control-plane workflow, not a manually edited per-customer route map. Shared route-map updates must be atomic and preserve all tenants, or be replaced by a tenant registry/Durable Object design with equivalent isolation.

**Other API-key/OAuth providers**
- Add only after the provider's official account/profile endpoint, scopes, credential handling, and terms have been reviewed.
- Display only fields returned by the official profile/account endpoint.
- If no owner identity endpoint exists, show `Identity not provided by provider`; never manufacture a name.

## 5. Credential vault decision gate

Do not implement credential writes until a concrete, approved server-side secret backend is selected and tested. Candidate backends must support per-tenant isolation, access policy, encryption at rest and in transit, rotation, revocation/deletion, auditability, and least-privilege access from the Hub/adapter.

Postgres may store a non-secret opaque `credential_secret_ref` and metadata only. It must not store plaintext credentials, reversible values without an approved encryption/key lifecycle, or secrets in JSON columns. Cloudflare Worker secrets are deployment-level configuration and are not a per-customer vault.

If the approved vault is not configured, the API must fail closed with a sanitized `credential_vault_unavailable` result; it must not fall back to database plaintext or ask customers to paste secrets into support/chat.

## 6. Data contract (additive migration only)

Extend connection metadata additively, preserving existing rows and RLS:
- `provider`, `environment`, `status`;
- `credential_secret_ref` (opaque reference only; server-only access);
- `verification_status` and `last_verified_at`;
- `identity_status` (`unavailable`, `provider_account_verified`, `legal_owner_verified`);
- `identity_display_name` (nullable provider-returned value);
- `provider_account_id` (nullable, appropriately masked in customer UI);
- `identity_source` and `identity_verified_at`;
- `granted_scopes` and declared read-only capability flags;
- `last_error_code` (sanitized enum, never raw provider body);
- timestamps and revocation state.

Avoid storing full raw provider profile payloads. Keep audit events minimal and sanitized. Any migration must include owner-only RLS, service-only writes for verification/secret references, grants review, indexes, and rollback notes.

## 7. API lifecycle (proposed)

- `GET /v1/integrations`: allowlisted provider capabilities and supported identity claims.
- `POST /v1/connections`: create owner-scoped onboarding request; no caller-selected tenant route.
- `POST /v1/connections/:id/credentials`: authenticated, bounded credential handoff to the vault; disabled until vault decision gate passes.
- `POST /v1/connections/:id/verify`: bounded read-only provider verification.
- `GET /v1/connections/:id/status`: lifecycle state, sanitized diagnostics, no secrets.
- `GET /v1/connections/:id/identity`: provider-sourced identity claims and provenance, owner-scoped.
- `POST /v1/connections/:id/rotate`: replace secret reference after successful validation; invalidate old reference only after safe commit.
- `POST /v1/connections/:id/revoke`: revoke provider credential where supported and mark local connection revoked.
- `DELETE /v1/connections/:id`: disconnect/archive owner-owned connection and schedule safe runtime cleanup; retain required audit evidence.

All routes require a valid Supabase session, ownership checks, RLS, request-size limits, rate limits, timeouts, idempotency where relevant, and structured sanitized errors. Use a consistent non-enumerating response for foreign connection IDs.

## 8. State model

Connection readiness and identity assurance are separate dimensions.

Connection lifecycle:
`not_configured → pending_verification → configured → reachable → authenticated → data_verified`
Possible terminal/degraded states: `verification_failed`, `degraded`, `revoked`, `disconnected`, `unavailable`.

Identity assurance:
- `unavailable`: provider exposes no supported identity endpoint or no identity fields.
- `provider_account_verified`: provider account/profile endpoint returned the declared account identity metadata.
- `legal_owner_verified`: only a provider-backed authoritative legal/KYC assertion; otherwise prohibited.

The dashboard must never use a generic green "Verified" badge without stating what was verified.

## 9. Security invariants

- Supabase Auth and owner/tenant authorization are checked server-side on every protected operation.
- RLS remains enabled; customer A cannot read, verify, rotate, revoke, or delete customer B's connection.
- Secrets never appear in browser responses, database plaintext, logs, traces, analytics, AI context, test snapshots, or Git.
- No arbitrary upstream URLs or user-defined provider operations.
- No trading, order placement/modification/cancellation, position mutation, withdrawal, transfer, or live execution.
- Read-only capability is enforced by adapter allowlists and the existing MT5 Bridge/Relay/Proxy contract.
- Exness Demo only for the initial MT5 rollout; `order_submission_enabled=false`; Live Trading OFF.
- Production configuration, hosted Supabase, Cloudflare secrets/routes, and Netlify settings are out of scope until separate explicit release approval.

## 10. Delivery milestones and closure gates

### M0 — Design and inventory
- [x] Confirm existing Hub and MT5 architecture on `main`.
- [x] Record the self-service/API identity requirements in Issue #78.
- [ ] Approve the secret-vault backend and threat model.
- [ ] Confirm provider documentation and exact identity fields for each adapter.

### M1 — Provider identity contract
- [ ] Add typed provider registry and normalized identity schema.
- [ ] Add tests for provenance, unsupported identity, malformed profile, and no legal-owner inference.
- [ ] Add read-only Exness account metadata mapping from the existing Bridge response.

### M2 — Secure credential lifecycle
- [ ] Implement vault adapter only after backend approval.
- [ ] Add credential create/rotate/revoke contract tests and secret-redaction tests.
- [ ] Add additive migration for opaque references and identity metadata with RLS/grant tests.

### M3 — Self-service Hub and UI
- [ ] Implement onboarding/verify/status/identity/revoke/disconnect routes.
- [ ] Implement customer settings wizard and identity display.
- [ ] Add owner/foreign-user integration tests and rate/size/timeout tests.

### M4 — Automated MT5 tenant provisioning
- [ ] Design and test atomic multi-tenant allocation without overwriting existing routes.
- [ ] Add idempotent allocation, cleanup, health, and per-tenant Bridge lifecycle.
- [ ] Keep a pending state until real authenticated account read and tenant isolation succeed.

### M5 — Staging acceptance and release
- [ ] Run full CI, build/typecheck, migration/RLS, provider adapter, secret-redaction, and preview checks.
- [ ] Verify two separate staging users end-to-end; no production test accounts.
- [ ] Verify Exness Demo account metadata through the real tenant route.
- [ ] Obtain explicit production activation approval; do not merge/deploy or mutate production settings automatically.

## 11. Definition of done

The task is complete only when a normal customer can independently connect, verify, see accurately sourced account identity metadata, refresh, rotate/revoke, and disconnect; a second customer cannot access any of the first customer's connection or identity; the secret vault and automated MT5 tenant allocator are operational and tested; CI and staging acceptance pass; and the read-only/Live Trading OFF invariants remain enforced. Documentation or mocked tests alone do not satisfy this definition.

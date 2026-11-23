# NOVA Integration Center — Full Automation v1

- Status: implementation foundation / draft; not a production integration claim
- Canonical control plane: existing `integrations/system-hub` (`voom-system-hub`)
- Frontend: existing NOVA React application; Google AI Studio is an authoring workflow, not a trusted runtime
- Identity: Supabase Auth; every protected operation must validate the caller's current access token
- Safety: least privilege, explicit consent, owner-scoped connections, read-only by default

## Product goal

Provide one customer-facing place to discover supported services, authorize them, configure safe connection metadata, run bounded health checks, inspect permissions and audit history, and disconnect/revoke access. Automate deterministic setup steps after the user grants the required authorization. Never imply that a provider is connected merely because its metadata or credentials exist.

## Existing implementation to reuse

The current System Hub already exposes authenticated `GET /v1/integrations`, owner-scoped `GET /v1/connections`, Exness Demo connection creation/status/check/account/quotes routes, and a small in-code registry. Reuse this control plane; do not create a second gateway or arbitrary proxy. The current registry lists Supabase Auth, Exness MT5 Demo, NOVA AI Worker (`nova-ai`), and Remote MCP. Exness is the only broker connection flow currently represented by the persisted broker-connection schema.

The current migration constrains `broker_connections` to `provider='exness_mt5'` and `environment='demo'`. Do not insert other broker providers into this table until a separate additive migration, RLS review, uniqueness design, and two-tenant tests are approved.

## Provider onboarding matrix

The provider catalog in `shared/integration-provider-catalog.json` is descriptive metadata, not proof of deployment or authorization.

| Provider | Initial connection method | Initial capability boundary | Current truth |
|---|---|---|---|
| Supabase | Existing project URL + publishable key configured server-side; user signs in with Supabase Auth | Identity/session validation; owner-scoped data | Existing Hub dependency; runtime readiness is checked dynamically |
| Exness MT5 Demo | Existing owner-scoped Bridge → Relay → read-only Proxy → Hub path | Demo account and market-data reads only | Existing adapter path; each connection requires real account verification |
| NOVA AI Worker (`nova-ai`) | Fixed server-owned endpoint | AI analysis only | Matches the existing System Hub registry ID; reachability is not yet checked by registry |
| Remote MCP Worker | Fixed server-owned endpoint | Authenticated allowlisted read-only tools | Listed in current Hub registry; reachability not yet checked by registry |
| GitHub | GitHub App/OAuth authorization, when configured | Repository metadata and explicitly approved repo operations | Planned; not registered as an active Hub provider |
| Google AI Studio / Gemini | Server-side Gemini API credential or supported Google authorization flow | Model inference; no access to user secrets by default | Planned; AI Studio is an authoring surface, not an automatic OAuth integration |
| Cloudflare | Scoped API token or OAuth where supported | Read-only account/Worker diagnostics first | Planned; no token collection in browser chat |
| Netlify | OAuth or scoped access token | Site/deploy metadata and preview diagnostics | Planned; no production deploy permission by default |
| Fly.io Sprites | Provider-supported token flow | Development-environment metadata/operations only | Planned; no production infrastructure authority by default |

## Lifecycle and status semantics

Use explicit states: `discovered`, `unsupported`, `needs_authorization`, `authorization_pending`, `configured`, `reachable`, `authenticated`, `data_verified`, `degraded`, `revocation_pending`, and `disconnected`.

- `configured`: non-secret settings or an authorization reference are saved.
- `reachable`: a bounded request reached the fixed provider endpoint.
- `authenticated`: provider accepted the authorized identity.
- `data_verified`: a provider-specific, owner-scoped read returned valid data.
- A green UI badge must never collapse these states into a generic "Connected".
- Health probes must be read-only, bounded by timeout/rate limit, and safe to retry.

## Full automation workflow

1. Discover providers from a server-owned allowlist; never scan arbitrary URLs or networks.
2. Show the provider, requested scopes, data accessed, environment, and consequences before authorization.
3. Start the provider's official OAuth/consent flow or a dedicated secure credential form. OAuth redirect/callback state must be random, short-lived, single-use, bound to the initiating user/session, and validated against exact redirect URIs.
4. Exchange authorization codes and store refresh/access tokens only in an approved server-side secret custody adapter. Browser and model receive opaque connection IDs and redacted metadata only.
5. Apply deterministic provider-specific setup using fixed API origins and allowlisted operations. Never let the model choose URLs, hosts, scopes, SQL, commands, or permissions.
6. Run bounded health/auth/data verification. Report each verification layer separately with timestamp and sanitized error category.
7. Record immutable or append-only audit events for authorization, scope changes, verification, rotation, disconnect, and revocation. Do not record tokens, passwords, raw provider payloads, or secret-bearing headers.
8. Disconnect by disabling the local connection first, then revoke provider grants/tokens where supported, delete secret references through the approved custody adapter, and record the result. If provider revocation is unavailable, show that limitation instead of claiming full revocation.

## Proposed API surface (contract only; not yet implemented)

Keep the current routes backward compatible. Candidate additions, all behind Supabase session validation and server-side ownership checks:

- `GET /v1/integrations` — allowlisted provider metadata, supported auth methods, capabilities, and current availability.
- `GET /v1/integrations/:providerId/requirements` — non-secret setup requirements and requested scopes.
- `POST /v1/integrations/:providerId/authorization` — create a short-lived, user-bound authorization attempt; return only the official authorization URL and opaque attempt ID.
- `GET /v1/integrations/:providerId/callback` — validate state and complete the server-side code exchange.
- `POST /v1/connections/:connectionId/check` — existing safe verification route; preserve its current contract.
- `GET /v1/connections/:connectionId/audit` — owner-scoped sanitized audit history.
- `POST /v1/connections/:connectionId/disconnect` — disable locally, revoke where supported, and return a structured revocation result.

Do not implement callback/token storage until the secret-custody readiness gates pass. Do not add generic `/proxy?url=`, arbitrary webhook targets, generic command execution, or model-selected OAuth scopes.

## Security invariants

- Authenticate every protected request; fail closed if Supabase Auth cannot be verified.
- Derive user and tenant identity from the verified session, never from request body, URL, model output, or client-supplied headers.
- Enforce ownership in the Hub and RLS in persistence. Cross-tenant IDs must not reveal whether another tenant's resource exists.
- Keep provider origins, OAuth client IDs, redirect URIs, scopes, and adapter operations in server-owned configuration.
- Never place API keys, refresh tokens, passwords, service-role keys, or private customer data in Google AI Studio prompts, frontend bundles, source control, browser storage, or logs.
- Secret custody is not considered ready merely because a secret manager is selected. Require server-only read/write/rotate/revoke tests, idempotency, audit, and tenant-isolation proof before enabling OAuth callbacks that persist customer tokens.
- Default every integration to least privilege. Trading providers remain read-only; `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- No integration may trigger production deploys, DNS changes, billing changes, or destructive infrastructure operations without a separate explicit approval gate.

## Delivery phases and acceptance

### Phase 1 — Registry and contract (this PR)
- Document existing-vs-planned provider truth.
- Add a machine-readable provider catalog and JSON Schema.
- Define lifecycle, automation workflow, security invariants, and proposed API contracts.
- No production credentials, migrations, OAuth callbacks, provider-side mutations, or deployment changes.

### Phase 2 — Hub registry and UI
- Move provider metadata into a tested server-owned registry module.
- Extend the existing authenticated registry response without changing current Exness behavior.
- Add an Integration Center page using real API responses and explicit unavailable states; no mock-success badges.
- Add provider-specific tests and exact-head CI.

### Phase 3 — Secure authorization and custody
- Complete approved server-side secret custody and staging tenant-isolation gates.
- Implement one provider OAuth flow at a time, starting with GitHub or Google identity only after scopes and callback configuration are reviewed.
- Add rotation, disconnect/revocation, audit, replay, CSRF/state, and failure tests.

### Phase 4 — Operations automation
- Add bounded diagnostics and approved setup actions for Cloudflare, Netlify, and Fly.io.
- Keep infrastructure write operations disabled until per-action approval and rollback are implemented.

### Phase 5 — Broker expansion
- Exness Demo remains first and read-only.
- IBKR and CCXT providers require separate isolated adapters and additive schema/RLS reviews.
- No live order capability in this program.

Acceptance requires exact-head CI, schema validation, auth-negative tests, cross-tenant denial tests, secret-redaction tests, OAuth state/replay tests before any callback ships, and a staging end-to-end verification. A documentation/catalog PR is not production readiness.

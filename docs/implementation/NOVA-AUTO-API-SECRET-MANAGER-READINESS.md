# NOVA Auto API Secret Manager — readiness and implementation gate

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Control plane:** existing Cloudflare System Integration Hub  
**Current phase:** Vault privilege verification; customer credential storage remains disabled  
**Safety:** read-only broker integrations only; order submission and Live Trading remain OFF

## 1. Architecture decision

Extend the existing `integrations/system-hub` control plane. Do not create a second gateway or put credential storage in the NOVA AI/chat Worker.

Separate secret custody by purpose:

| Secret class | Intended custody | Boundary |
|---|---|---|
| Platform AI provider key (for example Gemini) | Cloudflare Worker Secret | Deployment-level configuration; never a customer credential |
| Exness MT5 terminal/Bridge credentials | Existing tenant-specific Bridge and private route configuration | Keep local to the assigned tenant Bridge; do not copy into the customer Vault |
| Customer API credentials for a future approved provider | Supabase Vault | Disabled until a dedicated, narrowly scoped server-side access path is verified |

The System Hub remains authoritative for user authentication, connection ownership, provider allowlists, capability checks, and audit correlation. AI and MCP callers never receive credential material.

## 2. Repository baseline

The implementation branch was created from current `main` at:

- `adf022ee198add0b594ced30e9e718e6141aea1c`

An older branch named `feature/voom-auto-api-secret-manager` already existed, but it was 98 commits behind `main` and contained no commits ahead of `main`. It is not used as the implementation base.

Existing architecture decisions are retained:
- The System Hub is the broker/provider control plane.
- Exness MT5 remains on the per-tenant Bridge → Relay → read-only Proxy path.
- IBKR and CCXT exchange adapters remain planned until their own read-only runtime and credential scopes are verified.
- The AI Worker is an authenticated research interface, not a credential store.

## 3. Staging Vault inspection — 2026-10-30

A read-only inspection was performed against the Supabase project used as staging in PR #85. The inspection queried extension metadata and database privilege catalogs only; it did not select secret rows, decrypt values, create credentials, or modify grants.

Observed results:

| Check | Observed result |
|---|---|
| PostgreSQL | 17.11 |
| `supabase_vault` | Installed, version 0.3.1, schema `vault` |
| `vault.secrets` | Present |
| `vault.decrypted_secrets` | Present |
| `anon` schema USAGE | Denied |
| `authenticated` schema USAGE | Denied |
| `service_role` schema USAGE | Granted |
| `service_role` on Vault tables/views | SELECT and DELETE grants observed on `secrets` and `decrypted_secrets` |
| `service_role` Vault functions | EXECUTE grants observed for `create_secret`, `update_secret`, and `_crypto_aead_det_decrypt` |
| Dedicated `nova_secret_manager` role | Not present in the inspected grants/roles |

**Decision: BLOCK credential writes and reads.**

The extension being installed is not sufficient. `service_role` has broad direct access to Vault metadata and the decrypted view. The target design requires a dedicated server-side role/path with narrow function access, no direct access to `vault.decrypted_secrets`, and owner-bound lookup for one connection. Do not place this feature on the existing generic `service_role` path.

The read-only inspection SQL is committed at:
`supabase/verification/secret-vault-readiness.sql`

## 4. Credential acceptance rules

Before a provider can accept credentials, all of the following must be true:

1. The provider and environment are enabled in the server-owned registry.
2. The customer owns the target connection; ownership is resolved from the authenticated session, never supplied by the model or trusted from a client-provided user/tenant ID.
3. The dedicated Vault role has only the minimum function privileges required. It cannot query `vault.secrets` or `vault.decrypted_secrets` directly.
4. The public roles cannot access the Vault schema, tables, views, or credential-returning functions.
5. The access function binds retrieval to the authenticated owner and exact connection reference.
6. Cross-customer retrieval, rotation, revocation, and deletion are tested with two staging users.
7. Secret-bearing inputs, SQL errors, application logs, traces, chat, MCP payloads, audit events, and API responses are verified not to disclose credential material.
8. Rotation and revocation are tested, including stale reference rejection and failure rollback.
9. Provider permission scopes are read-only; trade, withdrawal, transfer, deposit, and other mutation permissions are disabled or rejected.
10. The exact PR head passes CI and security review before the Worker route or provider UI is enabled.

Until every gate passes, the Hub must report a sanitized `credential_vault_unavailable` state. No plaintext or ciphertext credential upload endpoint is enabled in this readiness phase.

## 5. API and storage boundary

The eventual customer credential lifecycle belongs behind the authenticated System Hub. The browser may submit a credential only from a dedicated secure connection form over TLS; never through chat, voice, query parameters, generated UI markup, or MCP tools.

Only opaque secret references and non-secret provider metadata may be exposed to application tables or UI. A secret reference is not itself proof of authority: every use must re-check session, connection ownership, provider, environment, allowed operation, and current connection state.

The following are explicitly out of scope for the first release:
- Generic URL proxying or arbitrary provider host/port selection.
- A browser-accessible Vault endpoint.
- Returning decrypted values to the customer UI, AI model, MCP, logs, traces, audit records, or analytics.
- Reusing `service_role` as the customer credential retrieval identity.
- Exness MT5 terminal password storage in the customer Vault.
- Trade, order placement, position mutation, withdrawal, transfer, or Live Trading functions.

## 6. Local development boundary

`infra/docker-compose.yml` runs the local frontend and MCP stdio development processes only. It must not inject Binance/Bybit API keys or MT5 Bridge tokens into the frontend container.

Cloudflare Workers are developed and deployed from their existing integration directories with Wrangler. Their deployment-level provider secrets are configured in Cloudflare Worker Secrets, not in Compose or frontend `NEXT_PUBLIC_*` variables.

## 7. Next implementation sequence

1. Review the staging Vault privilege snapshot and confirm which existing consumers, if any, rely on `service_role` Vault access.
2. Design a dedicated non-public database role and a restricted server-only access path. Prove how authenticated user identity is bound to the exact connection owner; do not rely on a free-form user ID supplied by the request.
3. Build and test the SQL role/function design in an isolated local database first, including privilege assertions and two-owner isolation tests.
4. Apply the reviewed migration only to staging after approval; run the read-only audit SQL again and Supabase security advisors.
5. Integrate the approved access path into the existing System Hub, then add credential create/use/rotate/revoke APIs with strict size, provider, scope, and audit controls.
6. Run staging two-customer acceptance, secret-leak tests, and exact-SHA PR CI. Only then consider enabling the customer credential UI.
7. Production activation remains a separate approval gate.

No staging grants, secrets, production data, Cloudflare configuration, Worker deployments, broker routes, or trading flags were changed during this readiness step.

## 9. Dedicated Vault access design candidate — 2026-10-31

A separate architecture candidate is documented at `docs/implementation/NOVA-DEDICATED-VAULT-ACCESS-DESIGN.md`. It evaluates the existing System Hub plus a dedicated server-side PostgreSQL login through a cache-disabled Cloudflare Hyperdrive binding and private restricted Vault functions. This does not change the current block on customer Secret reads/writes.

Additional proof gates were identified for the existing Supabase Free plan: Cloudflare's Supabase-specific Hyperdrive guide recommends a direct connection; Supabase documents the Free-plan direct endpoint as IPv6-only. The actual staging project's Cloudflare-to-Supabase network reachability must be tested before any configuration is created. Hyperdrive's transaction pool has a minimum of five origin connections, so connection budgets and session-state assumptions must be tested. Secret/permission/rotation queries require a dedicated `--caching-disabled` binding because Hyperdrive query caching is enabled by default and may serve stale read results.

The candidate design explicitly trusts the existing System Hub as the JWT-verification boundary; the database function does not independently verify the customer's Supabase JWT. That trust assumption and a possible signed internal assertion alternative require security review. No role, grant, SQL migration, Hyperdrive resource, Worker binding, route, secret, or deployment was changed by this design note.

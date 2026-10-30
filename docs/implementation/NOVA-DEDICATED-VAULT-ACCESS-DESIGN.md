# NOVA Dedicated Vault Access — Architecture Decision Candidate

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Target control plane:** Existing Cloudflare Worker `integrations/system-hub`  
**Decision status:** Candidate design for isolated validation; not approved for staging or production  
**Credential lifecycle policy:** `ROTATE_ON_NEXT_USE` (specified separately)  
**Safety:** Customer credential reads/writes remain disabled. Exness MT5 Demo remains read-only.

## 1. Executive decision

Evaluate a **dedicated server-side PostgreSQL login role connected only through a cache-disabled Cloudflare Hyperdrive binding in the existing System Integration Hub**.

The Hub already validates the supplied Supabase bearer token by calling the configured Supabase Auth `/auth/v1/user` endpoint and obtains the authenticated `user.id`. Its current connection metadata reads continue to use the user's own JWT and PostgREST/RLS. The proposed Hyperdrive path is a separate, narrowly scoped server-to-database channel used only for future Vault functions; it must not replace existing Hub auth, metadata access, or MT5 routes.

The database login is a Worker infrastructure credential, not a customer provider credential. It must be held in the Cloudflare-managed Hyperdrive configuration and never exposed to a browser, AI, MCP, or ordinary application environment. The customer provider Secret remains encrypted in Supabase Vault.

**This is a candidate, not a green light to create roles, passwords, Hyperdrive configurations, SQL migrations, or runtime endpoints.** Prove it in an isolated local database first and only then propose a separately approved staging migration.

## 2. Why this candidate

Cloudflare documents direct Supabase Postgres connectivity via Hyperdrive, including connection pooling for Workers. Cloudflare also documents a credential-update path using a new Hyperdrive configuration so a Worker can migrate gradually and retain rollback. This matches the current Cloudflare Worker control-plane architecture without creating another gateway.

Cloudflare Hyperdrive query caching is enabled by default. Its standard cache window is 60 seconds plus up to 15 seconds of stale-while-revalidate; cached reads are not invalidated automatically by later writes. Therefore **all Vault/authorization/rotation calls must use a Hyperdrive binding explicitly configured with query caching disabled**. Do not rely on SQL volatility detection or HTTP `Cache-Control: no-store` as a substitute for disabling the database query cache.

References:
- Cloudflare Supabase integration: https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/
- Cloudflare Hyperdrive PostgreSQL connection: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- Cloudflare Hyperdrive query caching and `--caching-disabled`: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- Cloudflare Hyperdrive database credential rotation: https://developers.cloudflare.com/hyperdrive/configuration/rotate-credentials/
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- Supabase Database Functions security: https://supabase.com/docs/guides/database/functions
- Supabase Postgres roles: https://supabase.com/docs/guides/database/postgres/roles

## 3. Request and trust boundary

Proposed future request path:

1. Customer sends a request to the existing System Hub with the Supabase access token and a connection identifier. The client must not submit a user ID, tenant ID, provider URL, Vault ID, secret version, or database role.
2. The Hub validates the bearer token with Supabase Auth on the configured project origin. Use only the returned authenticated user ID; reject invalid/expired sessions and provider failures.
3. The Hub validates the operation against a server-owned provider allowlist, exact provider/environment, read-only capability, connection ID, request size, and rate limit.
4. The Hub calls a fixed private-schema SQL function through the cache-disabled Hyperdrive binding. The function receives the authenticated user ID obtained by the Hub and the exact connection ID; it re-checks that the owner and connection/provider/environment/status match its registry. The secret reference is resolved server-side, not accepted from the client.
5. The SQL function returns only the material needed to the trusted Worker process. The Hub calls only the fixed provider adapter and immediately redacts/discards credential material after use. It must never return secret material to the client or AI/MCP.
6. The Hub records a sanitized operation result and lifecycle transition. Customer data, credential payloads, encrypted/decrypted values, bearer headers, and provider response bodies must not enter logs, traces, chat, MCP, analytics, or audit output.

**Explicit trust assumption:** Supabase Auth verification occurs in the existing System Hub. The direct PostgreSQL function does not independently verify the Supabase JWT; it trusts the authenticated user ID passed by the trusted Worker. This creates a deliberate Worker-to-database trust boundary. A caller with the Hyperdrive database credential could potentially forge that parameter, so only the Hub may hold the binding, the DB role must have no direct table/view access, the function must be narrowly constrained, and Worker deployment/review is security-critical. If independent database-verifiable end-user identity is required, stop and prove a signed internal assertion or a Supabase-supported JWT-to-role/RLS design before implementation; do not pretend that a free-form `user_id` parameter is cryptographic proof.

## 4. Candidate database role separation

Validate three distinct roles in an isolated PostgreSQL environment before writing any hosted migration:

| Candidate role | Login | Purpose | Permissions |
|---|---:|---|---|
| `nova_vault_api` | Yes | Dedicated Hub/Hyperdrive login | Connect to database, USAGE on private function schema, EXECUTE on the minimum allowlisted functions only |
| `nova_vault_fn_owner` | No | Owner of reviewed restricted functions | Only required registry/connection metadata reads and the minimal Vault function/view access needed by function bodies |
| `nova_vault_migrator` | No / migration-only | Explicitly controlled migration owner if needed | Not used by Worker; never deployed as a runtime credential |

The exact role names/attributes remain subject to local privilege proof. Runtime login must be `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; it must not be a member of `service_role`, `postgres`, or any elevated role. Do not grant runtime login SELECT/INSERT/UPDATE/DELETE on `vault.secrets`, `vault.decrypted_secrets`, `public.user_brokers`, or application tables.

The non-login function owner may need narrowly scoped access to the encrypted Vault API and to exact owner/connection metadata. It must not have LOGIN, SUPERUSER, CREATEDB, CREATEROLE, or BYPASSRLS. It must not own customer tables. Use fixed parameters and static SQL; do not build dynamic table names, SQL fragments, provider URLs, or arbitrary object identifiers from caller input.

A function that uses `SECURITY DEFINER` must be a reviewed exception, not the default. Prefer `SECURITY INVOKER` where possible. If definer rights are essential, the function must:
- Be in a private schema excluded from Supabase Data API exposed schemas.
- Use `SECURITY DEFINER SET search_path = ''`.
- Fully qualify every relation and function.
- Have EXECUTE revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `nova_vault_api`.
- Have schema USAGE granted only to the runtime role that must call it.
- Re-check the exact owner, tenant, connection ID, provider, environment, capability, and status inside the function.
- Return one narrowly scoped secret result only to the private Hub caller; never return a general Vault listing or a decrypted view row set.

Supabase recommends INVOKER by default and requires a safe search path for definer functions. Supabase also documents that function EXECUTE is granted broadly by default unless explicitly revoked. These requirements must be tested as actual privileges, not inferred from SQL source.

## 5. Hyperdrive configuration

Use a dedicated cache-disabled Hyperdrive configuration/binding for all calls that inspect permissions, resolve ownership, read decrypted Secret material, rotate, or update the secret lifecycle state.

- Name the proposed binding `NOVA_VAULT_DB` only after implementation is approved.
- Configure it with `--caching-disabled`; query-cache disablement is a hard acceptance condition, not an optional performance preference.
- Use a dedicated Postgres runtime login, not `service_role`, `postgres`, or a project-owner credential.
- Keep the connection string and password in Cloudflare's managed Hyperdrive configuration. Never put the connection string in Wrangler checked-in vars, Compose, GitHub logs, frontend environment variables, or chat.
- Keep generic Hub/PostgREST metadata reads on the current user-token/RLS path unless a separate reviewed change justifies otherwise.
- Use bounded statements, timeouts, and minimal connection concurrency. Close per-request clients; Hyperdrive owns the underlying pool.
- Do not add a second Worker or second API gateway.

The database password for this infrastructure connection is **not** the customer's provider API key. Rotate it through a controlled infrastructure process. Cloudflare documents creating a new Hyperdrive configuration, deploying the Worker against it gradually, and retaining the old configuration for rollback. This is separate from the customer-facing `ROTATE_ON_NEXT_USE` policy.

## 6. Vault function and metadata contract — conceptual only

A future private schema may expose a small fixed set of function contracts, for example:

- `get_secret_for_connection_use(connection_id, authenticated_user_id, expected_generation, operation_id)`
- `record_secret_use(connection_id, authenticated_user_id, generation, operation_id, sanitized_outcome)`
- `begin_secret_rotation(connection_id, authenticated_user_id, expected_generation, operation_id)`
- `activate_validated_secret_version(connection_id, authenticated_user_id, expected_generation, successor_secret_ref, rotation_operation_id)`
- `revoke_secret_version(connection_id, authenticated_user_id, expected_generation, operation_id)`

These are illustrative names and signatures, not approved SQL or an API contract. A proper design must account for the fact that remote provider rotation is not transactional with Postgres. Use a durable saga/state machine with idempotency, per-connection serialization/lease and fencing tokens, compare-and-set generation changes, recovery/reconciliation after timeout, and fail-closed states. Do not hold a database transaction open while waiting for a provider HTTP call.

Only opaque references and nonsecret metadata belong in ordinary application tables. The registry must bind each Secret reference to the owner/tenant, exact connection, provider, environment, allowed read-only capabilities, generation, status, and rotation policy. It must never accept a client-selected Vault ID as authorization.

## 7. Alternatives considered

| Approach | Assessment |
|---|---|
| Generic `service_role` from the Worker | **Rejected.** The inspected staging grants include broad Vault table/view access and elevated RLS bypass behavior; do not widen the existing service-role pattern. |
| PostgREST using ordinary user JWT + RLS | **Retain for ordinary metadata.** Strong owner context through the existing user session, but a public API function that returns decrypted customer secrets would expose an unsafe surface unless it can distinguish the trusted Hub caller. |
| PostgREST custom `role` JWT claim | **Not approved.** PostgREST supports a JWT role claim and role switching, but the actual hosted Supabase signer, role membership, token issuance and trust boundaries have not been proven for this project. Do not grant a custom role to an authenticator and assume it is safe. |
| Dedicated Hyperdrive DB login + private restricted functions | **Preferred candidate for an isolated proof.** It creates an explicit Worker-only database credential boundary and avoids browser/PostgREST exposure of the private Vault function. It still relies on the Hub as the trusted identity-verification boundary and must be constrained/tested accordingly. |

## 8. Required isolated proof before staging

Create a disposable local PostgreSQL/Vault test environment, never use live customer secrets, and prove all of the following:

1. Runtime role cannot connect to PostgREST/Data API as a customer, cannot select any table or view, and cannot invoke Vault extension functions directly.
2. Runtime role can execute only the specific private functions granted to it.
3. `anon` and `authenticated` cannot USAGE the private schema or EXECUTE the private functions.
4. A normal user cannot choose an owner ID, connection ID, secret reference, provider, or generation to access another owner's secret.
5. User A can use/rotate/revoke only a secret bound to A's exact connection; User A is denied when using User B's connection, even if they know its UUID or secret reference.
6. The function owner is non-login, non-superuser, non-BYPASSRLS, owns no customer tables, and has only the explicitly documented privileges.
7. Function search path is empty; all object references are schema-qualified; there is no dynamic SQL derived from request input.
8. Query caching is disabled for every Vault/auth/permission/lifecycle operation. Tests must fail when the Worker is configured with a cache-enabled Vault binding.
9. Hyperdrive does not expose secret values through logs, errors, query parameters, telemetry, or API responses.
10. `ROTATE_ON_NEXT_USE` success, duplicate idempotency, concurrency, stale generation, provider timeout, rotation failure, successor validation failure, revoke failure, and recovery cases pass with synthetic credentials.
11. An exact PR-head CI run and an independent security review pass. Only after owner approval may a separate PR propose a staging-only role/migration and staging two-customer acceptance.

## 9. Blockers and prohibited actions

- Existing staging evidence shows Vault installed but `service_role` has broad privileges, including direct access to the decrypted view; no dedicated role/path was found. Customer Secret reads/writes therefore remain blocked.
- The legacy `public.user_brokers` credential columns and grants remain a separate latent-risk item from PR #92. Do not query credential rows, assume the table is empty, or drop/migrate the fields in this design step.
- Do not create Hyperdrive resources, configure DB credentials, apply grants, run SQL DDL against hosted Supabase, deploy a Worker, enable a route, or collect customer credentials in this PR.
- No customer API credential or DB password may be committed or disclosed.
- Exness MT5 terminal/Bridge credentials remain in the per-tenant Bridge boundary, not this customer Vault.
- No order, trade, position mutation, withdrawal, transfer, deposit or Live Trading capability is part of this system.

## 10. Completion status

This document is an architecture candidate with a test plan. It is not proof that dedicated Vault access works. The next implementation item is a disposable local proof of role grants, function ownership, owner-binding, and Hyperdrive no-cache configuration. Staging remains blocked until that proof is reviewed and separately approved.

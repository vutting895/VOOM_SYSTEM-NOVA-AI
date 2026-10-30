# NOVA Vault Local Isolation Proof

This project is a **disposable, local-only proof harness** for the candidate dedicated Vault access boundary. It is deliberately separate from the repository's canonical Supabase migrations and from every deployed Worker.

## What this proves

- A dedicated runtime login role has no direct access to vault.secrets or vault.decrypted_secrets.
- A non-login function owner has SELECT on the decrypted view and EXECUTE on only the internal decrypt helper required by that view.
- The runtime role can execute one fixed function in a non-exposed private schema.
- anon, authenticated, and service_role cannot call that function.
- The function owner receives EXECUTE on exactly the Vault decrypt helper that the decrypted_secrets view calls; it does not receive Vault base-table reads or unrelated Vault functions.
- The runtime login receives no direct EXECUTE on Vault extension functions.
- The function binds the supplied authenticated owner, tenant, connection, provider, environment, generation, and READY state to one exact secret.
- Two synthetic customer fixtures cannot cross-read each other's connection.
- The function has SECURITY DEFINER with an empty search_path.

## Run locally

Requirements: Docker-compatible container runtime, Node.js 20+, and the Supabase CLI.

From this directory, run these commands:

    supabase start
    supabase db reset --local --yes
    supabase test db --local
    supabase stop

The project uses its own supabase/config.toml, a non-default local database port, PostgreSQL 17, and only migrations under this directory. Do not run supabase link, supabase db push --linked, or copy hosted credentials into this project.

## Safety boundary

- All credential-like values in the migration are synthetic test fixtures and are not valid provider credentials.
- The local stack must never be exposed to a public network.
- No Supabase project reference, API token, service-role key, database password, Cloudflare token, Hyperdrive connection string, or customer secret is needed.
- This directory is not included in the canonical supabase/migrations path.
- It does not create a production migration, change hosted grants, configure Hyperdrive, add a System Hub route, accept customer credentials, or deploy a Worker.
- Exness MT5 remains on its existing per-tenant Bridge path. Order submission and Live Trading remain disabled.

## Supabase-managed service_role limitation

Supabase-managed Vault objects can be owned by supabase_admin. The project postgres role cannot revoke grants made by that object owner. Standard Supabase Vault setup grants service_role Vault schema usage, SELECT/DELETE on Vault tables/views, and EXECUTE on the internal decrypt function. This proof therefore **does not claim that service_role has been stripped of its platform-managed Vault access**.

The acceptance boundary proved here is narrower and explicit: nova_vault_api is not a member of service_role, receives no direct Vault schema/table/view privileges, and can invoke only the private accessor; anon, authenticated, and PUBLIC have no direct access in this isolated local setup. service_role cannot execute the new private accessor. Do not use service_role as the customer-secret consumer or expose the vault schema through the Data API.

If the security requirement is that even a privileged service_role key must be unable to read any Vault secret, Supabase Vault is not sufficient as the sole custody boundary under these platform-managed grants. Stop and evaluate a separate approved secret store rather than attempting unsupported revokes or claiming the grants were removed.

The migration runner receives explicit SET-only membership to the function-owner and runtime roles inside this disposable database so pgTAP can exercise the real effective privileges. These grants are local test scaffolding only and must not be copied into a hosted migration.

## Signed identity assertion — local cryptographic proof only

The second disposable migration and pgTAP suite evaluate a candidate HMAC-SHA-256 assertion verifier. The local fixture uses a synthetic 32-byte key and tests:

- The fixed 15-field UTF-8 canonical message used by both Worker Web Crypto and PostgreSQL pgcrypto, with a cross-runtime known-answer vector.
- Fixed protocol version, issuer, audience, key ID, owner, tenant, connection, provider, environment, read-only capability, generation, operation ID, nonce, issued-at and expires-at claims.
- Customer A/B fixture isolation, claim tampering, wrong audience, expired/future assertions, invalid MAC, stale generation and duplicate nonce rejection.
- Runtime-role denial for the unsigned owner-parameter accessor, direct reads of the verifier-key registry/replay table, and direct access to HMAC extension functions.

This only proves the SQL verifier candidate in a disposable local database. It does **not** prove the actual System Hub creates claims from a verified Supabase session, that a deployed Worker holds a properly provisioned signer key, or that the current application has a canonical tenant registry. The proof currently requires a non-null tenant UUID in its synthetic fixture, while the architecture candidate allows an empty tenant slot only after an explicit owner-only schema decision. Do not carry this fixture parameter shape into the runtime until the real schema and claim contract are verified.

The replay guard now enforces uniqueness for both key_id + nonce and key_id + operation_id. A repeated logical operation with a fresh nonce is rejected locally, so nonce rotation cannot bypass the operation replay constraint. This is a fail-closed duplicate guard, **not a complete idempotency implementation**: it does not return a previously stored sanitized result or reconcile an ambiguous provider outcome. The System Hub still needs a durable operation journal keyed by operation_id, request fingerprint binding, concurrency-safe claim/complete/unknown transitions, and provider outcome reconciliation before any provider call is enabled.

The HMAC verifier is symmetric: compromise of the Worker signing environment can mint assertions. Supabase-managed service_role Vault grants also remain a privileged boundary. This design does not protect against those compromises; evaluate a separate secret-custody service if that is outside the accepted threat model.

This proof therefore does not authorize customer Secret reads/writes, staging grants, Hyperdrive creation, or production activation. Actual cache-disabled Hyperdrive configuration, System Hub session-to-owner resolution, Worker signer/verifier key provisioning, sanitized audit/log/trace integration, provider-aware rotation/revoke, independent security review, and staging-only A/B acceptance remain separate gates.

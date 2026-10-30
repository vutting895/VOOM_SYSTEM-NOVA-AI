# NOVA Vault Local Isolation Proof

This project is a **disposable, local-only proof harness** for the candidate dedicated Vault access boundary. It is deliberately separate from the repository's canonical Supabase migrations and from every deployed Worker.

## What this proves

- A dedicated runtime login role has no direct access to vault.secrets or vault.decrypted_secrets.
- A non-login function owner has SELECT on the decrypted view and EXECUTE on only the internal decrypt helper required by that view.
- The runtime role can execute one fixed function in a non-exposed private schema.
- anon, authenticated, and service_role cannot call that function.
- The function owner receives EXECUTE on exactly the Vault decrypt helper that the `decrypted_secrets` view calls; it does not receive Vault base-table reads or unrelated Vault functions.
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

Supabase-managed Vault objects can be owned by `supabase_admin`. The project `postgres` role cannot revoke grants made by that object owner. Standard Supabase Vault setup grants `service_role` Vault schema usage, SELECT/DELETE on Vault tables/views, and EXECUTE on the internal decrypt function. This proof therefore **does not claim that `service_role` has been stripped of its platform-managed Vault access**.

The acceptance boundary proved here is narrower and explicit: `nova_vault_api` is not a member of `service_role`, receives no direct Vault schema/table/view privileges, and can invoke only the private accessor; `anon`, `authenticated`, and PUBLIC have no direct access in this isolated local setup. `service_role` cannot execute the new private accessor. Do not use `service_role` as the customer-secret consumer or expose the `vault` schema through the Data API.

If the security requirement is that even a privileged `service_role` key must be unable to read any Vault secret, Supabase Vault is not sufficient as the sole custody boundary under these platform-managed grants. Stop and evaluate a separate approved secret store rather than attempting unsupported revokes or claiming the grants were removed.


- The migration runner receives explicit SET-only membership to the function-owner and runtime roles inside this disposable database so pgTAP can exercise the real effective privileges. These grants are local test scaffolding only and must not be copied into a hosted migration.

## Important unresolved identity boundary

The SQL function accepts an owner and tenant identity supplied by its trusted caller. PostgreSQL can prove that those values match the registered connection; this local proof **cannot prove that an arbitrary caller is entitled to assert those identity values**. The System Hub must establish that identity from the verified Supabase session, and a separate security review must decide whether a signed, short-lived internal assertion or another cryptographically verifiable binding is required before staging.

This proof therefore does not authorize customer Secret reads/writes, staging grants, Hyperdrive creation, or production activation. Hyperdrive cache-disabled configuration, actual Supabase Free-plan connectivity, Worker authorization, rotation, revocation, and independent two-user staging acceptance remain separate gates.

## Signed identity assertion proof

A second local-only migration and pgTAP suite now exercise a candidate HMAC-SHA-256 assertion path. The disposable migration creates one synthetic verifier key in Supabase Vault, maps a fixed key ID to that secret, and grants the non-login function owner the HMAC primitive. The runtime role can call only the signed accessor; it cannot read the verifier-key registry, nonce replay registry, Vault view, or HMAC helper directly.

The signed assertion binds a fixed issuer and audience, version, key ID, owner, tenant, connection, provider, environment, read-only capability, secret generation, operation ID, nonce, and a 60-second maximum validity window. PostgreSQL reconstructs the canonical message, verifies the MAC, consumes the nonce once, and re-checks the current connection binding before returning the synthetic Secret to the trusted test caller. The test suite compares only hashes.

The HMAC key in the migration and test file is explicitly synthetic and local-only. It is not a deployable credential. The test does not provision a Cloudflare Worker Secret, a staging key, a customer credential, or a hosted Vault key. Cross-runtime Cloudflare Web Crypto known-answer equivalence, staging tenant mapping, Worker integration, Hyperdrive, rotation and revocation remain separate gates.

# NOVA Vault Local Isolation Proof

This project is a **disposable, local-only proof harness** for the candidate dedicated Vault access boundary. It is deliberately separate from the repository's canonical Supabase migrations and from every deployed Worker.

## What this proves

- A dedicated runtime login role has no direct access to vault.secrets or vault.decrypted_secrets.
- A non-login function owner has only the read privilege required by the proof function.
- The runtime role can execute one fixed function in a non-exposed private schema.
- anon, authenticated, and service_role cannot call that function.
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


- The migration runner receives explicit SET-only membership to the function-owner and runtime roles inside this disposable database so pgTAP can exercise the real effective privileges. These grants are local test scaffolding only and must not be copied into a hosted migration.

## Important unresolved identity boundary

The SQL function accepts an owner and tenant identity supplied by its trusted caller. PostgreSQL can prove that those values match the registered connection; this local proof **cannot prove that an arbitrary caller is entitled to assert those identity values**. The System Hub must establish that identity from the verified Supabase session, and a separate security review must decide whether a signed, short-lived internal assertion or another cryptographically verifiable binding is required before staging.

This proof therefore does not authorize customer Secret reads/writes, staging grants, Hyperdrive creation, or production activation. Hyperdrive cache-disabled configuration, actual Supabase Free-plan connectivity, Worker authorization, rotation, revocation, and independent two-user staging acceptance remain separate gates.

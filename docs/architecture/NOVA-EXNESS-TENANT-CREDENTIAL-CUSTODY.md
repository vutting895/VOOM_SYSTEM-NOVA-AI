# NOVA Exness Tenant Credential Custody — staging design gate

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Implementation boundary:** existing Cloudflare System Integration Hub  
**Target account metadata:** Exness Demo account ID `434426987` (metadata only; not a credential)  
**Current state:** design proposal; no credentials stored, no staging DDL applied, no Worker deployed.

## 1. Decision from staging evidence

The approved staging project is `rovhmjeowracayicbqij` (identified by merged PR #85). A read-only inspection on 2026-10-31 found:

- PostgreSQL 17.11 and `supabase_vault` are present.
- `anon` and `authenticated` do not have Vault schema USAGE.
- `service_role` has Vault schema USAGE, SELECT and DELETE on both `vault.secrets` and `vault.decrypted_secrets`, plus EXECUTE on Vault crypto/create/update functions.
- No `nova_secret_manager` role exists.
- `public.broker_connections` has owner-scoped SELECT and insert-own-pending policies. It currently has no Exness account ID column.
- `public.user_brokers` is a legacy table with credential-named columns; RLS is enabled but the staging advisor reports no policy for it. No rows were read.

**Vault is not an acceptable customer-key store in the current state.** A role or Worker path that can read `vault.decrypted_secrets` would defeat tenant confidentiality. Do not write Exness API credentials to Vault while this privilege model remains.

## 2. Custody architecture

Keep the existing System Hub as the only broker control plane. Do not add another public Worker or a generic URL proxy.

Use a `TenantCredentialProvider` interface behind the Hub with these operations only:

- `create(connectionId, provider, environment, credentialEnvelope)`
- `withCredential(connectionId, provider, environment, callback)`
- `rotate(connectionId, credentialEnvelope)`
- `revoke(connectionId)`

The provider must bind every operation to the authenticated Supabase user resolved by the Hub, the exact connection UUID, provider `exness_trader_api`, and environment `demo`. The request body must never supply an authoritative `user_id` or tenant ID.

### Storage and cryptography requirements

- Prefer a dedicated KMS/HSM-backed envelope-encryption provider with tenant/connection-scoped key handles.
- Persist only ciphertext, nonce, wrapped data-encryption key, key version, algorithm identifier, opaque secret reference, owner UUID, connection UUID, provider and environment in a non-exposed schema.
- Use a fresh random data-encryption key per connection; authenticated encryption must bind `owner_id | connection_id | provider | environment | key_version` as associated data.
- The plaintext Exness API key and Ed25519 private key exist only in Hub memory for the single signed request and are zeroized/discarded as far as the runtime permits.
- Never return plaintext or ciphertext to browser UI, AI/MCP, logs, traces, analytics, error messages or audit payloads.
- The browser credential form must POST directly over TLS to a dedicated Hub endpoint; never accept credentials through chat, voice, query parameters, generated markup or MCP.
- Keep provider scopes read-only. Reject trade, order, withdrawal, transfer, deposit and mutation scopes.

A single shared Worker secret containing a customer's Exness private key is prohibited. A shared encryption root key is not an approved substitute for a tenant KMS: if a staging-only software KEK is used for a proof-of-concept, it must be explicitly isolated to staging, wrapped around per-connection DEKs, versioned, and treated as a temporary test provider—not production custody.

## 3. Staging implementation sequence

1. Inventory every database, Worker and repository consumer of Vault and legacy `user_brokers` before changing grants or tables.
2. Choose and configure a staging-only KMS/provider. No customer or production key is used in this stage.
3. Add a non-exposed credential-envelope table and a narrow server-only provider adapter. Do not reuse `service_role` as a decrypting identity.
4. Add `exness_account_id` as non-secret metadata to the owner-scoped `broker_connections` record; validate decimal uint64 format and bind it to the same connection as the secret reference.
5. Add Hub endpoints to provision metadata and credentials, verify a connection, rotate and revoke. Every endpoint must authenticate first, then re-read the connection using the authenticated owner.
6. Wire the isolated `exness-api.js` client to the provider only after the custody tests pass.
7. Keep the existing MT5 Bridge route as rollback until API read verification and tenant isolation both pass.

## 4. Required tests (synthetic credentials only)

- Owner A can provision/read only Owner A's connection; Owner B receives a non-enumerating denial for A's connection.
- Swapping owner UUID, connection UUID, provider, environment, nonce, ciphertext or wrapped DEK fails authentication/decryption.
- A credential reference cannot be replayed against another connection or tenant.
- Anonymous and authenticated browser roles cannot select or mutate the credential-envelope table.
- The Hub service identity can fetch ciphertext but cannot bypass the tenant/connection binding.
- Plaintext API key/private key never appear in responses, logs, traces, errors, audit events or AI/MCP payloads.
- Rotation invalidates the previous envelope; revocation blocks subsequent provider calls; failed rotation leaves the previous active version intact.
- Exness adapter calls only signed GET routes; account ID returned by Gateway and account snapshot must exactly equal the owner-bound metadata.
- Capability contract remains `orderSubmission=false`, `tradeMutation=false`, `withdrawal=false`, `transfer=false`, `liveTradingEnabled=false`.

## 5. Account identity and verification state

The supplied account ID `434426987` is a target identifier only. It is not evidence of ownership or successful authentication.

Use these states:

`not_configured -> credential_pending -> verifying -> reachable -> authenticated -> data_verified`

Only set `data_verified` after all of the following are true:

1. Authenticated owner is authorized for the exact connection.
2. Tenant credential provider successfully returns the credential for that connection.
3. Signed Gateway discovery succeeds and returns account ID `434426987`.
4. Signed Access Point account snapshot succeeds and returns the same account ID.
5. The returned environment is confirmed as Demo.
6. Sanitized account metadata is persisted with a verification timestamp.

Any mismatch or upstream failure returns a sanitized failure state and keeps `data_verified=false`.

## 6. Explicit non-actions

This design commit does not:
- create, read or write any Vault secret;
- change staging database grants, tables, RLS or data;
- add the supplied account ID to a customer row without its authenticated owner/connection reference;
- accept or store the API key or private key;
- deploy or modify Cloudflare Workers;
- call Exness with real credentials;
- change, disable or remove the existing MT5 Bridge;
- enable order submission or Live Trading.

## 7. Gate to implementation

Before a staging migration or Worker wiring PR, require a reviewed provider choice, staging-only key provisioning outside chat, exact SQL privilege assertions, two-customer isolation tests, secret-leak tests, Supabase security advisors, and exact-head GitHub CI. Production activation is a separate approval.

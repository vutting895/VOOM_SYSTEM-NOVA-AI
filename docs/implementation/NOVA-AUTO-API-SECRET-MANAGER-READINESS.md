# NOVA Auto API Secret Manager — readiness and implementation gate

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Control plane:** existing Cloudflare System Integration Hub  
**Current phase:** Separate Secret Custody Plane P0 assessment; customer credential storage remains disabled  
**Architecture authority:** Draft PR #130 — Option C, Separate Secret Custody Plane  
**Safety:** read-only broker integrations only; order submission and Live Trading remain OFF

> **Superseding decision:** The Supabase Vault customer-credential storage target recorded in this historical readiness document is superseded by the owner-selected Option C in PR #130. Supabase Vault and Hyperdrive are not the target customer credential custody runtime. Do not implement, extend, or activate a Supabase Vault customer-secret path. This document preserves the prior inspection evidence and operational boundaries while routing future customer credential work to the separately reviewed custody plane.

## 1. Current architecture decision

Extend the existing `integrations/system-hub` control plane for customer-facing orchestration. Do not create a second gateway or put credential storage in the NOVA AI/chat Worker.

Separate secret custody by purpose:

| Secret class | Intended custody | Boundary |
|---|---|---|
| Platform AI provider key (for example Gemini) | Cloudflare Worker Secret | Deployment-level configuration; never a customer credential |
| Exness MT5 terminal/Bridge credentials | Existing tenant-specific Bridge and private route configuration | Keep local to the assigned tenant Bridge; do not copy into the customer credential custody plane |
| Customer API credentials for a future approved provider | Dedicated Secret Custody Plane under Option C | Custodian owns intake, encryption, decryption, provider use, lifecycle, operation ledger and audit; Supabase stores metadata and opaque reference only |

The System Hub remains the control plane for user-facing orchestration, provider allowlists, capability checks and audit correlation. It must not receive plaintext customer credentials, custody master keys, custodian database credentials or bulk secret-read capability. The custodian independently validates the customer session and owner/connection binding. AI and MCP callers never receive credential material.

The GCP candidate assessment is tracked in `docs/implementation/NOVA-SECRET-CUSTODY-GCP-P0-READINESS.md`. No provider, project, region, billing account, runtime or deployment is approved by that assessment.

## 2. Repository baseline and retained architecture

The original implementation branch was based on an earlier `main` commit. Its Vault implementation direction is historical and must not be used as the base for a new customer credential runtime.

Existing architecture decisions are retained:
- The System Hub is the broker/provider control plane.
- Exness MT5 remains on the per-tenant Bridge → Relay → read-only Proxy path.
- IBKR and CCXT exchange adapters remain planned until their own read-only runtime and credential scopes are verified.
- The AI Worker is an authenticated research interface, not a credential store.
- No second gateway, shared secret cache, or general-purpose credential proxy is permitted.

## 3. Historical staging Vault inspection — 2026-10-30

A read-only inspection was performed against the Supabase project used as staging in PR #85. The inspection queried extension metadata and database privilege catalogs only; it did not select secret rows, decrypt values, create credentials, or modify grants.

Observed historical results:

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

**Historical conclusion:** this snapshot did not establish a safe narrow Vault access path. The broad `service_role` access was a blocker for that candidate. It is retained as evidence only; it is not a reason to build another Supabase Vault role under the superseded design.

The read-only inspection SQL remains at:
`supabase/verification/secret-vault-readiness.sql`

Do not run it against production or use it to justify enabling customer credential writes.

## 4. Current customer credential acceptance rules

Before any provider can accept customer credentials, all of the following must be true:

1. The separate custody provider/project/security boundary is explicitly selected and reviewed.
2. The custodian independently validates the expected customer Supabase session and derives the authenticated subject; it does not trust client/model-supplied owner, tenant, provider, environment or custody identifiers.
3. The custodian resolves the exact connection through a verified user-scoped metadata path and reconciles it with a custodian-owned binding registry.
4. Workload identity/mTLS between the System Hub and custodian is proven; no static shared API key or long-lived service-account key is used as the production trust anchor.
5. KMS/HSM key-use permissions are isolated from deployer, database, support and ordinary application identities.
6. Credential ciphertext uses envelope encryption and immutable AAD binding owner, connection, provider, environment and generation.
7. The custodian owns the durable operation ledger, idempotency, leases/fencing, rotation, revocation and ambiguous-outcome reconciliation.
8. Cross-customer retrieval, replay, rotation, revocation, key rotation and secret-leak behavior are tested using synthetic data and isolated staging users.
9. Provider permission scopes are read-only; trade, order, withdrawal, transfer, deposit and other mutation permissions are denied server-side.
10. The exact PR head passes CI and independent security review. Staging and production activation each require separate approval.

Until every gate passes, the Hub must report a sanitized custody-unavailable state. No plaintext or ciphertext customer credential intake endpoint is enabled.

## 5. API and storage boundary

The proposed API/data contract is documented in PR #130 at `docs/architecture/NOVA-SECRET-CUSTODY-API-DATA-CONTRACT.md`. It is a proposal only; no endpoint or schema is implemented by that document.

- Customer credential intake must go directly from the secure connection form to the custodian over TLS.
- The System Hub, AI Worker, MCP server, analytics and browser storage must never receive or persist plaintext credentials.
- Supabase may hold non-secret connection metadata, lifecycle display state and an opaque `custody_ref` only.
- The custodian returns sanitized business results, never a credential, ciphertext, wrapped DEK, provider authorization header or generic upstream response.
- No arbitrary URL proxying, caller-selected provider host, arbitrary HTTP method or caller-controlled authorization policy is allowed.
- All secret-bearing responses use `Cache-Control: no-store` and `Pragma: no-cache`; intermediary, application and database-query caching of custody operations is prohibited.
- Exness MT5 terminal password storage is not part of this customer API credential custody plane.
- Trade, order placement, position mutation, withdrawal, transfer and Live Trading functions remain out of scope.

## 6. Local development and platform secret boundary

`infra/docker-compose.yml` runs the local frontend and MCP stdio development processes only. It must not inject Binance/Bybit API keys or MT5 Bridge tokens into the frontend container.

Cloudflare Workers are developed and deployed from their existing integration directories with Wrangler. Platform-level provider credentials are configured as Cloudflare Worker Secrets for the Worker that consumes them, not in Compose or frontend `NEXT_PUBLIC_*` variables.

Future customer-owned provider credentials belong only in the approved separate Secret Custody Plane. Do not use Supabase Vault, Hyperdrive, System Hub Worker secrets, MCP payloads, or AI memory as a fallback customer-secret store.

## 7. Next implementation sequence

1. Review Draft PR #130 (Option C) and its API contract/threat model; reconcile any remaining legacy Vault documentation.
2. Complete the GCP P0 readiness assessment, including dedicated project boundary, Bangkok/Singapore region trade-offs, Cloudflare-to-GCP workload identity/mTLS proof and a concrete monthly spend ceiling.
3. Obtain explicit approval for project creation, billing account, region, budget and minimum API enablement.
4. Provision only isolated synthetic-only resources after approval; keep customer routes disabled.
5. Implement the custodian API, registry, envelope encryption and durable operation ledger on a feature branch with synthetic-only contract tests.
6. Complete independent security review and staging two-customer acceptance before any real credential migration or intake.
7. Production activation remains a separate approval gate.

No staging grants, customer secrets, production data, Cloudflare configuration, Worker deployments, broker routes or trading flags are changed by this documentation update.

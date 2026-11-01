# NOVA Separate Secret Custody — Architecture Decision Record

**Decision:** Option C — Separate Secret Custody Plane  
**Decision date:** 2026-10-31  
**Decision owner:** Repository owner  
**Status:** Direction selected; architecture proposal for review. Provider, account, region, and runtime remain unselected.  
**Repository baseline at reconciliation:** `main` at `99d474038e19a6eab884c5c891b21770c50fefa5` (2026-11-01)  
**Scope:** Customer-owned third-party API credentials only. Exness MT5 Windows Bridge credentials remain in their existing per-tenant Bridge boundary.

## 1. Decision

NOVA will use a dedicated Secret Custody Plane in a separate cloud account/project and security boundary from the Supabase project and the existing System Hub.

The custodian—not Supabase, the System Hub, an AI Worker, MCP server, browser, or a generic application role—will own customer credential intake, encrypted storage, decryption, provider-adapter use, rotation, revocation, durable operation outcomes, reconciliation, and custody audit metadata.

Supabase remains the identity and product metadata plane. Its ordinary tables may contain a non-secret opaque `custody_ref`, connection metadata, lifecycle display state, and timestamps. A compromise of Supabase `service_role`, the database, or the System Hub must not by itself enable decryption or bulk retrieval of customer credentials.

The existing System Hub remains the customer-facing control plane and policy orchestrator. It must not receive custody master keys, custodian database credentials, plaintext customer credentials, or bulk secret-read capability. The custodian independently verifies the customer session and resolves the owner/connection binding against its own registry before acting.

This ADR does **not** select AWS, Google Cloud, HashiCorp, or any other vendor. It does not authorize account/project creation, billing, KMS/HSM provisioning, credentials migration, endpoint activation, staging testing, or production deployment.

## 2. Context and security objective

The previous PR #105 candidate placed encrypted customer credentials in Supabase Vault and proposed a restricted database login through cache-disabled Hyperdrive. PR #112 adds a disposable local proof of database grants and tenant-style fixture isolation. Those are useful historical database privilege tests, but they do not create an independent custody boundary: they remain inside the Supabase project/security administration boundary.

The selected threat objective is stronger:

> Compromise of the Supabase database or its service-role credential alone must not be sufficient to decrypt, retrieve, rotate, or invoke a customer's provider credential.

A symmetric signer shared by the System Hub and database is also not an acceptable production trust anchor. The production target uses separate workload identity, independent customer-session validation, custodian-owned binding registry, and asymmetric assertions only as an additional constrained context signal.

## 3. Target architecture and trust boundaries

```text
Customer browser
  | Supabase access token (never persisted in browser storage by custody UI)
  | direct TLS credential intake; no analytics or request-body logging
  v
Separate Secret Custody API / Plane
  |-- independently validates Supabase session (no service_role)
  |-- resolves canonical owner + connection through user-scoped metadata
  |-- verifies custodian-owned binding registry
  |-- envelope encrypts credential version
  |-- executes allowlisted provider read operation inside custody boundary
  |-- durable operation ledger / reconciliation / audit
  |
  +--> KMS/HSM boundary (KEK wrapping + asymmetric signing/verification)
  |
  +--> Provider APIs (fixed allowlist, read-only scopes in initial release)

NOVA System Hub (control plane)
  | workload identity + mTLS
  | short-lived customer authorization context + forwarded customer session
  | never receives plaintext credential or custody key
  v
Custody API (bounded operation request / sanitized result)

Supabase (metadata only)
  | user/profile/connection metadata and opaque custody_ref
  | no customer credential, DEK, KEK, signing private key, or decrypted view
```

### 3.1 Independent customer authentication

- The custodian independently validates the presented Supabase access token with the configured Supabase Auth endpoint and obtains the authenticated subject from the Auth response.
- Use only the Supabase publishable/anon client key needed for the Auth API; do not use or store Supabase `service_role` in the custodian.
- The custodian resolves the exact connection using a user-scoped Supabase request/RLS path, or an equivalently verified metadata assertion whose issuer and binding logic have been security-reviewed.
- Client-supplied `user_id`, `tenant_id`, owner, provider, environment, secret reference, or generation is never authorization evidence.
- Existing inspected schema uses `broker_connections.user_id`; no canonical `tenant_id` mapping has been established. Use the authenticated owner ID as the verified principal. Do not invent a tenant ID or equate user and tenant silently. Add tenant binding only after a canonical tenant registry and migration are verified.
- Every custody binding is independently registered to an authenticated principal, a validated connection ID, exact provider, exact environment, allowed capabilities, and credential generation.

### 3.2 Workload identity and internal assertions

- Hub-to-custodian calls require a distinct workload identity and mutually authenticated TLS. Network location, CORS, a shared static API key, or an opaque connection UUID is not a substitute.
- Where an internal signed context is used, prefer an asymmetric signature. The private signing key remains non-exportable in a separate KMS/HSM boundary; the custodian verifies with a pinned/rotatable public key.
- Assertions bind issuer, audience, subject, connection, provider, environment, capability, operation ID, request digest, issue/expiry time, and unique token ID. Maximum lifetime is 60 seconds, with bounded clock skew and replay protection.
- An assertion is not a replacement for independently validating the customer session or checking the custodian registry. A compromised Hub must not be able to use a mismatched assertion subject to access another customer's binding.
- The signing authorization path must be constrained to a verified session and server-resolved connection. A general-purpose KMS Sign permission available to arbitrary Hub code is not sufficient by itself.

### 3.3 Custody boundary

- Plaintext credential material exists only transiently in the customer submission process and inside the custodian process/provider adapter that needs it.
- Prefer executing provider requests inside the custody plane. The custodian returns a bounded, sanitized business result—not a credential, decrypted secret, provider authorization header, or generic proxy response.
- The custodian must not implement arbitrary URL fetch, arbitrary HTTP method, arbitrary header, or caller-selected provider endpoint capabilities.
- Provider adapters use fixed host allowlists, strict TLS validation, bounded response sizes/timeouts, schema validation, and capability allowlists.

## 4. Encryption, key hierarchy, and binding

Use envelope encryption:

1. Generate a fresh cryptographically random data-encryption key (DEK) for each credential version.
2. Encrypt the credential with an approved AEAD suite (initial candidate: AES-256-GCM, subject to provider/runtime review) using a unique nonce per DEK and full authentication-tag verification.
3. Wrap the DEK using a KMS/HSM-protected key-encryption key (KEK). Keep KEK material non-exportable and outside the application database.
4. Store ciphertext, nonce, tag, wrapped DEK, key/version identifiers, algorithm metadata, and immutable associated-data version in the custodian's private datastore.
5. Decrypt only in the custody process after authentication, authorization, operation-ledger reservation, and binding checks. Zeroize/release transient buffers on a best-effort basis; never log them.

Associated authenticated data (AAD) must canonically bind at least:

- custody schema/version;
- custody binding ID;
- authenticated owner/principal ID;
- canonical tenant ID when and only when one is established;
- connection ID;
- provider;
- environment;
- credential type/scope class;
- credential generation.

The AAD encoding must use a fixed field order, normalized UUIDs/enums and unambiguous length-prefixing or canonical serialization. Rebinding an owner, tenant, provider, environment, connection, or generation must fail authentication. A legitimate migration/rebinding must be an explicit audited re-encryption operation—not an in-place metadata edit.

Do not store plaintext secrets, DEKs, KEKs, private signing keys, or reversible credential payloads in Supabase, GitHub, logs, traces, metrics labels, CI artifacts, browser local/session storage, AI prompts/checkpoints, MCP payloads, analytics, or support tickets.

## 5. Durable operation and credential lifecycle

Provider operations are external side effects and cannot be assumed transactionally atomic with the custodian database. The custodian owns a durable operation ledger and per-binding concurrency control.

### 5.1 Idempotency

- Every logical request has a server-scoped operation ID and caller-supplied idempotency key scoped to principal + binding + operation type.
- Persist a keyed request fingerprint; do not persist the credential-bearing request body. Use a KMS-protected fingerprint key or equivalent keyed construction so low-entropy credentials cannot be tested against a plain hash.
- Same idempotency key + same fingerprint returns the same stored sanitized terminal result, or the current pending/unknown state.
- Same idempotency key + different fingerprint returns `409 IDEMPOTENCY_CONFLICT`.
- A duplicate request must not launch another provider operation while the first is pending, executing, or ambiguous.

### 5.2 Unknown provider outcome

- A timeout or connection loss after a request may have reached the provider is `OUTCOME_UNKNOWN`, not a normal failure.
- Do not blindly retry an ambiguous operation. Reconcile using provider-supported idempotency keys, operation/reference IDs, or a provider-specific read-after-write query.
- If the provider cannot establish the outcome safely, retain `OUTCOME_UNKNOWN`, block conflicting mutation/lifecycle transitions, and require controlled/manual reconciliation.
- Store sanitized results for durable replay. Provider raw bodies, authorization headers, and credentials are never saved in the result ledger.
- Use a lease plus monotonically increasing fencing token per binding. A stale worker cannot commit a lifecycle transition after a newer owner has acquired the lease.

### 5.3 Lifecycle state machine

Minimum credential states:

`PENDING_INTAKE -> VALIDATING -> ACTIVE -> ROTATION_PENDING -> SUCCESSOR_VALIDATING -> ACTIVE`

Failure/recovery states include `VALIDATION_FAILED`, `ROTATION_UNKNOWN`, `REVOKE_PENDING`, `REVOKE_UNKNOWN`, `REVOKED`, `COMPROMISED`, and `DISABLED`.

- Never retire the current version until a successor is validated and an atomic generation compare-and-set succeeds.
- Rotation/revocation calls use the same durable operation ledger, leases, fencing, and reconciliation semantics.
- Preserve the existing `ROTATE_ON_NEXT_USE` policy as a candidate lifecycle policy, but do not enable it until the provider adapter and ambiguity recovery are proven.
- If custody or provider state cannot be established, fail closed: no credential use, no silent fallback, no downgrade to Supabase Vault, and no order execution.

## 6. Supabase and System Hub responsibilities

| Component | Allowed responsibility | Explicitly prohibited |
|---|---|---|
| Supabase Auth | Authenticate users and issue sessions | Custody decryption authority |
| Supabase Postgres | Profiles, connections, preferences, opaque `custody_ref`, non-secret lifecycle display metadata | Plaintext/API credential, DEK/KEK, decrypted secret view, custodian DB credentials |
| System Hub | Validate product intent, user session, connection scope, capability, and call custody using workload identity | Master keys, bulk secret retrieval, storing/forwarding plaintext credentials, arbitrary provider proxy |
| Secret Custody Plane | Own registry, encrypted credential versions, provider adapters, lifecycle, operation ledger and audit | Arbitrary network proxy, cross-customer reads, broker writes in initial release |
| AI / MCP | Request approved read-only business operations and receive sanitized data | Credential material, signing keys, raw provider auth headers, secret references as capabilities |
| 1Password Developer Environments | Local developer credentials only | Customer API credentials or production custody |
| Cloudflare Worker Secrets | Static platform/deployment-level Worker secrets | Per-customer credential database or custody master key |

## 7. Provider evaluation — no selection yet

Use the following weighted review before selecting an implementation provider:

| Criterion | Required evidence |
|---|---|
| Independent boundary | Separate account/project, owner/admin separation, cross-account policy and break-glass design |
| KMS/HSM | Non-exportable KEK, DEK wrapping, key rotation/versioning, asymmetric signing capability, policy conditions |
| Workload identity | Short-lived federation/mTLS from Cloudflare and auditable principal restrictions; no long-lived shared key |
| Audit | KMS key use, secret metadata access, admin changes, denied access, export and break-glass events |
| Data residency | Available regions, provider API geography, backups/replicas and retention |
| Operational safety | Availability, recovery, backup/restore, regional failure, incident response, key disable/rotation |
| APIs and lifecycle | Create/read-use/rotate/revoke, tags/metadata, API limits, versioning, idempotency support |
| Cost | Secret/version storage, KMS operations, audit logs, network egress, minimum commitments, support tier |

Initial evaluation shortlist only:
- AWS Secrets Manager + customer-managed AWS KMS key.
- Google Cloud Secret Manager + Cloud KMS CMEK.
- Self-hosted OpenBao Transit with a private datastore in a separately administered account/project. Candidate only: OpenBao is not an HSM; Shamir unseal is operator-managed, and the OCI Always Free proposal has idle-reclamation/availability risk plus unproven private connectivity.
- Cloudflare Secrets Store is not presently accepted as the primary custody system until its current limits and dynamic lifecycle/API fit are demonstrated.

OpenBao reconciliation: the merged `docs/architecture/NOVA-OPENBAO-STAGING-INTEGRATION.md` is retained as historical candidate analysis, not the current customer-custody design. Its earlier System-Hub-authoritative / Supabase-ciphertext flow conflicts with Option C and must not be implemented for customer secrets. The merged `integrations/system-hub/openbao-transit-client.js` is an isolated library scaffold, not a deployed custodian; its `decrypt()` method returns plaintext bytes to its caller, so it must not be wired into the System Hub customer request path. If OpenBao is selected later, the caller must be the separate custodian inside the independent security boundary, not the Hub.

This is a shortlist, not evidence that the owner has an account, permissions, credits, billing eligibility, or approved region. The next provider step is read-only discovery of existing account ownership, available IAM permissions, supported identity federation, region, audit configuration, and cost exposure. Do not create resources or incur costs during discovery.

## 8. Superseded work and PR handling

- Supabase Vault + Hyperdrive is superseded as the target store for customer secrets.
- PR #130 is the canonical Option C architecture and synthetic contract-proof candidate.
- PR #105 and PRs #92/#93/#95 are retained as historical Supabase Vault readiness, legacy credential-surface, and rotation-policy evidence only. They must not be extended or activated as customer credential custody.
- PR #112 is retained as historical disposable local PostgreSQL/Vault privilege-boundary evidence only. It must not merge independently or be represented as proof of separate custody.
- PR #151 is a free-first provider/readiness proposal, not a provider selection. Reconcile its claims against the provider evaluation here before any implementation.
- PR #156 is a synthetic-only Worker scaffold stacked on the prior PR #130 head. It is not the target custodian, is not deployed, and must be reconciled/reviewed against the current Option C branch before any merge consideration.
- PR #155's merged OpenBao staging document is historical and superseded where it assigns authorization to the System Hub or stores customer ciphertext in Supabase. PR #158's merged Transit client is an isolated library scaffold only; it is not imported into the Worker and is not a custody runtime.
- Retain old files/tests as historical evidence until their unique content and references are reviewed. Do not delete or merge them automatically.
- Keep master tracking Issue #36 as the single project tracker; do not create another tracker or automation.
## 9. Implementation gates and acceptance criteria

| Gate | Work | Exit evidence |
|---|---|---|
| C0 — Architecture | ADR, threat model, API/data contract reviewed | Owner/security review records explicit accepted trust boundaries |
| C1 — Provider discovery | Read-only account/access/capability/cost check | Existing account and permissions evidenced; provider choice explicitly approved |
| C2 — Local synthetic proof | Custodian adapter interface, envelope crypto abstraction, registry, operation ledger, A/B fixtures | Tests prove owner separation, AAD tamper failure, replay/result replay, fingerprint conflict, timeout recovery and no secret leakage |
| C3 — Independent security review | Design/code review by reviewer independent of implementation | Findings dispositioned; critical/high issues closed; residual risks accepted |
| C4 — Staging readiness | Explicit staging approval, isolated two-customer environment, least-privilege workload identity | Customer A/B allow/deny evidence, rotation/revoke and incident-recovery proof |
| C5 — Production release | Separate explicit production approval | Exact artifact, deployment identity, security monitoring, rollback and post-release verification |

No gate is passed by documentation, a green unrelated CI job, a local Supabase proof, a provider dashboard label, or an unverified deployment status alone.

## 10. Non-goals and hard safety invariants

- No secret custody runtime is enabled in this change.
- No provider account, KMS/HSM, database, queue, network endpoint, service account, policy, role, key, secret store, DNS, or billing configuration is provisioned or modified.
- No customer credential is read, collected, migrated, or tested.
- No hosted Supabase schema, grant, RLS, Auth, or project setting is changed.
- No live deployment, staging user creation, customer route, or customer secret API is enabled.
- Exness MT5 remains Demo/read-only through the existing tenant Bridge path. Order submission, execution, and Live Trading remain OFF.

## 11. References

- AWS Secrets Manager envelope encryption: https://docs.aws.amazon.com/secretsmanager/latest/userguide/security-encryption.html
- AWS cross-account Secrets Manager access: https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access_examples_cross.html
- Google Secret Manager CMEK: https://docs.cloud.google.com/secret-manager/docs/cmek
- Google Secret Manager audit logging: https://docs.cloud.google.com/secret-manager/docs/audit-logging
- Cloudflare Secrets Store management and current limits: https://developers.cloudflare.com/secrets-store/manage-secrets/
- Cloudflare Secrets Store Workers integration: https://developers.cloudflare.com/secrets-store/integrations/workers/

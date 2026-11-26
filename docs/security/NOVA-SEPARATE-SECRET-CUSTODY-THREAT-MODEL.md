# NOVA Separate Secret Custody — Threat Model

**Architecture reference:** docs/architecture/NOVA-SEPARATE-SECRET-CUSTODY-ADR.md  
**Status:** Design-stage threat model; requires independent security review  
**Date:** 2026-10-31  
**Data classification:** Customer financial/provider credentials are restricted secrets.

## 1. Security objectives and invariants

The system must preserve these invariants across normal operation, failure, recovery, backup/restore, and administrative access:

1. A user can operate only on a credential binding registered to that authenticated user and exact connection.
2. Knowing or guessing another customer's user ID, tenant ID, connection ID, custody reference, operation ID, or ciphertext cannot grant access.
3. Compromise of Supabase Postgres or its service_role alone is insufficient to decrypt or use customer credentials.
4. The System Hub, AI Worker, MCP server, browser, logs, analytics, and support systems never receive plaintext customer credentials or custody master keys.
5. A provider operation is not repeated automatically when its external outcome is ambiguous.
6. Credential binding, provider, environment, capability, owner, and generation are authenticated by immutable AAD and checked again in the authorization registry.
7. Customer credential capabilities remain read-only in the initial release. Trade/order, withdrawal, transfer, deposit, and other mutation scopes are denied server-side.
8. A missing identity, registry mapping, key, policy, audit sink, or required configuration fails closed.
9. No fallback path silently re-enables Supabase Vault, a shared token, generic service-role access, or direct secret retrieval.
10. Every privileged custody action has a redacted, tamper-evident audit trail.

## 2. Assets

| Asset | Impact if compromised |
|---|---|
| Plaintext customer API credential | Unauthorized access to customer provider account/data |
| Per-version DEK and wrapped DEK | Decryption of one credential version or broad set if DEK lifecycle is mismanaged |
| KMS/HSM KEK and asymmetric signing key | Decryption/signing authority at custody scale |
| Custodian binding registry | Owner/connection/provider/environment authorization manipulation |
| Durable operation ledger | Replay, duplicate operation, hidden ambiguous outcome, or false completion |
| Customer Supabase session | Acting as that user within the allowed user scope |
| Workload identity / mTLS material | Unauthorized service-to-service custody calls |
| Provider adapter and allowlist | SSRF or unintended provider actions |
| Audit evidence and metadata | Sensitive relationship, usage, and operational information |
| Backups, snapshots, queues, dead letters | Long-lived copies of encrypted or accidentally plaintext material |
| Recovery/break-glass controls | Privileged insider or emergency misuse |

## 3. Actors and trust assumptions

### Actors
- Customer: owns the provider account and supplies/revokes its credential.
- NOVA browser: untrusted client; may be controlled by an attacker.
- System Hub: trusted application control plane, but treated as potentially compromised for defense-in-depth.
- Secret Custody service: dedicated high-trust service boundary.
- Supabase Auth/Postgres: user identity and non-secret connection metadata; not the custody key authority.
- KMS/HSM: external cryptographic root and signing authority.
- Provider API: external system; responses and status may be delayed, malformed, duplicated, or ambiguous.
- Custody operator: privileged administrator subject to separation of duties and audit.
- External attacker: may control a browser, network path, leaked session, compromised workload, provider response, or one cloud account.

### Assumptions to verify (not facts until evidenced)
- A separate cloud account/project can be owned and administered independently.
- The selected provider supports non-exportable KMS/HSM keys, auditable use, workload identity federation, and acceptable regions.
- The custodian can independently validate Supabase user sessions without a service-role secret.
- Canonical connection ownership can be checked through the authenticated user's own RLS-scoped metadata path.
- The custodian can maintain a private registry and durable operation store with backup/restore and concurrency guarantees.
- Provider APIs expose sufficient read-only permissions and, where available, idempotency or status lookup.

No account ownership, provider capabilities, tenant mapping, or cross-account policy is assumed from repository configuration.

## 4. Trust boundaries

| Boundary | Data crossing it | Primary control |
|---|---|---|
| Browser -> Custodian | Supabase bearer token, one-time credential submission | TLS, exact origin policy, bounded body, no cookies, no-store, body redaction, session verification |
| Browser -> System Hub | User intent, connection ID, session | Existing auth, schema validation, rate limit; identifiers are not authorization |
| Hub -> Custodian | Workload identity, forwarded user session, signed request context, operation parameters | mTLS/workload federation, audience/scope, short TTL, independent user verification |
| Custodian -> Supabase | User-scoped metadata lookup and Auth validation | No service_role; RLS-scoped request; fixed Supabase host |
| Custodian -> KMS/HSM | DEK wrap/unwrap and signing requests | Non-exportable keys, least-privilege IAM, separate admin, key-use audit |
| Custodian -> Provider | Credential-bearing authenticated request | Fixed host allowlist, TLS, read-only capability adapter, strict egress policy |
| Custodian -> audit/queue/storage | Operation and lifecycle metadata | Secret scrubbing, encryption, access isolation, retention and backup policy |

## 5. Threat scenarios and mitigations

| ID | Threat / attack path | Required mitigation | Residual risk / acceptance test |
|---|---|---|---|
| T01 | Supabase DB or service_role compromise exposes opaque refs and connection metadata | Customer ciphertext, DEKs, KEKs, private keys, and decrypt API live only in separate custody boundary. Custodian authorization registry and KMS policy are independent. | Supabase compromise can still expose user/connection metadata and may allow attacker to impersonate a user if Auth itself is compromised. Test DB/service-role-only compromise cannot decrypt/use a synthetic secret. |
| T02 | IDOR/BOLA: user A supplies B's connection ID or custody_ref | Custodian independently validates JWT subject, reads connection under user-scoped RLS, then matches owner + binding in custodian registry. Never authorize on UUID secrecy. | Test A knows B's every identifier and still gets denial with zero provider calls. |
| T03 | Hub compromise or forged internal assertion | mTLS/workload identity scopes service; custodian independently verifies user JWT and binding; assertion subject/connection must match validated session and registry; operations are allowlisted read-only. | A compromised Hub may misuse a currently valid customer's session for allowed read operations. Do not grant export or mutation capabilities. Security review must validate signer policy and token forwarding. |
| T04 | Custodian workload compromise | Isolate process/network/account; no interactive admin; minimal IAM; non-exportable keys; short-lived workload identity; per-binding authorization; egress allowlist; deploy provenance and runtime monitoring. | Active process compromise may use the current customer's credential for permitted provider calls. Contain by disabling workload, disabling KMS use, provider revocation, and incident response. |
| T05 | KMS/HSM key misuse or signing-key abuse | Separate security administrators; non-exportable keys; policy conditions; key-use alarms; no generic sign/decrypt permission; dual-control break-glass; rotate and revoke key versions. | KMS control-plane/admin compromise can have broad impact. Test unauthorized workload cannot wrap/unwrap/sign; review real cloud IAM policy before staging. |
| T06 | Ciphertext/AAD substitution or metadata tampering | AEAD with canonical AAD binding owner, tenant-if-established, connection, provider, environment, generation, and schema version. Verify all tags; use CAS for generation. | AAD correctness is implementation-sensitive. Mutation tests alter each bound field and require authentication failure. |
| T07 | Replay of signed request or idempotency key | Short assertion TTL, unique token ID, bounded replay cache, durable operation ID and request fingerprint, unique constraint, stored-result replay, conflict response. | Replay cache alone is not durable idempotency. Test concurrent duplicate requests and fresh-nonce/same-operation replay. |
| T08 | Provider timeout after remote action; retry duplicates the effect | Durable OUTCOME_UNKNOWN, provider idempotency/reference where supported, read-after-write reconciliation, per-binding lease and fencing. Never blind-retry ambiguous outcomes. | Some providers cannot expose authoritative operation status. Those operations remain unknown/manual. Prove failure injection at every network boundary. |
| T09 | Secret leaks through logs, traces, errors, metrics, APM, CI, or request dumps | Disable request-body capture; redact Authorization/Cookie/query/body; do not log provider headers/raw body/ciphertext/DEK; bounded sanitized error codes; synthetic canary scanning. | Third-party telemetry may capture data before application redaction. Inspect full pipeline and verify with injected canary values. |
| T10 | SSRF / arbitrary upstream calls through credential proxy | Provider-specific adapters with hard-coded host allowlists, fixed methods, strict TLS, DNS/redirect controls, schema-validated parameters and bounded response size. | Provider host changes require reviewed updates. Tests must reject arbitrary URL, redirect to private IP, unexpected scheme, and unapproved host. |
| T11 | Cross-environment or cross-region confusion | Separate key versions, registries, workload identities, endpoints, and databases for local/test/staging/production. Bind environment and region in registry/AAD. | Human provisioning error remains possible. A/B tests across environments and key IDs must fail. |
| T12 | Insider/break-glass misuse | Separate duties for custody admin, key admin, deployment admin, and audit admin; two-person approval for export/restore/disable; time-bound elevation; immutable audit and alerting. | Collusion or cloud-provider control-plane compromise remains. Independent review must examine access graph and break-glass drills. |
| T13 | Backup, snapshot, queue, or dead-letter leak | Encrypt backups with separate keys; prohibit plaintext credentials in queues; store references only; enforce retention/deletion; test restore without broad operator decrypt. | Backup admins may access ciphertext and metadata. Verify key isolation, restore controls, and deletion lifecycle. |
| T14 | Tenant/owner remapping after account transfer or schema change | Immutable binding; explicit transfer/rebind workflow requiring old-owner authorization and new-owner verification; decrypt/re-encrypt with new AAD; dual audit events. | Incorrect customer-support intervention can cause cross-account exposure. Test owner change never changes authorization implicitly. |
| T15 | Provider response or market data prompt injection | Treat all provider output as untrusted data; schema validation and output encoding; no provider output is executed as code or interpreted as authorization. | Downstream AI may still be manipulated by content. Red-team provider response, symbol/name fields, and error strings. |
| T16 | DoS, resource exhaustion, or KMS/provider cost abuse | Per-principal and per-binding rate limits, body/time/size bounds, queue concurrency, circuit breakers, budgets/alarms, backpressure, and global kill switch. | Attackers can still cause partial availability loss. Test rate-limit isolation and recovery after throttling. |

## 6. Authentication and authorization protocol requirements

1. Authenticate the customer token independently using the expected Supabase Auth issuer/project. Reject wrong issuer, wrong audience, expired/not-yet-valid token, revoked user where supported, and Auth service uncertainty.
2. Derive principal ID from verified Auth response, not request claims or Hub assertions.
3. Resolve the specific connection ID using a user-scoped RLS query. Reject missing/duplicate/ambiguous records.
4. Resolve exact provider and environment from server-owned metadata and custodian registry. Ignore/reject client-supplied override fields.
5. Check state, generation, allowed capability, provider scope, user consent, and policy version at the point of use.
6. Validate workload identity separately from customer identity. Each is necessary; neither substitutes for the other.
7. If signed assertions are used, validate algorithm allowlist, key ID, issuer, audience, subject, connection, operation, capability, digest, expiry, token ID, and replay state. Never trust a key-selected algorithm from the token.
8. Denials must not reveal whether another customer's binding exists. Use a uniform not-found/forbidden policy chosen by privacy review.
9. No provider call may occur until all authorization and durable ledger reservations succeed.

## 7. Cryptographic and data controls

- AEAD only; no unauthenticated encryption or custom crypto.
- Unique nonce per encryption under a DEK; enforce generation/version uniqueness.
- KEKs and signing keys non-exportable; wrap/unwrap/sign audited.
- Separate keys per environment and preferably per high-sensitivity compartment; document blast radius.
- AAD canonicalization test vectors are fixed and versioned.
- Rotation must support overlapping key versions only for a bounded migration window.
- KMS outage, disabled key, missing key version, tag failure, AAD mismatch, or registry outage causes deny-by-default.
- Do not expose a "decrypt secret" endpoint to the Hub. The service executes only bounded capabilities and returns sanitized results.

## 8. Logging, audit, monitoring, and incident response

### Allowed audit fields
- event ID, timestamp, environment, region, workload principal, authenticated owner/principal ID (or approved pseudonymous ID), binding ID, provider name, capability, operation ID, generation, state transition, policy version, key ID/version, outcome code, correlation ID, and reviewer/approver IDs where applicable.

### Prohibited telemetry
- plaintext credential, DEK/KEK, private key, Supabase bearer token, refresh token, Authorization/Cookie header, signed assertion payload/signature, request body containing credentials, provider auth headers, raw provider response body, or decrypted SQL result.

### Required alerts
- denied cross-owner attempts;
- repeated signature/nonce/idempotency failures;
- KMS unwrap/sign anomalies and policy changes;
- binding generation rollback or unexpected owner/provider/environment update;
- OUTCOME_UNKNOWN age and reconciliation backlog;
- unexpected provider host, capability, scope, or method;
- log redaction canary match;
- break-glass use, backup restore, key disable/delete, or audit sink outage.

### Incident response
- Immediate fail-closed switch for the affected binding/provider/environment.
- Revoke provider credential through the provider's supported control plane.
- Disable compromised workload/KMS permissions and rotate affected key versions.
- Preserve redacted audit evidence and identify affected owner/bindings/operations.
- Reconcile all ambiguous provider outcomes before resuming.
- Require independent incident review and explicit owner approval to re-enable.

## 9. Required security test matrix

- Customer A valid token + A binding: allow the intended read-only operation.
- Customer A token + B connection ID, custody_ref, operation ID, or ciphertext: deny; assert provider call count = 0.
- Supabase service_role/database-only compromise simulation: no KMS access and no decrypt/use path.
- Compromised/mismatched Hub assertion: deny because token subject or registry binding does not match.
- Invalid/expired/wrong-audience/wrong-issuer token: deny.
- Missing workload identity or mTLS identity: deny.
- Tamper every AAD field, nonce, ciphertext, tag, wrapped DEK, key ID and generation: deny.
- Duplicate operation ID with same request: replay same sanitized result; no second provider call.
- Same idempotency key with changed request fingerprint: 409 conflict; no provider call.
- Provider timeout before send, during send, and after response: classify and reconcile correctly; no blind duplicate.
- Concurrent rotation/revoke/use: lease and fencing prevent stale state commit.
- Logs, traces, metrics, errors, queues, backups and CI artifacts: seeded canary credential never appears.
- Test/staging/production key and registry separation: cross-environment operation denied.

## 10. Open risks requiring independent disposition

- Exact Supabase token validation and revocation semantics under the selected Auth configuration.
- Canonical tenant mapping and future organization/household ownership semantics.
- Workload identity federation from the actual System Hub runtime to whichever custody provider is selected.
- Custodian database/queue region, data residency, backup retention and deletion obligations.
- Provider-specific read scopes, idempotency, status lookup and credential revocation support.
- Whether a custody service compromise can be contained to a single binding or requires a stronger per-tenant runtime/key compartment.
- Cost, service availability, support SLA, and operational on-call capability.

**Review gate:** This threat model is not an independent security review and does not approve implementation. Critical/high findings must be closed or explicitly accepted before any staging use.

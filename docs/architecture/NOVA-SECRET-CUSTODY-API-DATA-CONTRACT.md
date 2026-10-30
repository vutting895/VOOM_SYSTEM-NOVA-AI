# NOVA Separate Secret Custody — API and Data Contract

**Architecture reference:** docs/architecture/NOVA-SEPARATE-SECRET-CUSTODY-ADR.md  
**Threat model:** docs/security/NOVA-SEPARATE-SECRET-CUSTODY-THREAT-MODEL.md  
**Status:** Proposed contract only; no endpoint or schema is implemented by this document  
**Version:** 1.0-draft  
**Date:** 2026-10-31

## 1. Contract principles

- The custodian is the sole customer-credential custody and provider-adapter execution boundary.
- The custodian independently validates the customer's Supabase session. It does not trust a user ID, tenant ID, provider, environment, secret reference, or role supplied by a browser or AI.
- The custodian independently resolves the connection through the authenticated user's RLS-scoped Supabase metadata path and reconciles it with its own registry.
- The System Hub authenticates as a workload using mTLS/workload identity and supplies the customer authorization context. The custodian checks both identities.
- The customer credential is submitted directly to the custodian over TLS. It is never posted to the Hub, AI Worker, MCP server, analytics, or a generic proxy.
- Provider calls are executed inside the custodian using fixed, reviewed provider adapters. No endpoint returns a plaintext credential or generic upstream response.
- All create/use/rotate/revoke operations use a durable operation ledger, request fingerprint, state machine, lease, and fencing token.
- This contract is descriptive. Every route remains disabled until local synthetic proof, independent review, and separate staging approval are complete.

## 2. Authentication headers and common request rules

### Customer identity

- Customer endpoints require Authorization: Bearer <Supabase access token>.
- The custodian verifies the token directly against the expected Supabase Auth project/issuer and derives the subject from the verified Auth response.
- Cookie-based ambient authentication is not used for custody APIs. The frontend must not store access or refresh tokens or credential payloads in localStorage/sessionStorage for this feature.
- Invalid, expired, wrong-project, wrong-audience, or unverifiable sessions fail closed.

### Workload identity

- Hub operation calls require a separately authenticated workload identity and mutually authenticated TLS.
- A short-lived signed internal context may be included as defense-in-depth. Claims bind issuer, audience, verified subject, binding/connection, provider, environment, capability, operation ID, request digest, issued/expiry time, and unique token ID.
- The custodian independently verifies the customer session and registry even when the assertion is valid. No symmetric HMAC trust is accepted as the production trust anchor.
- Private signing key stays non-exportable in the selected separate KMS/HSM boundary. The signer permission must not be a generic arbitrary-claims signing oracle.

### Common transport and payload rules

- TLS 1.2+ (TLS 1.3 preferred), strict certificate validation, bounded request/response sizes, explicit timeouts, and rate limits.
- Credential intake responses and every custody response use Cache-Control: no-store and Pragma: no-cache.
- No CDN, reverse proxy, application cache, or database query cache may cache authentication, registry, lifecycle, or secret-bearing operations. Decrypted credentials and DEKs must never enter a cross-request cache. The durable operation ledger is the source of truth for idempotent results, not a cache of provider secrets.
- Cloudflare Hyperdrive is not part of the selected Option C customer-custody path; do not provision or configure it for this workstream. The replacement acceptance check is an independently isolated custodian datastore/API with no-cache behavior proven at every layer.
- Disable request-body capture, URL/query logging, Authorization/Cookie capture, automatic exception serialization, and provider response-body logging at every proxy/APM/trace layer.
- Reject unknown JSON fields; validate types/enums/lengths; canonicalize identifiers before authorization.
- No arbitrary URL, host, HTTP method, provider path, header, or SQL fragment is accepted from the caller.
- Request and response schemas are versioned. Breaking changes require an explicit contract version and migration plan.

## 3. Proposed endpoints

### 3.1 Create or replace a credential binding

**POST /v1/credential-bindings**

Caller: customer browser directly to the custody API. The System Hub must not receive the credential payload.

Headers:
- Authorization: Bearer <Supabase access token>
- Idempotency-Key: random opaque key, 16–128 characters
- Content-Type: application/json

Request fields:

| Field | Required | Rule |
|---|---:|---|
| connection_id | Yes | Existing connection UUID. Used only to locate the owner's connection; not sufficient authorization |
| credential_type | Yes | Fixed enum selected by provider adapter; reject unknown values |
| credential | Yes | Ephemeral typed object for the provider; never persisted in plaintext or logged |
| requested_capabilities | Yes | Requested subset of server-owned read-only capabilities; server intersects with provider/account policy |
| consent_version | Yes | Version of customer-facing disclosure/consent accepted by the user |

The request must not accept owner_id, tenant_id, custody_ref, vault_id, secret_id, provider endpoint URL, environment override, generation, KMS key ID, or caller-selected capability policy. Provider/environment are derived from the verified connection metadata and server allowlist. If the existing connection schema does not supply sufficient trusted metadata, return a safe configuration error and do not create a binding.

Processing:
1. Verify the customer session independently.
2. Read the exact connection through the user's own Supabase session/RLS path; confirm it is owned by the verified subject and is eligible for credential custody.
3. Resolve provider, environment, and connection state from trusted metadata; fail closed on missing or conflicting data.
4. Check consent, provider allowlist, requested read-only scopes, rate limit, and idempotency.
5. Reserve a durable intake operation before encrypting or validating remotely.
6. Generate a unique per-version DEK, encrypt with AEAD and immutable AAD, wrap the DEK with the custody KEK, and persist ciphertext/version metadata.
7. Validate the credential using a fixed provider validation operation that does not mutate account state. Treat timeout as unknown, not invalid.
8. Activate the binding only after successful validation and an atomic generation compare-and-set. Keep failed/unknown intake quarantined and unusable until reconciliation.
9. Return only the opaque custody reference, binding ID, generation, and safe state.

Success response fields:

| Field | Meaning |
|---|---|
| binding_id | Custodian-owned opaque binding identifier; not a bearer token |
| custody_ref | Random opaque reference stored in Supabase metadata; not authorization |
| generation | Active credential version generation |
| state | PENDING_VALIDATION or ACTIVE |
| operation_id | Durable intake operation identifier |
| result_code | Stable sanitized code |

A lost response is retried with the same Idempotency-Key. Same key and same keyed request fingerprint returns the same result/status. Same key with a different fingerprint returns 409 IDEMPOTENCY_CONFLICT.

### 3.2 Read binding metadata

**GET /v1/credential-bindings/{binding_id}**

Caller: customer or authorized Hub, with independent customer session verification; Hub additionally presents workload identity.

Returns only owner-scoped metadata: binding_id, connection_id, provider, environment, current generation, capability summary, state, created_at, updated_at, and last safe validation timestamp. It never returns credential fields, ciphertext, wrapped DEK, key material, raw provider headers, or internal registry IDs that can be used as capabilities.

### 3.3 Request a read-only provider operation

**POST /v1/operations**

Caller: existing System Hub using mTLS/workload identity and forwarding the customer's Supabase bearer token. The Hub sends bounded intent/parameters; it does not send credential material.

Headers:
- Authorization: Bearer <Supabase access token>
- Idempotency-Key: stable logical-operation key
- X-NOVA-Assertion: optional short-lived asymmetric signed context, when enabled

Request fields:

| Field | Required | Rule |
|---|---:|---|
| connection_id | Yes | Exact connection; custodian resolves/validates owner |
| capability | Yes | Fixed allowlisted read-only capability |
| parameters | Yes | Operation-specific schema; bounded and sanitized |
| policy_version | Yes | Server policy version expected by caller; custodian checks current policy |
| client_correlation_id | No | Non-sensitive correlation value with strict length/character limit |

The caller cannot pass binding_id as sole authority, secret reference, provider URL, auth header, API key, owner_id, tenant_id, generation override, raw SQL, or any trade/write capability.

Initial capability catalog proposal (subject to provider-specific scope verification):

| Capability | Intent | Explicitly excluded |
|---|---|---|
| account.summary.read | Read bounded account summary | Funding, transfer, withdrawal, profile mutation |
| balances.read | Read balance information | Deposit, withdrawal, transfer |
| positions.read | Read current positions | Open, close, amend, hedge, or liquidate |
| orders.read | Read order/history information | Create, amend, cancel, submit |
| quotes.read | Read allowlisted market quotes | Arbitrary market-data proxy |
| credential.status.read | Read safe validation/lifecycle status | Read or export secret material |

Processing:
1. Authenticate workload identity and customer session independently.
2. Resolve the Supabase owner subject and RLS-scoped connection.
3. Match custodian registry owner, connection, provider, environment, binding state, generation, consent, and read-only capability.
4. Validate the internal assertion when present; require all assertion claims to match the verified customer and registry record.
5. Reserve the operation atomically in the durable ledger. Enforce idempotency/fingerprint conflict rules and acquire a per-binding lease/fencing token.
6. Decrypt only inside the custodian process after all checks. Use the provider-specific adapter and strict egress allowlist.
7. Validate the provider response against a fixed schema, redact sensitive fields, and persist only the sanitized result required for durable replay.
8. Commit the terminal state only if the worker still owns the current fencing token.
9. Return a safe result or the durable pending/unknown state.

The operation response must never include credential bytes, DEK/KEK, wrapped DEK, provider authorization header, raw provider body, or a generic unfiltered provider response.

### 3.4 Get operation status/result

**GET /v1/operations/{operation_id}**

Requires the same customer and workload authorization checks as the original operation. Returns operation_id, state, sanitized result (when allowed), result code, created/updated timestamps, and a reconciliation indicator. Operation IDs are not bearer credentials and are always owner-scoped.

### 3.5 Rotate a credential

**POST /v1/credential-bindings/{binding_id}/rotate**

Requires customer authorization, workload identity, idempotency key, current policy, and provider-supported rotation semantics. The request does not include a caller-selected generation or secret reference.

The custodian creates a successor version, validates it, atomically advances generation, then retires the predecessor. If provider rotation is ambiguous, retain ROTATION_UNKNOWN and do not retire the predecessor or blindly reissue the provider request.

### 3.6 Revoke a credential binding

**DELETE /v1/credential-bindings/{binding_id}**

Requires customer authorization, workload identity, idempotency key, and a supported provider revoke/disable flow where available. Revoke status is durable. An ambiguous outcome becomes REVOKE_UNKNOWN; do not claim revoked until provider or custody evidence confirms the terminal state. Local cryptographic disablement may block future custodian use but must not be misrepresented as provider-side revocation.

## 4. Operation state machine and replay contract

Permitted ledger states:

- RECEIVED
- AUTHENTICATING
- AUTHORIZED
- RESERVED
- RUNNING
- SUCCEEDED
- FAILED_FINAL
- OUTCOME_UNKNOWN
- RECONCILING
- MANUAL_REVIEW
- CANCELLED_BEFORE_SEND

Allowed transitions:

| From | To | Condition |
|---|---|---|
| RECEIVED | AUTHENTICATING | Request schema accepted and durable intake created |
| AUTHENTICATING | AUTHORIZED | Customer and workload identities verified |
| AUTHENTICATING | FAILED_FINAL | Identity invalid or untrusted |
| AUTHORIZED | RESERVED | Registry, capability, policy, and idempotency checks pass |
| AUTHORIZED | FAILED_FINAL | Owner/binding/scope/policy mismatch |
| RESERVED | RUNNING | Current lease/fencing token acquired |
| RESERVED | CANCELLED_BEFORE_SEND | Cancelled before any provider request could be sent |
| RUNNING | SUCCEEDED | Provider result observed and sanitized |
| RUNNING | FAILED_FINAL | Provider definitively rejected or failed before effect |
| RUNNING | OUTCOME_UNKNOWN | Request may have reached provider but final outcome is not known |
| OUTCOME_UNKNOWN | RECONCILING | A provider-specific reconciliation check begins |
| RECONCILING | SUCCEEDED | Authoritative evidence confirms success |
| RECONCILING | FAILED_FINAL | Authoritative evidence confirms no effect/final failure |
| RECONCILING | MANUAL_REVIEW | Provider cannot resolve outcome safely |

No transition from OUTCOME_UNKNOWN directly back to RUNNING is allowed without a documented provider-specific proof that retry cannot duplicate an effect.

### Idempotency rules

- Uniqueness scope: principal + binding + operation type + idempotency key.
- Fingerprint: keyed digest of canonical operation type, binding, provider, environment, capability, policy version, parameters, and (for intake/rotation) sensitive payload. The key used to derive the fingerprint is held in the custody KMS/HSM boundary.
- Same key and same fingerprint: return the existing operation state/result; never issue a second provider request.
- Same key and different fingerprint: return 409 IDEMPOTENCY_CONFLICT.
- A retry after client timeout uses the same idempotency key. It may not create a new logical operation ID.
- Provider request idempotency tokens should derive from the durable operation ID where supported; never expose a provider token to the browser.
- Lease acquisition increments a fencing token. Every write/transition checks the current fencing token and expected generation.
- Store sanitized terminal results for a documented retention period. Results containing personal/financial data require encryption, access control, retention limit, and customer-owner scoping.

## 5. Proposed custody data model

The following is a logical model, not a migration or a final physical schema. All tables reside in the separate custody datastore/private schema, not Supabase.

### 5.1 custody_principals

| Column | Type / constraint | Purpose |
|---|---|---|
| principal_id | UUID, PK | Supabase Auth user subject verified by custodian |
| tenant_id | UUID, nullable | Set only after a canonical tenant registry/mapping is evidenced |
| tenant_binding_source | enum/string, nullable | Trusted source and version for tenant mapping |
| status | enum | ACTIVE, SUSPENDED, CLOSED |
| created_at / updated_at | timestamptz | Lifecycle metadata |

Do not populate tenant_id by inference. The current inspected connection model proves user_id ownership, not a canonical tenant model.

### 5.2 custody_bindings

| Column | Type / constraint | Purpose |
|---|---|---|
| binding_id | UUID, PK | Custodian-owned binding ID |
| custody_ref | random opaque value, UNIQUE | Non-secret reference stored in Supabase metadata; not an authorization token |
| principal_id | FK custody_principals | Authenticated owner |
| tenant_id | UUID, nullable | Immutable verified tenant binding when supported |
| connection_id | UUID, UNIQUE within configured namespace | Validated NOVA connection |
| provider_code | enum/FK | Server-owned provider allowlist |
| environment | enum | Explicit test/staging/production separation |
| capabilities | normalized set/version | Approved read-only operations |
| current_generation | bigint | Compare-and-set active credential version |
| state | enum | PENDING, ACTIVE, ROTATION_UNKNOWN, REVOKE_UNKNOWN, REVOKED, COMPROMISED, DISABLED |
| consent_version | string | Customer consent/disclosure version |
| created_at / updated_at | timestamptz | Lifecycle metadata |

Constraints must prevent a connection ID from being bound to multiple principals in the same environment unless an explicit reviewed multi-owner model is introduced. A reference collision or owner mismatch fails closed.

### 5.3 credential_versions

| Column | Type / constraint | Purpose |
|---|---|---|
| binding_id | FK custody_bindings | Parent binding |
| generation | bigint; composite PK with binding_id | Immutable version |
| credential_type | enum | Typed provider credential |
| algorithm | enum/version | Approved AEAD suite |
| nonce | bytes | Unique encryption nonce for this DEK |
| ciphertext | bytes | Authenticated encrypted credential |
| auth_tag | bytes | AEAD tag when stored separately by chosen library |
| wrapped_dek | bytes | DEK encrypted by KMS/HSM KEK |
| kek_key_id / kek_version | string | Key reference, never key bytes |
| aad_version | integer | Canonical AAD encoding version |
| state | enum | PENDING, ACTIVE, RETIRED, REVOKED, QUARANTINED |
| created_at / retired_at | timestamptz | Version lifecycle |

Do not place provider credential fields in ordinary columns or JSON metadata. Do not store plaintext DEKs or KEKs.

### 5.4 operation_ledger

| Column | Type / constraint | Purpose |
|---|---|---|
| operation_id | UUID, PK | Stable durable logical operation |
| principal_id / binding_id | FK | Owner and binding scope |
| operation_type | enum | intake, validation, provider_read, rotate, revoke |
| idempotency_key | opaque string | Scoped caller retry key |
| request_fingerprint | keyed digest | Detect same-key/different-request conflict |
| fingerprint_key_id | string | KMS/HSM fingerprint-key version |
| state | enum | State machine above |
| attempt_count | integer | Bounded attempt accounting |
| lease_owner | workload identity | Current executor |
| lease_expires_at | timestamptz | Lease expiry |
| fencing_token | bigint | Monotonically increasing ownership token |
| provider_operation_ref | string, nullable | Provider-generated reference if available |
| sanitized_result | encrypted JSON, nullable | Durable result replay without secret material |
| result_expires_at | timestamptz, nullable | Retention boundary |
| safe_error_code | string, nullable | Sanitized terminal/pending code |
| created_at / updated_at | timestamptz | Durable timestamps |

Unique constraint: principal_id + binding_id + operation_type + idempotency_key. A conflicting request_fingerprint under the same unique key returns 409; it does not overwrite the existing operation.

### 5.5 custody_audit_events

Append-only event metadata: event_id, timestamp, principal, binding, connection, provider, environment, operation_id, generation, workload principal, action, previous_state, new_state, policy_version, key_id/version, result code, correlation ID, and actor/approver identity when relevant.

Never store secret values, raw request/response bodies, bearer tokens, signatures, or provider auth headers. Restrict audit write/read/delete permissions separately; export to an immutable/tamper-evident destination selected after provider discovery.

### 5.6 custody_signing_keys

Public metadata only: key_id, algorithm, public_key, issuer, audience, environment, status, not_before, not_after, rotated_from, created_at, retired_at. Private key material stays non-exportable in KMS/HSM. The table cannot authorize a key by itself; the custodian pins/validates the approved key set and policy.

## 6. Cryptographic contract

- Per-secret-version DEK generated from a cryptographically secure source.
- Initial AEAD candidate AES-256-GCM, with unique 96-bit nonce per DEK and 128-bit tag; exact implementation must follow the selected crypto library/provider requirements.
- KEK wraps the DEK; KEK material is never exported.
- AAD is fixed-order, versioned and length-unambiguous; minimum fields: binding ID, principal/owner ID, verified tenant ID or explicit absent marker, connection ID, provider, environment, credential type, generation.
- Any AAD change causes decryption/authentication failure.
- Signature algorithm is pinned per environment. Use a vetted asymmetric algorithm supported by the selected KMS/HSM and custodian runtime; do not permit algorithm selection from untrusted token headers.
- Assertions expire within 60 seconds and include a unique token ID, operation ID and canonical request digest. Replay detection is separate from durable operation idempotency.
- KMS/HSM or key-registry failure means no provider call.

## 7. Error model

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | INVALID_REQUEST | Schema, encoding, or unsupported field |
| 401 | INVALID_SESSION | Customer session missing/invalid/expired/unverifiable |
| 403 / 404 | NOT_AUTHORIZED / NOT_FOUND | Owner, binding, capability, or policy mismatch; choose privacy-safe uniform response |
| 409 | IDEMPOTENCY_CONFLICT | Same key reused with a different request fingerprint |
| 409 | GENERATION_CONFLICT | Expected generation is stale |
| 409 | OPERATION_IN_PROGRESS | A matching logical operation is pending |
| 422 | PROVIDER_VALIDATION_FAILED | Provider definitively rejected the credential/scope |
| 429 | RATE_LIMITED | Principal/binding/workload limit reached |
| 503 | CUSTODY_UNAVAILABLE | Required registry, KMS/HSM, audit, Auth, or provider dependency is unavailable |
| 202 | OUTCOME_UNKNOWN | Provider result cannot yet be determined; include operation ID and safe retry guidance |

Never expose internal stack traces, SQL errors, provider raw errors, secret IDs, key identifiers beyond approved safe metadata, or cross-owner existence details.

## 8. Data retention and deletion

- Define retention by data class: credential ciphertext/version history, operation ledger, sanitized results, audit metadata, backups, and tombstones.
- Retention must meet applicable law, provider terms, incident response, and customer deletion obligations; no period is assumed in this draft.
- A user deletion request must revoke/disable the binding, perform provider-side revoke where supported, schedule encrypted data deletion, and retain only legally required minimal audit evidence.
- KMS key destruction is not the only deletion mechanism; ensure all backups, replicas, snapshots, dead-letter queues, and exports are covered.
- A restore must not reactivate revoked bindings or replay stale operations. Restore process must re-check current revocation tombstones and fencing epochs before serving traffic.

## 9. Acceptance tests before staging

1. Valid owner session creates a synthetic binding; returned custody_ref is opaque and grants no direct access.
2. Owner A cannot create/read/use/rotate/revoke owner B's binding even when supplied B's IDs and references.
3. Supabase DB/service_role simulation cannot access custody datastore or KMS/HSM.
4. System Hub has no secret export/decrypt route and receives only sanitized results.
5. Wrong provider/environment/capability/generation, disabled binding, expired session, wrong audience, and missing workload identity all fail closed.
6. AAD mutation for each bound field fails authentication.
7. Unique nonce generation and per-version DEK policy are verified by property/known-answer tests.
8. Same idempotency key/same fingerprint returns stored result with exactly one provider call.
9. Same idempotency key/different fingerprint returns 409 with zero additional provider calls.
10. Duplicate concurrent requests, lease expiry, fencing, worker crash and restart do not duplicate provider work.
11. Provider timeout before-send, mid-flight, and after remote acceptance are classified and reconciled; no blind retry.
12. Rotation validates successor before generation switch; failed/unknown rotation preserves safe predecessor state.
13. Revoke distinguishes local disablement from confirmed provider-side revocation.
14. Credential canary is absent from all logs, traces, metrics, errors, queues, backups, CI, analytics, AI and MCP payloads.
15. Environment key/registry separation and full backup/restore/revocation behavior pass.
16. Independent security review and staging owner approval are recorded before any hosted staging action.

## 10. Explicit implementation non-effects

This contract does not create tables, migrations, routes, bindings, policies, keys, service accounts, provider adapters, queues, KMS/HSM resources, cloud accounts, or billing. It does not read or migrate real customer secrets. It does not enable credential create/retrieve/rotate/revoke or provider operations. Exness MT5 remains Demo/read-only; order submission, execution, and Live Trading remain OFF.

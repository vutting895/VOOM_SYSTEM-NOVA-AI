# NOVA Secret Custody Plane — Architecture Decision Record

**Status:** Owner-selected target architecture; implementation/provider selection pending  
**Decision:** Option C — a separate Secret Custody Plane  
**Scope:** Customer provider credentials only. 1Password Developer Environments remain separate and developer-only.  
**Current safety posture:** Customer credential create/retrieve/rotate/revoke routes remain disabled. No cloud resources, secrets, billing, hosted grants, or deployments are authorized by this ADR.

## 1. Decision

Customer provider credentials must be stored, decrypted, rotated, revoked, and used only inside a dedicated Secret Custody Plane in a separate cloud account/project and security boundary from both Supabase and the System Hub.

Supabase remains the identity, profile, and connection-metadata system. Ordinary application rows may contain only opaque custody references and non-secret metadata. A Supabase database compromise, including compromise of its privileged `service_role` key, must not by itself grant customer-secret decryption or retrieval.

The existing Cloudflare System Hub remains the customer-facing control plane, but it must not hold custody master keys, custodian database credentials, signing private keys, or bulk secret-read capability. The preferred interface is an operation API: the custodian performs provider operations internally and returns sanitized business results. Do not expose a general-purpose plaintext secret-retrieval endpoint to the Hub, browser, AI, MCP, or user.

## 2. Trust boundaries and identity

### Customer identity

1. The browser sends the user's Supabase access token to the System Hub over TLS.
2. The Hub forwards the bearer token to the custody API over mutually authenticated workload transport. It does not supply authoritative owner or tenant IDs.
3. The custodian independently validates the Supabase token against the configured Supabase Auth project (or a separately reviewed supported JWT/JWKS verification path).
4. The custodian extracts the authenticated subject from the verified token and resolves the exact connection owner/provider/environment from its own registry, cross-checking the Supabase connection metadata by authenticated user ID.
5. The custodian rejects caller-supplied owner IDs, tenant IDs, Vault IDs, secret references, generations, provider URLs, and privilege claims as authorization inputs.
6. The custodian derives tenant scope from its own canonical registry. Do not invent a tenant UUID: current `broker_connections` schema is owner-bound by `user_id` and does not establish a tenant_id mapping. Owner-only scope is the default until a canonical tenant registry is implemented and reviewed.

### Workload identity

- Hub-to-custodian calls require mTLS or an equivalent independently verified workload identity with audience, environment, and narrow operation scope.
- Customer identity and workload identity are separate principals; both must be valid.
- Short-lived assertions are signed by a key held in a dedicated KMS/HSM boundary. The Hub never receives the private key.
- Prefer asymmetric signing so the Hub can hold only public verification material. The custodian must still independently validate the user's Supabase session and resolve the owner/connection mapping; possession of a signing capability alone is never sufficient authorization.
- Key IDs, algorithm, issuer, audience, issued-at, expiry, nonce, operation ID, and capability are explicit. Enforce short TTL, nonce replay prevention, key rotation/revocation, and fail-closed behavior.
- If a provider cannot support a secure authorization path, return an explicit unsupported state; never downgrade to shared HMAC secrets or caller-asserted owner/tenant fields.

## 3. Secret custody and cryptography

- Use envelope encryption: unique per-secret data-encryption key (DEK), AEAD encryption, and a KMS/HSM-protected key-encryption key (KEK).
- Bind immutable associated data to the canonical owner/tenant (when available), connection ID, provider, environment, secret version/generation, and schema version. Any mismatch must fail decryption.
- Master keys and signing keys are non-exportable where supported; separate signing, wrapping, and data-encryption purposes and key policies.
- Key rotation supports overlapping verification/decryption windows, controlled rewrap, revocation, audit, and tested rollback. Compromise response must include key disablement, credential revocation/rotation, incident evidence preservation, and explicit customer impact assessment.
- Plaintext exists only inside the custody process boundary for the minimum duration needed to execute the provider adapter. Zeroize/discard buffers where the runtime permits; never persist plaintext.
- Never return plaintext credentials, ciphertext, DEKs, KEKs, access tokens, signatures, authorization headers, or provider request bodies in API responses, logs, traces, prompts, audit events, analytics, or CI output.

## 4. API contract candidate

The custody API should expose business operations, not secret primitives.

### Request

`POST /v1/provider-operations`

Required headers:
- `Authorization: Bearer <Supabase user access token>` — validated independently by the custodian.
- `Idempotency-Key: <stable operation UUID>` — stable across retries and signer-key rotation.
- mTLS workload identity — identifies the calling Hub service, not the customer.

Body:
- `connection_id`: UUID from the caller's selected connection; authorization is resolved server-side.
- `provider`, `environment`: expected values, checked against the custodian registry; never used to select an arbitrary URL.
- `operation`: allowlisted enum such as `account.read`, `positions.read`, `quotes.read`, `secret.rotate`, `secret.revoke`.
- `request`: operation-specific bounded non-secret parameters only.

Forbidden request fields include `owner_id`, `tenant_id`, `secret_id`, `vault_id`, `secret_value`, `access_token`, `database_url`, `provider_url`, `role`, and `capabilities`. The custodian derives those values from verified identity, registry state, and server policy.

### Response

Only a bounded sanitized envelope:
- `operation_id`
- `state`: `SUCCEEDED`, `FAILED_FINAL`, `IN_PROGRESS`, or `OUTCOME_UNKNOWN`
- `result`: operation-specific allowlisted business data (never credential material)
- `provider_reference`: opaque provider-side reference where safe
- `safe_error_code`: stable non-sensitive code
- `retry_after_ms`: optional bounded hint

The API must set `Cache-Control: no-store`, `Pragma: no-cache`, `Content-Type: application/json`, and a request correlation ID that is not a secret. The service must not support arbitrary secret retrieval or generic proxy URLs.

## 5. Durable operation ledger and ambiguous outcomes

The custodian owns the authoritative ledger. `operation_id` is independent of signing `key_id` and nonce, so key rotation or a fresh nonce cannot create a new logical operation.

Minimum record:
- stable `operation_id`, owner/tenant scope, connection ID, provider, environment, operation type;
- canonical request fingerprint (SHA-256 over normalized, non-secret request contract);
- state, attempt counter, fencing token/lease, created/updated timestamps;
- sanitized terminal result or safe error code;
- provider-side idempotency/reference where supported;
- reconciliation status and audit correlation IDs.

State machine:

```text
NEW -> IN_PROGRESS -> SUCCEEDED
                   -> FAILED_FINAL
                   -> OUTCOME_UNKNOWN -> RECONCILING -> SUCCEEDED | FAILED_FINAL
```

Rules:
- Persist the claim and fingerprint before provider dispatch.
- Same operation ID + same fingerprint returns the existing state/result; it never dispatches a second provider call while an active lease exists.
- Same operation ID + different fingerprint is a hard conflict.
- Use per-operation or per-connection lease/fencing tokens and compare-and-set transitions; stale workers cannot complete or overwrite a newer state.
- A timeout after possible dispatch becomes `OUTCOME_UNKNOWN`. Never infer failure and automatically redispatch.
- Reconcile through provider status lookup or provider idempotency reference. If provider lookup is unavailable/ambiguous, retain `OUTCOME_UNKNOWN` and require controlled human resolution.
- Return the previously persisted sanitized result for a confirmed success. Do not repeat the side effect.
- Do not hold a database transaction open across a provider HTTP request. Use a durable outbox/worker pattern and idempotent consumer.
- Retention, redaction, and deletion policy must preserve necessary replay protection without storing provider secrets or full provider payloads.

The local Supabase Vault operation-journal proof in PR #112 is historical database-contract evidence only. It is not the target customer custody ledger and does not prove this API, provider reconciliation, or runtime behavior.

## 6. Secret lifecycle

- Create: validate session, workload identity, owner/connection binding, provider, environment, scope, and consent. Accept credentials only over TLS into the custody process; never echo them. Store only encrypted secret material and opaque references.
- Use: custodian retrieves/decrypts internally, executes the exact allowlisted provider adapter, and discards plaintext.
- Rotate: preserve `ROTATE_ON_NEXT_USE`; successful use marks rotation required for the next use. Provider capability registry distinguishes API-key rotation from OAuth refresh. Validate successor credentials before atomic active-version switch; retire/revoke old version. Never fall back to an old secret after a failed/ambiguous rotation.
- Revoke: mark the credential unusable immediately, then perform provider revocation where supported; retain an auditable terminal state.
- Unsupported providers: return `ROTATION_UNSUPPORTED` or `REVOKE_UNSUPPORTED`; do not weaken policy.

## 7. Audit, observability, and isolation

- Immutable audit metadata: actor subject hash/opaque ID, tenant scope, connection ID, operation ID, provider, environment, key ID, state transition, timestamps, policy decision, safe error code, correlation ID.
- Never log request/response bodies, bearer tokens, signatures, secret references if they are bearer-like, decrypted values, provider credentials, or encryption metadata that permits decryption.
- Disable query-string capture for sensitive endpoints; redact authorization and credential-shaped headers; traces must not capture bodies.
- Separate tenant data cryptographically and logically; use associated data and per-tenant authorization on every read/write/rotate/revoke.
- Fail closed on auth outage, KMS outage, unknown key ID, stale generation, registry mismatch, replay, timeout ambiguity, and provider capability mismatch.
- No secret-bearing route is exposed to browser, AI, MCP, public REST, or analytics.

## 8. Vendor evaluation — no provider selected

Evaluate only after read-only account/ownership capability checks. No assumption is made that an AWS, GCP, Azure, HashiCorp, or other paid account exists.

| Candidate | Isolation/KMS model to verify | Operational trade-offs |
|---|---|---|
| AWS isolated account: KMS + ECS/Fargate or Lambda + private data store | Separate account, IAM roles, KMS key policies, CloudTrail, PrivateLink/network boundary | Mature primitives; account/network setup and ongoing service cost |
| GCP separate project: Cloud KMS/HSM + Cloud Run + private data store | Project boundary, service accounts, IAM, audit logs, VPC egress | Managed container model; project and network configuration required |
| Azure separate subscription: Key Vault Managed HSM + Container Apps/Functions | Subscription boundary, managed identity, HSM key policies, diagnostic logs | Strong enterprise controls; subscription and service integration overhead |
| HashiCorp Vault Dedicated / HCP Vault | Dedicated cluster/account boundary, namespaces, HSM-backed seal, workload auth | Purpose-built secrets API; pricing, availability, and data-residency must be checked |
| Other managed secret-custody provider | Independent account/project, customer-managed key, workload identity, audit export, tenant isolation, portability | Evaluate lock-in, support, compliance, and exit/migration path |

Score each option on: independent account isolation; non-exportable KMS/HSM keys; asymmetric signing; mTLS/workload identity; tenant isolation; durable ledger and transactional/outbox support; audit export; regional/data-residency fit; availability/SLO; backup/restore; provider API adapter support; key/secret rotation; incident response; portability; total cost. Do not select based on marketing claims alone.

## 9. Required proof and acceptance gates

1. **ADR/threat model:** review assets, actors, trust boundaries, abuse cases, key compromise, Hub compromise, Supabase service_role compromise, insider, provider outage, replay, confused deputy, tenant crossover, backup leakage, and supply-chain compromise.
2. **Provider discovery:** read-only inspect actual account ownership, regions, KMS/HSM availability, workload identity, audit, networking, pricing tier, and free-tier limits. No provisioning or billing.
3. **Local synthetic contract proof:** API schema validation; forbidden-field rejection; Supabase session validation contract; owner/connection registry binding; workload identity; signature rotation/revocation; envelope encryption associated-data tamper rejection; no plaintext response/logging; A/B tenant isolation; operation idempotency and unknown-outcome recovery.
4. **Independent security review:** review architecture, code, key policy, deployment boundary, cryptographic library, threat model, and test evidence. ChatGPT comments and CI are not independent review.
5. **Staging A/B:** only after explicit owner approval; two synthetic staging customers, no production credentials; test create/use/rotate/revoke, cross-tenant access, replay, concurrent requests, key rotation, KMS outage, provider timeout, audit redaction, and rollback.
6. **Production:** separate explicit approval after staging sign-off, migration/rollback rehearsal, incident runbook, monitoring, and exact deployment evidence.

## 10. Non-goals and safety

- This ADR does not provision a cloud account, KMS/HSM, database, Worker, domain, secret, or paid plan.
- This ADR does not migrate or read any existing customer secret.
- Supabase Free remains unchanged.
- 1Password Developer Environment remains for developer/local tooling credentials only.
- Cloudflare Worker Secrets remain for non-customer Worker configuration only; they are not the customer secret store.
- Exness MT5 stays Demo/read-only. `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- No order, trade, position mutation, withdrawal, transfer, deposit, or live-trading capability is part of this workstream.

## 11. Current disposition

The target architecture is selected, but implementation/provider selection is not complete. Customer-secret access remains BLOCKED. The next safe action is to build and test the synthetic-only custody API contract and complete read-only provider capability discovery. Independent review and staging A/B require separate explicit approval.

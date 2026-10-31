# NOVA Secret Custody — Free-First P0 Readiness

**Status:** Free-first P0 assessment; no cloud resources provisioned  
**Repository baseline:** `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Architecture dependency:** Draft PR #130 — Option C, Separate Secret Custody Plane  
**Inspected GCP project:** `voom-80a54` (project number `252761023178`)  
**Assessment date:** 2026-10-31

## 1. Executive decision — zero new spend

The user selected a **free-first** approach. Do not create a new Google account, do not create a new GCP project, do not attach a billing account, and do not enable paid GCP services.

Keep the existing GCP project `voom-80a54` unchanged and use it only for read-only inspection or existing services that are already enabled and confirmed to have no incremental cost. Do not use it as the production custody boundary: it is an existing mixed-purpose project with Firebase, BigQuery, Firestore and other APIs enabled, and the active principal has `roles/owner`.

**Recommended P0 path:** implement and validate a separate, non-public Cloudflare Worker custody prototype using the existing Cloudflare account's Free plan, with Cloudflare D1 only if the account's current free quota is confirmed. Keep Supabase Free for non-secret connection metadata. This is a zero-new-spend prototype path, not a claim that a production-grade independent custody plane can be operated at zero cost.

Cloudflare Workers Free currently documents 100,000 requests/day and 10 ms CPU time per invocation. Cloudflare D1 is included in the Workers Free plan, with queries stopping when daily free limits are reached. Supabase Free currently provides up to two active projects per account, 500 MB database per project and 500,000 Edge Function invocations per month; free projects may pause after inactivity. Quotas and product terms can change, so verify the actual account dashboard before deployment.

This document does not authorize enabling a paid plan, adding a payment method, enabling GCP billing, provisioning GCP resources, or accepting real customer credentials.

## 2. Existing Cloudflare account — read-only inventory

A read-only Cloudflare API inspection found one authorized account, multiple existing Workers, and **zero D1 databases** at inspection time.

Relevant existing Workers include `voom-system-hub`, `voom-system-api`, `voom-system-nova-ai`, `voom-mt5-bridge-relay` and `voom-mt5-readonly-proxy`. The existing System Hub should remain the orchestration/control plane; do not add credential persistence to it. A separate custody Worker would be a new logical boundary and must be reviewed against the current repository before creation.

The Cloudflare API connection did not have the `Billing Read` OAuth scope, so account billing usage and exact plan status could not be read. Therefore the Cloudflare Free plan is **not yet independently verified for this account**. Do not create a D1 database, Worker, binding, secret, route or deployment until the account dashboard confirms the Free plan and the repository implementation plan is reviewed. Existing Worker inventory is evidence of deployed resources, not proof of the account's subscription tier or remaining free quota.

## 3. Verified Google Cloud baseline

Commands were run remotely with Google Cloud CLI 591.0.0 after interactive Google authentication.

| Check | Observed result |
|---|---|
| Project ID / name | `voom-80a54` / `Voom` |
| Project number | `252761023178` |
| Lifecycle | `ACTIVE` |
| Billing | `billingEnabled: false` |
| Active principal authentication | Successful |
| Direct project role for active principal | `roles/owner` |
| Existing enabled APIs | Includes Firebase, Firestore, BigQuery, Cloud Resource Manager, Logging, Monitoring, Generative Language and other services |
| Cloud Run API | Not enabled / unavailable in this project |
| Cloud KMS API | Not enabled / unavailable in this project |
| Secret Manager API | Not enabled / unavailable in this project |
| Artifact Registry API | Not enabled / unavailable in this project |
| Cloud Build API | Not enabled / unavailable in this project |

Cloud KMS explicitly requires a billing-enabled project. Google Cloud documentation also states that projects without an active billing account cannot use Google Cloud services, even if those services would otherwise be free. Therefore, GCP is excluded from the zero-spend custody runtime while billing remains disabled.

No GCP changes were made. The current project must not be treated as an isolated custody environment.

## 3. Free-first prototype architecture

| Concern | P0 candidate | Constraint |
|---|---|---|
| Custody API prototype | Dedicated Cloudflare Worker, separate from System Hub | Free plan CPU/request limits; not a strong independent provider boundary |
| Encrypted record prototype | Cloudflare D1 Free | Store ciphertext and minimal metadata only; daily quotas can stop queries |
| Runtime key material | Worker Secret binding | One compromised Worker/deployment authority could expose the prototype's tenant key hierarchy |
| User identity | Existing Supabase Auth session validation | Custodian must validate issuer, audience, signature and expiry independently |
| Ownership metadata | Supabase RLS-scoped connection metadata plus custodian binding record | Never trust browser-supplied owner/tenant/connection IDs |
| AI/System Hub | Calls bounded operations and receives sanitized results | Never receives plaintext credentials, DEKs, KEKs or ciphertext |
| Exness MT5 | Existing per-tenant Windows Bridge / Relay / read-only Proxy | Remains outside this API credential prototype |

### Prototype cryptography requirements

- Use envelope encryption with authenticated encryption (AES-256-GCM through WebCrypto).
- Derive or generate a distinct DEK per connection; bind owner, connection, provider, environment and generation into immutable AAD.
- Wrap each DEK with a custody key held only as a Worker Secret; never store plaintext DEKs or credentials in D1, Supabase, logs, analytics, AI prompts, browser storage or MCP.
- Use constant-time-safe validation patterns where applicable, strict request size limits, rate limiting, no-store headers, redacted audit events and explicit key-version metadata.
- Implement idempotency, replay protection, lease/fencing and an unknown-outcome reconciliation state before any provider operation.
- Never implement arbitrary URL proxying or arbitrary HTTP methods. Provider adapters are fixed allowlists.
- No trade, order placement, withdrawal, transfer, deposit or other mutation scope.

### Important production limitation

A Worker Secret is a deployment-level secret, not a dedicated KMS/HSM trust boundary. A separate Worker and D1 database provide logical separation, but they do not equal an independently administered custody account/project with non-exportable KMS keys and separately controlled key administration. Therefore:

**P0 may use synthetic credentials only. Real customer credential intake, storage and provider calls remain disabled until an independent security review accepts the key isolation, tenant binding, recovery, audit and incident-response design.**

If the prototype requires a paid Cloudflare feature, a GCP service, a paid Supabase feature, or any payment method, stop and ask the owner before proceeding.

## 4. Trust boundaries and data flow

- Secure connection form sends synthetic test credentials directly to the dedicated custody Worker over TLS.
- The custody Worker validates the customer's Supabase session itself and resolves an owner/connection binding from an authoritative source.
- Supabase stores non-secret connection metadata and an opaque `custody_ref` only.
- D1 stores authenticated ciphertext, wrapped DEK and bounded operational metadata only.
- Cloudflare System Hub authenticates as a workload and sends bounded operation intent. It cannot read ciphertext or ask for arbitrary secret export.
- The custody Worker performs fixed allowlisted synthetic-provider operations and returns sanitized results.
- AI and MCP callers never receive credential material.
- Exness MT5 terminal/Bridge credentials remain within the existing tenant-specific Bridge boundary and are not migrated into this prototype.

## 5. Free-plan guardrails

1. Do not attach a Cloudflare paid plan or enable paid add-ons.
2. Do not link a GCP billing account or enable billing on `voom-80a54`.
3. Do not create a new Google account or GCP project for this phase.
4. Do not use paid Supabase add-ons, extra compute, PITR, or paid project features.
5. Enforce application-level quotas below platform limits and return a safe `quota_exceeded` state rather than retry storms.
6. Set maximum request body, maximum ciphertext size, bounded D1 query count, bounded log volume and explicit retention.
7. Do not claim a hard financial cap from usage quotas alone; verify account plan and dashboard before deployment.
8. If an operation would cause a paid upgrade or require billing, stop without executing it.

## 6. P0 implementation sequence

1. Reconcile this free-first decision with Draft PR #130 and the legacy Vault readiness document.
2. Inspect the existing Cloudflare account plan, Worker bindings, D1 availability and current System Hub implementation without changing production.
3. Design a separate custody Worker and synthetic-only D1 schema on a feature branch.
4. Add tests for issuer/audience/session validation, cross-tenant denial, owner/connection mismatch, AAD tamper, replay, idempotency, key rotation, redaction and quota exhaustion.
5. Deploy only to an isolated non-production route after repository review; do not accept real credentials.
6. Complete independent security review and prove that no secrets enter the System Hub, AI Worker, MCP, logs or Supabase.
7. Production credential custody remains blocked pending a separately approved security boundary and key-management plan.

## 7. Explicit non-effects

During this assessment:

- No GCP billing account was linked or enabled.
- No GCP project was created.
- No GCP API was enabled or disabled.
- No IAM binding or service account was created or changed.
- No KMS key, Secret Manager secret, Firestore database, Artifact Registry repository, Cloud Run service, network, budget or alert was created.
- No Cloudflare Worker, D1 database, binding, secret, route or deployment was created or changed.
- No Supabase schema, project, secret, credential or production data was changed or read.
- No customer credential was collected.
- No broker route or trading setting was changed.
- Order Submission and Live Trading remain OFF.

## 8. Official references

- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 pricing and free-plan behavior](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 free-plan FAQ](https://developers.cloudflare.com/d1/reference/faq/)
- [Supabase Free plan and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Google Cloud KMS billing requirement](https://docs.cloud.google.com/kms/docs/restrictions)
- [Google Cloud Billing requirements](https://docs.cloud.google.com/billing/docs/how-to/manage-billing-account)


## 9. Follow-up repository and Worker inspection — 2026-10-31

### Repository and contract proof

- Re-confirmed canonical `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`; no implementation was written to `main`.
- Re-inspected `integrations/system-hub/worker.js` (blob `6d371e4bd619a84fa8d7010309ff517de15bc33e`), `wrangler.jsonc` (blob `31b057ed9fe9a94520ff35d9c3671e9703e15e55`) and its README.
- The current System Hub is an authenticated control plane for Supabase-owned connection metadata and Exness MT5 read-only operations. It has no customer Secret Custody API, encrypted credential persistence, or custodian binding registry. Keep it as the control plane; do not add customer credential storage or decryption to it.
- The existing Hub uses the customer's Supabase bearer token for Auth verification and RLS-scoped PostgREST reads. The separate custodian must independently validate the session and ownership; the Hub's authentication result is not a substitute for the custodian's own checks.
- The existing Hub configuration contains no custody D1 binding. Its current Worker config is not a deployment template for a custody service.

### Cloudflare read-only follow-up

- Confirmed the connected account identifier by listing accounts; exactly one account was returned.
- Read-only GET of `/accounts/{account_id}/d1/database` returned `count=0`.
- Read-only GET of Worker script settings for `voom-system-hub` and `voom-system-nova-ai` returned:
  - Observability enabled.
  - Invocation logs enabled and persisted.
  - `redact_query_string=false`.
  - Traces disabled.
- These settings are observations of the existing Workers only. They do not prove that a credential is currently logged or that request bodies are captured. They do establish that a new custody Worker must have a separately reviewed observability policy: no request-body/Authorization/Cookie capture, query-string redaction enabled, no plaintext/ciphertext/key material in logs, and persistence disabled unless the audit content is proven sanitized.
- The read-only account billing usage endpoint returned HTTP 403 because the connected OAuth grant has no `Billing Read` scope. The exact account plan and current quota remain unverified. Do not provision D1 or a new Worker until plan/quota is confirmed in the dashboard or a properly scoped read-only connection.

### Exact-head CI evidence for Option C proof

- PR #130 remains Draft/Open/Unmerged; its reported head is `24bd3f9ed55817178dbfc3ce23cf07617f2a9f15`.
- Frontend CI run [41149189308](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41149189308) is completed with conclusion `success` for that head. Its build job reports success for the Secret Custody contract tests, Type-check, Next.js build, and Cloudflare OpenNext Worker bundle validation.
- The PR's `netlify-production-smoke-test` job was skipped for the pull-request event. This CI result is not a hosted custodian deployment, real Supabase integration, KMS/HSM proof, mTLS proof, or independent security review.
- PR #151 remains Draft/Open/Unmerged at `8086fdebf6cfa40c50c07c6cbffe620d57a3828c`. No Actions workflow run was returned for that documentation-only head. The Netlify Deploy Preview was cancelled; this is neither a build failure nor a successful preview.

### Next safe implementation gate

1. Obtain read-only confirmation of the Cloudflare account's actual plan and remaining Workers/D1 quota. Do not grant write or billing-management permission.
2. On a feature branch stacked on the reviewed Option C contract, add only a synthetic-only custody Worker scaffold and D1 schema/tests; no production routes, secret values, or deployment bindings.
3. Add tests for log redaction/no-body-capture configuration, Auth issuer/audience/expiry, owner binding, AEAD/AAD tamper, replay/idempotency, key versioning, quota exhaustion, and safe failure.
4. Keep real customer credential intake disabled. Worker Secret + D1 remains a prototype trust boundary, not an independent KMS/HSM custody plane.
5. Require a separate owner approval before creating D1, Worker, bindings, secrets, routes, or any hosted resource.

No Cloudflare, Supabase, GCP, broker, or trading configuration was changed during this follow-up inspection.

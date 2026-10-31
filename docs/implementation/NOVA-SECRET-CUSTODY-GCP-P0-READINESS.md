# NOVA Secret Custody on Google Cloud — P0 Readiness

**Status:** P0 assessment; no cloud resources provisioned  
**Repository baseline:** `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Architecture dependency:** Draft PR #130 — Option C, Separate Secret Custody Plane  
**Inspected GCP project:** `voom-80a54` (project number `252761023178`)  
**Assessment date:** 2026-10-31

## 1. Executive decision

Google Cloud is a viable candidate for a dedicated NOVA Secret Custody Plane, but the currently inspected project `voom-80a54` must **not** be treated as the production custody boundary yet.

The project is ACTIVE and authenticated inspection succeeded. Billing is disabled. The project already has a broad set of enabled services, including Firebase, BigQuery, Firestore, and other application services; it is therefore not evidenced as a dedicated custody-only project. The current principal has `roles/owner` on this project. Do not create custody resources in this shared project as a shortcut.

**Recommended direction:** retain Option C from PR #130 and, after separate approval, provision a dedicated GCP project/security boundary for custody. Keep Supabase as metadata/identity only, Cloudflare System Hub as the control plane, and Exness MT5 credentials in the existing per-tenant Bridge boundary.

This document does not authorize billing activation, project creation, API enablement, IAM changes, key creation, databases, services, credential intake, or deployment.

## 2. Evidence from read-only project inspection

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

The API checks are read-only. A service reported as not enabled/unavailable is not evidence that the service is unsupported. No resource inventory, secret values, customer credentials, or database rows were read.

## 3. Target GCP component map (proposal only)

| Concern | Candidate component | Security / cost posture |
|---|---|---|
| Custody API and provider adapters | Cloud Run service, request-based billing, min instances = 0 | No always-on instance; IAM-authenticated ingress and independent customer-session validation required |
| KEK and constrained signing | Cloud KMS, software protection initially | Non-exportable key material; per-key-version and cryptographic-operation charges |
| Encrypted credential payloads, owner registry, operation ledger | Firestore Standard in a dedicated project | Store only application-encrypted ciphertext and bounded metadata; no plaintext credentials or DEKs |
| Container image | Artifact Registry | Retention and storage limits required |
| Runtime bootstrap secrets (only if unavoidable) | Secret Manager | Not the customer credential database; never use it as a substitute for the custody registry and operation ledger |
| Audit and operations | Cloud Logging / Monitoring | Redaction first; retention, log volume and alerting costs must be budgeted |

Do not add Cloud SQL, always-on Compute Engine, GKE, VPC connectors, Cloud HSM, or paid backup/PITR features to the first proof unless a documented security or recovery requirement makes them necessary.

### Data and trust boundaries

- Supabase stores non-secret connection metadata and an opaque `custody_ref` only.
- Customer credential intake goes directly from the secure connection form to the custodian over TLS; it must never pass through chat, AI, MCP, browser storage, analytics, or the System Hub.
- The custodian independently validates the customer Supabase session and resolves the owner/connection binding. A browser-supplied user ID, tenant ID, provider, environment, or custody reference is not authorization.
- Cloudflare System Hub authenticates as a workload and sends bounded operation intent. It never receives plaintext credentials, DEKs, KEKs, or generic secret-read capability.
- The custodian performs fixed allowlisted read-only provider operations and returns sanitized business results.
- Every operation uses a durable idempotency ledger, lease/fencing, replay protection, and an explicit unknown-outcome reconciliation path.
- Exness MT5 Windows Bridge credentials remain outside this customer API credential custody plane.

## 4. Region feasibility

### Bangkok candidate: `asia-southeast3`

Official Google Cloud location documentation currently lists:

- Cloud Run in Bangkok (`asia-southeast3`), subject to Tier 1 pricing.
- Firestore Standard regional location in Bangkok.
- Cloud KMS software keys in Bangkok.

Important limitation: Bangkok is listed without multi-tenant Cloud HSM or Cloud External Key Manager support. Cloud Run Serverless VPC Access connectors are also not supported in Bangkok.

**P0 recommendation:** evaluate a Bangkok regional design using Cloud Run + Firestore + software-protected Cloud KMS keys, with public HTTPS ingress protected by strong workload identity/mTLS and application authorization. Do not deploy or expose an endpoint until the Cloudflare-to-GCP workload authentication design is proven.

If HSM protection or a Serverless VPC Access connector is a mandatory requirement, evaluate Singapore (`asia-southeast1`) as an alternative and document the latency, data-location, network, and pricing trade-offs. Do not silently downgrade a mandatory HSM requirement to software keys.

The default Firestore database location can be coupled to other default Google Cloud resources and cannot be changed after provisioning. Region choice must therefore be approved before database creation.

## 5. Cost model and budget controls

Prices below are public list-price references, not a quote or forecast. Final cost depends on region, usage, billing account, tax/currency, network egress, log volume, retention, and product configuration.

| Component | Published pricing reference | P0 interpretation |
|---|---|---|
| Cloud Run | Request-based pricing is usage-based; published Tier 1 rates include $0.000024 per vCPU-second, $0.0000025 per GiB-second and $0.40 per million requests before free-tier application | Use min instances = 0; enforce max instances, concurrency, request limits and budget alerts |
| Cloud KMS software key | About $0.06 per active key version/month; $0.03 per 10,000 cryptographic operations | One active software KEK is low fixed cost; rotation may temporarily increase active-version count |
| Cloud KMS multi-tenant HSM key | About $1.00 per active AES-256 key version/month | Not available in Bangkok; Singapore is a candidate if HSM is required |
| Firestore Standard | Free quota includes 1 GiB stored data, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day and 10 GiB outbound transfer/month | Potentially low-cost for a small proof within quota; overage, region, indexes, backups/PITR and egress are variable |
| Secret Manager | First 6 active versions and first 10,000 access operations/month are listed as free | Optional bootstrap-only use; do not put customer credential payloads here in this design |
| Artifact Registry, Logging, Monitoring and network egress | Usage/retention/region dependent | Must be included in the calculator and budget alert before deployment |

### Illustrative low-volume envelope (not a bill estimate)

Assume one software-protected KEK, no minimum Cloud Run instances, a single Firestore database, low-volume synthetic requests, and no paid HSM/VPC connector/Cloud SQL. The KMS fixed key-version component is approximately **$0.06 USD/month**, plus cryptographic operations. Cloud Run and Firestore may remain within applicable free quotas at low usage, but billing is still required for the planned managed-service deployment and no $0 total is promised. Logging, Artifact Registry, egress, backup/PITR and any usage above free quotas can add charges.

Before enabling billing, calculate and approve a concrete monthly ceiling using expected requests, average CPU/memory duration, encrypted record count/size, KMS operations, log retention and egress. Configure budget alerts at 50%, 80% and 100%; note that budget alerts notify and do not automatically cap spend.

## 6. Identity and integration proof gates

These are unresolved P0 gates, not assumed capabilities:

1. Verify Cloudflare Worker-to-GCP workload identity federation or an acceptable mTLS design using short-lived credentials; no static service-account key in Cloudflare, GitHub, Supabase, or chat.
2. Prove that the custodian independently validates the expected Supabase Auth issuer and customer subject without Supabase `service_role`.
3. Prove owner/connection lookup through the customer's RLS-scoped metadata path and a custodian-owned binding registry.
4. Define separate deployer, runtime, key-use, key-admin, audit-reader and break-glass identities. No broad Owner role for runtime.
5. Restrict KMS decrypt/sign permissions to the custody runtime and only the required key resources; separate key administration from application deployment.
6. Verify Cloud Run ingress, authentication, egress allowlists, rate limits, request-size limits, no-store headers and logging redaction.
7. Complete synthetic-only tests for cross-owner denial, invalid/expired session, wrong issuer/audience, binding mismatch, AAD tamper, replay, idempotency conflict, key rotation and ambiguous provider outcome.
8. Confirm regional data-location and legal/privacy requirements before accepting real customer credentials.

## 7. P0 exit criteria

- [x] Confirm repository `main` baseline and inspect canonical delivery plan.
- [x] Inspect GCP project identity, lifecycle, billing, enabled APIs and direct principal role using read-only commands.
- [x] Confirm Cloud Run, KMS and Firestore regional feasibility from official documentation.
- [x] Record a preliminary cost model and no-billing guardrail.
- [ ] Reconcile this assessment with Draft PR #130 and obtain architecture/security review.
- [ ] Approve dedicated project ownership, billing account, region, and monthly spend ceiling.
- [ ] Verify Cloudflare-to-GCP workload identity/mTLS proof without long-lived keys.
- [ ] Only after approval: create a dedicated project, enable the minimum required APIs, configure budgets, and provision isolated synthetic-only resources.

## 8. Explicit non-effects

During this P0 assessment:

- No billing account was linked or enabled.
- No new GCP project was created.
- No API was enabled or disabled.
- No IAM binding or service account was created or changed.
- No KMS key, Secret Manager secret, Firestore database, Artifact Registry repository, Cloud Run service, network, budget, or alert was created.
- No customer credential, broker secret, production data, or Supabase secret was accessed.
- No application runtime, Cloudflare Worker, Netlify deployment, broker route, or trading setting was changed.
- Order Submission and Live Trading remain OFF.

## 9. Official references

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud KMS pricing](https://cloud.google.com/kms/pricing)
- [Cloud KMS locations](https://cloud.google.com/kms/docs/locations)
- [Cloud Run locations](https://cloud.google.com/run/docs/locations)
- [Firestore Standard pricing](https://cloud.google.com/firestore/pricing)
- [Firestore Native mode locations](https://cloud.google.com/firestore/native/docs/locations)
- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)

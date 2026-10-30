# NOVA Data Guardian — Architecture Foundation

Status: design foundation; not production-ready.
Tracking: GitHub Issue #132.
Base: main at a2acfd8ec9b598e6593413549bef760e8f596a72.

## Purpose

A governed subsystem for file inventory, safe resizing and conversion, cleanup candidate review, security inspection, versioned backup, recovery and scheduled maintenance. It extends the existing NOVA platform; it is not a parallel identity system or application.

## Repository baseline

The canonical delivery plan requires feature branches, reviewed PRs and evidence-backed completion. The frontend package currently uses Next.js 15, React 19 and TypeScript. Repository search has not established an existing production Data Guardian runtime or an approved storage adapter; this is a limited search result, not proof that no related code exists.

## W0: required read-only inventory

Before implementation touches real data, inspect:
1. Existing upload/download routes, file parsers, temp paths, jobs and retention behavior.
2. Supabase project/schema/migration baseline, RLS and storage policies.
3. Existing local/NAS/object-storage providers, ownership, region, encryption, quotas and lifecycle rules.
4. Trusted server-side identity and canonical owner/tenant mapping.
5. Deployment topology, secrets placement, logs, CI and restore capability.

No provider, bucket, database, migration, secret, schedule or deployment is selected or modified by this document.

## Architecture

```text
NOVA UI
  -> authenticated NOVA API
  -> Data Guardian control plane
       policy + approvals
       scheduler + bounded queue
       durable job journal
       trusted tenant-scope resolver
  -> isolated workers
       file processor | security scanner | backup | recovery
  -> storage adapter interface
       local | NAS | object storage (future)
  -> integrity receipts + sanitized audit
```

This is a logical design, not a claim that these services exist today.

## Safety invariants

- Preserve the original object during every transform. Write to a private staging area, validate the result and verify hashes before promotion.
- Cleanup discovers candidates only. Move approved candidates to reversible quarantine; permanent deletion is a separate privileged action requiring explicit human approval.
- Scanner errors, stale signatures, timeouts, encrypted/unsupported files and size-limit skips are indeterminate, never clean.
- Backup is valid only after manifest and checksum reconciliation. Restore first targets an isolated destination; live replacement requires separate approval.
- Unknown file types, ambiguous ownership, quota exhaustion, checksum mismatch, expired approval and unavailable providers fail closed.
- Tenant scope is derived by trusted server-side NOVA authorization. Never trust client/model-supplied owner IDs, tenant IDs, paths or bucket names.
- Use durable idempotency, bounded retries, cancellation and outcome reconciliation for external side effects.
- Logs contain operation metadata and sanitized error codes, never file contents, secrets or credentials.

## Module responsibilities

1. Inventory: opaque object reference, trusted scope, adapter, media type, size, timestamps, checksum, retention class and inspection state.
2. Resize/conversion: allow-listed formats; signature-based type detection; CPU, memory, output-size and wall-clock limits; staged output; source preservation.
3. Cleanup: identify known temporary/cache/duplicate candidates; exclude unknown and user-owned content from heuristic deletion.
4. Security inspection: scanner adapter (ClamAV is only a candidate); isolated execution; explicit clean/detected/indeterminate/not_scanned states.
5. Backup: full and incremental/versioned adapter, encryption, separate credentials, retention and immutable/offline options where supported.
6. Recovery: isolated restore, object-count and hash checks, format validation, ownership checks and rollback point.
7. Automation: scheduled inventory/scan/backup, bounded concurrency, tenant quotas, approvals and auditable job lifecycle.

## Job lifecycle

REQUESTED -> AUTHORIZED -> PLANNED -> [APPROVAL_PENDING] -> STAGED -> EXECUTING -> VERIFYING -> COMMITTED | QUARANTINED | REJECTED | FAILED.

Ambiguous provider outcomes enter RECONCILIATION_REQUIRED; do not blindly repeat a side effect. Terminal states are immutable. Retries reuse the idempotency key.

## Proposed contracts

Request: schema_version, job_id, idempotency_key, operation enum, opaque object references, allow-listed options, server-injected actor context, policy version and approval reference.

Result: job_id, state, timestamps, retry count, sanitized object reference, source/result SHA-256, inspection verdict, verification receipt, audit reference and structured error code.

Never persist file bytes, raw credentials, presigned URLs or customer content in job metadata.

## Tenant and storage boundary

Reuse NOVA's existing trusted identity path. Verify the canonical owner/tenant key and organization model against the actual schema before persistence. Storage adapters re-check authorization at each read/write boundary. Supabase may hold metadata/job/audit records only after schema, RLS and migration baseline review; this proposal creates no tables and assumes no object-storage provider.

## Delivery gates

| Phase | Deliverable | Exit evidence |
|---|---|---|
| W0 | Repository/schema/provider inventory | Read-only evidence and explicit blockers |
| W1 | Architecture, threat model, synthetic contract tests | Review of lifecycle and failure semantics |
| W2 | Isolated local processing | Staging, validation, hash, rollback and resource-limit tests |
| W3 | Scanner and quarantine adapter | Positive, negative, timeout and unsupported-file tests |
| W4 | Encrypted versioned backup and restore | Verified manifest and successful isolated restore |
| W5 | Authenticated NOVA API/UI and scheduler | Owner allow/deny, two-tenant and durable-recovery tests |
| W6 | Controlled activation | Separate approval, provider evidence and rollback plan |

## Explicit non-goals

No production/customer storage access, permanent deletion, in-place overwrite, provider provisioning, Supabase migration, RLS/grant change, production schedule, deployment or activation. No secrets or customer files in source control.

## Definition of done

Exact-head reviewed PR; tests pass; owner/tenant isolation is evidenced; source preservation and rollback work; cleanup is approval-gated; inspection failures are never called clean; backup and restore are verified; audit is sanitized; and runtime/provider evidence is attached to Issue #132.

Reference: docs/NOVA-DELIVERY-VERIFICATION-ACTIVATION-PLAN.md.

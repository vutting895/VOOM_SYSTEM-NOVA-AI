# NOVA Data Guardian — Initial Threat Model

Status: initial design review artifact; not independent security approval.
Tracking: Issue #132.
Architecture: docs/architecture/NOVA-DATA-GUARDIAN-ARCHITECTURE.md.

## Assets

- Original files and generated derivatives.
- Tenant ownership and object metadata.
- Backup archives, manifests and encryption keys.
- Inspection signatures and verdicts.
- Approval records, job journal and audit events.
- Storage-provider credentials and recovery capability.

## Trust boundaries

1. Browser or AI model to authenticated NOVA API.
2. NOVA API to trusted identity/authorization resolver.
3. Control plane to isolated processing and inspection workers.
4. Workers to storage adapters and quarantine.
5. Backup worker to independent backup target and key-management boundary.
6. Recovery worker to isolated restore target and approved live destination.

A client-supplied object ID, path, tenant identifier, filename, MIME type, scan status or backup manifest is never proof of trust or ownership.

## Threats and controls

| Threat | Required control | Fail-closed response |
|---|---|---|
| Cross-tenant access | Server-derived scope and adapter-level authorization | Deny and audit |
| Unsafe paths or links | Opaque IDs, canonical path checks, no user path concatenation | Reject |
| Malicious or malformed input | Isolated worker and CPU/memory/time/output limits | Stop; preserve source |
| Oversized archives | Entry, nesting and expanded-size limits | Reject or mark indeterminate |
| File-type spoofing | Content signature plus safe decoder | Reject mismatch |
| Arbitrary external fetch | No untrusted URL input; controlled egress | Reject |
| Scanner outage or stale signatures | Health and signature freshness gate | Indeterminate, never clean |
| Unsupported/encrypted content | Explicit not_scanned state | Never clean |
| Cleanup false positive | Candidate-only flow, reversible quarantine | No permanent delete |
| Transform corruption | Staging, validation, hashes and rollback | Preserve source |
| Backup alteration or omission | Independent manifest and checksum reconciliation | Not verified |
| Unsafe restore | Isolated restore and separate promotion approval | Do not promote |
| Duplicate job replay | Idempotency key and durable journal | Return prior result/reconcile |
| Ambiguous provider outcome | Outcome journal and provider reconciliation | Stop retry |
| Approval replay/escalation | Actor, operation, object and expiry binding | Reject |
| Key exposure | Managed custody, least privilege, rotation and audit | Revoke and suspend |
| Log/content leakage | Metadata-only logs and redaction | Suppress sensitive fields |
| Resource exhaustion | Tenant quotas and bounded concurrency | Backpressure |

## Mandatory invariants

1. Transformations never overwrite the source object.
2. Cleanup can only create a candidate or move an object to reversible quarantine.
3. Permanent deletion is a separate operation requiring explicit human approval.
4. Scanner errors, timeouts, stale signatures and unsupported files are never a clean verdict.
5. Backup success requires manifest and checksum reconciliation.
6. Restore first targets an isolated destination.
7. Ownership ambiguity or authorization failure blocks the operation.
8. External side effects use idempotency and durable outcome reconciliation.
9. AI may propose work but cannot approve itself, select tenant scope or change policy.
10. Every mutation has a sanitized audit record.

## Synthetic security test matrix

- Owner A can access their own synthetic object; Owner B cannot read or mutate it.
- Missing, expired and malformed auth context is rejected.
- Client-supplied owner/tenant override is rejected or ignored.
- Traversal, symlink escape and arbitrary URL inputs are rejected.
- Decoder failure and resource limits preserve the source.
- Scanner unavailable, stale signatures and unsupported content yield indeterminate/not_scanned.
- Positive detection enters quarantine; no permanent deletion occurs.
- Cleanup cannot purge without a distinct valid approval.
- Backup checksum mismatch prevents verified status.
- Restore hash mismatch prevents promotion.
- Duplicate replay does not repeat an external mutation.
- Ambiguous provider outcome enters reconciliation-required.
- Approval for a different object, operation, actor or expired window is rejected.
- Audit assertions prove secrets and file contents are absent.

## Decisions still required

Storage provider/region, key custody, immutable retention support, canonical owner/tenant identity, migration baseline, scanner selection/signature maintenance, RPO/RTO, retention/legal-hold rules and recovery authority remain undecided. No independent security review, penetration test, restore drill or production control is claimed.

## Approval gates

W1 design approval does not authorize production data access. W2-W4 use isolated synthetic files. W5 requires verified identity/RLS and staging approval. Production activation requires separate explicit approval after independent review and successful restore rehearsal.

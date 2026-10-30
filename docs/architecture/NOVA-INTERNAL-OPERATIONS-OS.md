# NOVA Internal Operations OS — Architecture and Delivery Contract

**Status:** Proposal / review required  
**Tracking:** [Issue #126](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/126)  
**Canonical base:** `main@a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Operating mode:** Read-only + AI Analysis; no production activation

## 1. Purpose

NOVA Internal Operations OS (NIOS) is the governed operations layer for managing internal work across VOOM. It coordinates tasks, workflows, agents, approvals, incidents, evidence, runbooks and operational reporting through existing NOVA infrastructure.

NIOS is not a second control plane. The existing NOVA System Integration Hub remains the deterministic identity, authorization and policy boundary. AI agents propose and perform only explicitly allow-listed actions under server-enforced authority.

## 2. Existing ownership and reuse boundaries

| Capability | Canonical owner to reuse | NIOS responsibility |
|---|---|---|
| Identity and tenant authorization | Supabase Auth + NOVA System Integration Hub | Consume verified principal/tenant context; never trust model/client identity |
| API routing and policy enforcement | Existing System Integration Hub / Workers | Register bounded internal operation actions |
| Human approvals | Existing durable approval lifecycle and migration | Bind operation plans to existing approval records; no parallel approval engine |
| Secrets | VOOM Vault / approved provider secret stores | Request scoped references through backend; never handle or display secret values |
| AI provider selection | Existing AI Provider Gateway | Use existing adapter/fallback policy |
| Tool execution | Existing FastMCP and allow-listed service adapters | Register typed tools with least privilege |
| Customer workspace | Existing customer workspace workstream (Issue #82) | Keep internal operations data separate from customer workspace data |
| Security incident response | Existing NOVA Sentinel proposal (PR #121) | Consume normalized security events and coordinate bounded response |
| Learning and Skill lifecycle | Learning Universe / Auto-GenSkill workstream (PRs #117, #123, #124) | Submit sanitized observations and Skill proposals; never auto-publish |
| Delivery governance | Delivery Verification and Activation Plan | Follow branch, PR, evidence and activation gates |

Any new persistence, queue, service or UI route must first demonstrate that no existing contract or service already owns the responsibility.

## 3. Logical architecture

### 3.1 Control plane

- **Operations API:** authenticated entry point for internal task, workflow and reporting requests.
- **Policy evaluator:** deterministic allow/deny decision based on actor, tenant, action, resource, risk, environment and policy version.
- **Agent registry:** server-owned agent identity, capability manifest, tool allowlist, resource scope, expiry and status.
- **Approval adapter:** integration with the existing durable approval lifecycle.
- **Audit/evidence writer:** append-only event recording with correlation and action identifiers.
- **Operations read model:** derived status and metrics for the internal console.

### 3.2 Execution plane

- Existing Cloudflare Workers and System Integration Hub routes.
- Existing FastMCP tools and narrow service adapters.
- Existing event/queue infrastructure only after inventory confirms available bindings and delivery guarantees.
- Sandboxed, bounded task execution; no arbitrary shell, dynamic code or unrestricted URL fetch.

Control-plane decisions must be made before execution. An execution worker cannot grant itself authority or override a policy denial.

## 4. Core domain contracts

Initial contracts are logical boundaries, not a claim that database tables or runtime services already exist.

| Contract | Required fields / invariants |
|---|---|
| OperationTask | task_id, tenant_scope, requester, type, priority, status, due_at, idempotency_key, created_at |
| OperationEvent | event_id, source, event_type, occurred_at, received_at, correlation_id, sanitized_payload_ref |
| WorkflowDefinition | workflow_id, version, typed steps, transition rules, timeout/retry policy |
| WorkflowRun | run_id, workflow/version, checkpoint, attempt, lease/fencing token, state, evidence refs |
| AgentManifest | agent_id, version, owner, allowed tools, input/output schemas, scopes, limits, expiry |
| OperationAction | action_id, actor/delegator chain, target, scope, risk class, action digest, policy version |
| ApprovalRequest | existing approval ID, action digest, target/scope, requester, approver, expiry, decision |
| AuditEvent | actor, tenant, action, resource, policy version, correlation ID, outcome, timestamp |
| EvidenceRecord | evidence_id, source, exact revision/run, test result, timestamp, integrity hash, retention class |
| Incident | incident_id, severity, affected scope, signals, owner, containment state, resolution evidence |

All contracts are versioned, size-bounded and strict: reject unknown fields, invalid state transitions, untrusted ownership claims and unsupported actions. Sensitive data is represented by server-side references, never copied into model context or event payloads.

## 5. Workflow lifecycle and reliability

Suggested task lifecycle:

`NEW → TRIAGED → PLANNED → AWAITING_APPROVAL → QUEUED → RUNNING → VERIFYING → COMPLETED`

Exceptional terminal or holding states:

`BLOCKED`, `FAILED`, `CANCELLED`, `ROLLED_BACK`, `NEEDS_OPERATOR`.

Rules:

1. Every event and task has a stable identifier and idempotency key.
2. Side-effecting steps require deduplication and explicit replay semantics.
3. Retries are bounded, exponential/backoff-aware and safe for the action type.
4. Exhausted retries go to a dead-letter or operator-review state; never silently disappear.
5. Durable checkpoints and leases/fencing prevent concurrent workers from committing stale results.
6. A task reaches COMPLETED only after its declared verification contract passes and evidence is attached.
7. Provider/CI success is not interchangeable with deployed runtime verification.

## 6. Risk and autonomy policy

| Level | Permission | Examples |
|---|---|---|
| L0 | Observe | Read health, task status, sanitized metrics |
| L1 | Analyze/propose | Diagnose, prioritize, draft plans and PR descriptions |
| L2 | Bounded low-risk execution | Create internal task, label, report, retry safe read-only check |
| L3 | Human approval required | Production change, permission change, secret lifecycle action, broad incident containment |
| DENY | Prohibited regardless of model confidence | Self-escalation, arbitrary code/shell, destructive cleanup, broker writes, order submission, Live Trading |

Authorization is evaluated on the server for every tool call. Delegation is attenuated, scoped, attributable and time-limited. An agent cannot issue a broader capability than its delegator. Approval is bound to an immutable action digest, target, scope, environment, policy version and expiry; any material change invalidates the approval.

## 7. Incident management

- Normalize signals from existing monitoring, CI, Workers and Sentinel.
- Correlate by resource, tenant scope, event time and stable fingerprints.
- Use severity and blast-radius classification to prioritize.
- Permit only reversible, explicitly allow-listed containment at L2.
- Require human approval for broad blocking, deletion, credential rotation, customer-impacting changes or production modifications.
- Record before/after evidence, operator decisions, rollback path and recovery verification.
- Never perform retaliatory actions, external scanning or offensive operations.

## 8. Data isolation, privacy and audit

- Tenant and actor identity must be derived from verified server-side authentication.
- Internal operator scope is distinct from customer tenant scope; break-glass access requires explicit policy, reason, expiry and audit.
- Apply RLS and least-privilege grants to any new persisted data.
- Do not put provider secrets, tokens, broker credentials, customer content or raw prompt payloads into logs, issue bodies, traces or model context.
- Audit records are append-only from application roles; corrections are compensating events.
- Record policy version, actor/delegation chain, action digest, correlation ID, outcome and evidence references.
- Define retention, export and incident access before storing sensitive operational records.

## 9. User interface

Integrate into the existing NOVA frontend; do not create a second application.

Initial navigation areas:
- Overview: system health, priority queue, active incidents and blocked work.
- Tasks: filters, ownership, priority, dependency and evidence.
- Workflows: runs, checkpoints, retries and dead-letter review.
- Agents: registry, status, capabilities and bounded usage.
- Approvals: pending decisions and immutable action summaries.
- Incidents: severity, containment, escalation and recovery.
- Evidence & Reports: CI/runtime evidence, audit trail, runbooks and operational metrics.

UI must reflect authoritative backend state. No optimistic “success” state for actions not confirmed by the service.

## 10. Delivery sequence and gates

### M0 — Inventory (current)
Map existing issues/PRs, routes, Workers, migrations, approval lifecycle, Vault access, queues, observability, tests and UI ownership. Produce a path/ownership/dependency map. No runtime mutation.

### M1 — Contracts
Add strict schemas and deterministic state-machine tests on a feature branch. Verify compatibility with existing intent envelope, approval contracts, System Hub and agent/skill contracts.

### M2 — Durable workflow
Only after queue/storage inventory: implement event persistence, checkpoints, idempotency, retries, leases, dead-letter and crash recovery.

### M3 — Governance
Integrate existing approvals; add action digest binding, policy versioning and negative tests for unauthorized or stale approvals.

### M4 — Agent and incident operations
Add agent registry/manifest enforcement and safe incident correlation/containment. Reuse Sentinel; do not create a second security event detector.

### M5 — Console
Build internal operations views inside the current NOVA frontend, using server-backed state and evidence links.

### M6 — Staging verification
Exact-head CI, migration/RLS checks, two-tenant tests, secret-redaction checks, queue recovery drills, preview/runtime smoke tests and rollback rehearsal.

Production activation requires explicit owner approval after all applicable gates pass.

## 11. Required verification

- Schema validation: unknown fields, malformed IDs, oversized payloads, invalid transitions.
- Authorization: unauthenticated, wrong role, expired delegation, tenant mismatch and cross-agent access denied.
- Approval: stale digest, changed target, expired approval and wrong approver denied.
- Reliability: duplicate delivery, timeout, crash/restart, stale lease and exhausted retries.
- Audit: every decision and action has actor, scope, policy version, correlation ID and outcome.
- Security: no secret leakage, prompt-injection tool escalation, arbitrary execution or cross-tenant reads.
- Operations: dashboards derive from backend state; failure and rollback are visible.
- Safety: broker order/write tools remain absent; Exness Demo read-only; order submission and Live Trading OFF.

## 12. Research basis and limitations

SciSpace discovery informed this design:
- Dai & Swaminathan, *Artificial Intelligence and Operations: A Foundational Framework of Emerging Research and Practice*, DOI: 10.1177/10591478251412943 — operations discipline, process control, drift detection and Human–AI interaction.
- *Unified Multi-Channel AI Orchestration Platform Architecture*, DOI: 10.32996/jcsts.2025.7.10.42 — control/data-plane separation, policy engine, registry, audit and multi-tenancy.
- Dutta, *Accountable Multi-Agent AI Systems: Orchestration Frameworks for Enterprise Workflow Automation with Human-in-the-Loop Verification*, DOI: 10.5281/zenodo.19844471 — approval checkpoints, trust zones and risk-gated delegation.

These papers provide design hypotheses and reported approaches, not validation of NOVA implementation or a guarantee of security/performance. Each proposed control must be verified against repository code and tests.

## 13. Current status

- This document is an architecture proposal only.
- No runtime service, migration, queue, Worker binding, secret, provider setting or deployment was changed.
- No tests or production behavior are claimed as passed.
- Implementation remains blocked on M0 inventory and architecture review.
- Exness Demo remains read-only; `ordersEnabled=false`, `executionEnabled=false`, `order_submission_enabled=false`, Live Trading OFF.

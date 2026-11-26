# WO-2026-11-26-002 — NOVA Brain Core, Permission Engine and Exness Demo Execution Readiness

Status: APPROVED — engineering and testing only; broker execution activation is NOT AUTHORIZED.
Central registry: https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-26-002-nova-brain-permission-demo-readiness.md
Approval: User explicitly approved this scoped Work Order and autonomous continuation on 2026-11-26 (Asia/Bangkok).
Baseline: NOVA main 56bf51d2e719a4cc79d73421e135099175a1e300.
Related candidates: PR #334, #336, #276, #277, #278, #414, #426, #429. Reference/reuse only; do not merge, close, rebase, force-push or modify these PRs.

## Objective
Deliver Brain Core orchestration within the existing System Hub/Remote MCP Gateway, deterministic backend Permission Engine, and a separate disabled-by-default Exness Demo Execution Adapter. Reuse existing contracts and components; do not create a second Gateway, duplicate research runtime, or duplicate broker service.

## Scope
- Audit current Main, tracker, logs, existing PR candidates, approval lifecycle, identity/tenant model, risk services and MT5 boundaries.
- Define typed Brain intents/events, lifecycle state, correlation, bounded tool routing and failure handling.
- Enforce server-side permissions using verified principal, tenant/resource ownership, capability allowlists, expiry, nonce/idempotency, policy version and immutable approval/payload binding.
- Reuse reviewed PR #334/#336 execution candidates and PR #276–278 policy/risk/decision work only after exact-head review.
- Implement isolated Demo adapter scaffold and simulator/preflight only. No broker dispatch is reachable in this phase.
- Preserve the read-only MT5 Bridge/Proxy/Relay unchanged.
- Add deterministic unit, integration, negative authorization, replay, tenant isolation, audit redaction and disabled-state tests.
- Update Issue #36 and logs/OPERATIONS.md with exact SHA, changed paths, tests and evidence.

## Invariants
ordersEnabled=false
executionEnabled=false
liveTradingEnabled=false

No actual Demo order, position/order mutation, Live connection, broker write, production DB/schema change, production secret/permission change, deployment, paid service, infrastructure provisioning, fund movement or withdrawal. Datacenter remains sole owner of research/learning computation and authoritative research lineage.

## Governance
This Work Order follows the owner-approved Main-only direction for this exact scope. Issue #36 contains a conflicting legacy PR-only statement; the owner explicitly approved this Work Order's Main-only delivery. Record this narrow exception in the tracker. Do not reinterpret it as a general policy change for unrelated work.

## Phases
0. Source/overlap audit — preliminary review found the candidate PRs above; complete exact-head paths, dependencies and CI review before source changes.
1. Brain Core contracts and orchestration boundary — existing Hub/Gateway only; Brain cannot grant execution permission.
2. Permission Engine — deny-by-default, tenant/resource binding, capability checks, expiry/replay protection and immutable audit.
3. Demo Execution Adapter scaffold — separate process/command namespace; preflight/simulator only; no broker dispatch.
4. Exact-head tests and security validation — jobs must receive runner assignment and execute inspectable steps; runner_id=0/empty steps are not test evidence.
5. Readiness dossier — threat model, account/environment proof, risk policy, idempotency, kill-switch, reconciliation, audit and simulator evidence; no activation.

## Stop conditions
BLOCKED_DECISION for scope expansion, authentication/authorization policy change, production release or broker execution authority. BLOCKED_DEPENDENCY for unresolved identity/schema mapping, missing dependencies, unavailable test runner or missing evidence. The user's no-repeat-approval instruction applies only within this Work Order; activation and production gates remain mandatory.

## Initial status
Phase 0 IN_PROGRESS. No runtime code, broker mutation, test PASS, deployment or activation is claimed by this registration.

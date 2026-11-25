# NOVA Repository Work Order Instructions

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Default branch:** `main`  
**Central registry:** https://github.com/vutting895/voom-shared-contracts  
**Applicable work order:** `WO-2026-11-24-001`

## Mandatory pre-work sequence

Before every task, including recurring, agent-driven, or automated work:

1. Read this file and the current central Work Order `WO-2026-11-24-001`, including its approval state, phase, scope, dependencies, and stop conditions.
2. Read NOVA Master Tracker Issue #36, but verify its baseline against the live `refs/heads/main` SHA and inspect current PR/issue heads. The baseline embedded in Issue #36 may be stale; never treat an old SHA or historical CI table as current evidence.
3. Read `logs/OPERATIONS.md` and the latest relevant implementation, integration, security, and release-gate records.
4. Inspect existing instructions, trackers, tests, GitHub Actions, and other automation before proposing changes. Do not create duplicate workflows or trackers.
5. Reconcile the task with active PRs/issues and the approved architecture boundary before changing code.
6. Read the current `main` SHA before mutation. NOVA implementation work is main-only under the current repository-owner operating direction; do not follow stale branch instructions that conflict with this current rule. Never force-push or rewrite history.
7. Confirm that the task is explicitly covered by an approved work order. Do not infer approval from a general request or a completed adjacent phase.

## NOVA ownership and safety boundaries

- NOVA owns the user-facing UI/dashboard, Supabase authentication/session flow, the single NOVA Remote MCP Gateway, AI Provider Gateway/general platform orchestration, Knowledge service, read-only broker data access, and trading risk/execution safety controls.
- Datacenter is the sole owner of research and learning computation and authoritative research lineage: data/quality, features/labels, SMC, Elliott Wave, strategy research/optimization, backtesting, walk-forward research, model training, evaluation, and model registry.
- Route Datacenter work only through the existing authenticated NOVA Remote MCP Gateway and the single Datacenter MCP endpoint. Do not create a second Gateway, browser-direct Datacenter access, or duplicate authoritative research storage.
- Preserve legacy NOVA modules until a verified Datacenter replacement, caller parity, rollback plan, and consolidated tests are evidenced.
- Exness MT5 remains Demo/read-only. Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`. No order execution, account mutation, transfer, or withdrawal authority is granted.
- Research/model approval does not authorize broker execution.
- Production deployment is paused. Do not deploy, change production secrets, or activate execution under this work order.
- Oracle Cloud VM provisioning is excluded and prohibited under WO-2026-11-24-001.

## Autonomous phase continuation and stop conditions

Continue only the phases explicitly approved in the central Work Order when their dependencies and acceptance criteria pass. Stop at `BLOCKED_DECISION` for architecture/ownership/security/permission/cost changes, production release, trading activation, or destructive actions. Stop at `BLOCKED_DEPENDENCY` for missing host/API/auth dependencies. Stop on failed tests, stale PR/base/head evidence, incomplete data provenance, or unsupported claims.

## Required evidence

Append to `logs/OPERATIONS.md` for each meaningful operation: UTC timestamp, operation/WO ID, repository, branch, before/after SHA, paths, checks and exact results, evidence links, blockers, and next action. Distinguish authored tests from executed tests; jobs that never receive a runner or execute steps are not test results. Never claim integration, training, profitability, readiness, or completion without corresponding evidence.

## Work-order authority

The central registry defines approval and scope. This local file adds NOVA-specific execution boundaries and does not authorize work outside the central Work Order.


## Reporting scope — REPORTING-SCOPE-001

- Canonical policy: https://github.com/vutting895/voom-shared-contracts/blob/main/standards/REPORTING-SCOPE-POLICY.md
- Rollout work order: `WO-2026-11-24-002` in the central registry.
- When a report is requested from the NOVA Project/repository context, report only NOVA's own tasks, phases, status, blockers, logs, evidence, and next actions.
- You may identify an external repository as a dependency, but must not merge its internal work or progress into a NOVA-local report.
- Cross-repository reporting is reserved for the central Ecosystem Governance / Master Coordination context, and only for repositories with recorded active or planned work. Each repository must remain separately identified with its own evidence and status.
- Do not treat GitHub account membership as ecosystem membership. Do not include Voom Studio Affiliate, Voom_system, or unclassified repositories unless the central registry explicitly approves them.


## Supplemental approved architecture work — WO-2026-11-24-003

- Central Work Order: https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-24-003-voom-target-architecture.md
- This Work Order authorizes documentation-only target architecture and repository-structure records in this repository and the central registry.
- Target: VOOM AI is the main AI automatic-trading application; this repository is the combined VOOM System + NOVA Command Center; Datacenter remains the sole research/learning owner; Shared Contracts remains the canonical schema source.
- Security & Identity, Infrastructure & DevOps, Knowledge Center, and QA & Testing are internal workstreams, not separate ChatGPT Projects.
- Every status report must identify the exact repository full name, branch, commit SHA, Work Order/Task ID, status, changed paths, tests/checks, evidence, blockers, and next actions.
- This Work Order does not authorize code/data migration, API/runtime changes, CI/automation changes, secret/permission changes, deployment, or broker execution. Those require separate scoped approval.


## Approved repository restructuring — WO-2026-11-24-004

- Central Work Order: https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-24-004-nova-repository-restructuring.md
- After completing the routine pre-work sequence above, read WO-2026-11-24-004 in full before any branch/PR inventory, file move, consolidation, or restructuring action.
- This Work Order authorizes a complete evidence-backed NOVA repository inventory and, after the migration manifest is approved within its exact scope, safe NOVA-internal restructuring of verified NOVA-owned files.
- Inventory must include live main SHA, all discoverable branches (paginate to completion), all open/closed/merged PRs, full changed-path lists, branch/base/head SHAs, repository tree, ownership, imports/callers, tests, workflows and data lineage.
- Classify PRs as KEEP/REQUIRED, CONSOLIDATE/DUPLICATE, SUPERSEDED, ARCHIVE/LEGACY, or BLOCKED/INSUFFICIENT EVIDENCE. Similar titles are not sufficient evidence for consolidation.
- Preserve PR #66 and PR #147 as isolated benchmark/challenger workstreams. Preserve PR #238 and its blocked dataset/provenance. Do not merge/close PRs or delete branches as part of classification.
- Datacenter remains the sole owner of research/learning computation and authoritative research lineage. Do not transfer research code/data/models or modify another repository under WO-004; cross-repository migration requires a separate Work Order.
- Preserve legacy modules until a verified replacement, caller parity, rollback plan and consolidated tests are evidenced.
- Record each operation in `logs/OPERATIONS.md` with UTC timestamp, WO ID, repository, branch, before/after SHA, changed paths, checks/results, evidence, blockers and next action.
- Existing safety rules remain: deployment paused; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`; no broker writes, order execution, transfers or withdrawals.
- NOVA remains main-only under this local instruction. Do not create a feature branch, force-push, or rewrite history unless the repository owner explicitly changes this operating rule.


## Approved MT5 historical collector — WO-2026-11-25-003

- Central Work Order: https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-25-003-nova-mt5-historical-collector.md
- This Work Order explicitly authorizes NOVA-side MT5 historical read-only collection changes directly on `main`, using PR #269 as a reference only. Do not merge PR #269 or #275.
- Scope is limited to bounded, tenant-isolated, GET-only Exness MT5 Demo history retrieval and delivery through the existing NOVA Gateway to the existing Datacenter ingestion contract.
- Do not create another Gateway/MCP endpoint, call Datacenter directly from the browser, or modify the Datacenter repository under this Work Order.
- No broker write, orders, execution, transfer, withdrawal, deployment, production secret/permission changes, paid resources, or live trading.
- Follow the central Work Order phases and stop conditions. Authored tests are not executed tests; no live collection is proven without a real Demo Bridge response and Datacenter quality receipt.


## Approved NOVA Agent Skills System — WO-2026-11-26-001

- Central Work Order: https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-26-001-nova-agent-skills-system.md
- Cursor-discoverable NOVA Skills live under .cursor/skills/<skill-name>/SKILL.md.
- Use nova-skill-orchestrator for NOVA repository tasks; load only the smallest relevant specialist Skill(s).
- Governance preflight always takes precedence: verify current main SHA, local instructions, applicable approved Work Order, Issue #36, operations log, and exact-head PR/check evidence before edits.
- NOVA remains Main-only. Skills do not authorize feature branches, PRs, merges, deployment, CI/automation changes, secrets, permissions, paid services, broker writes, or trading activation.
- New NOVA agents default to OpenAI Agents/API tools. Cursor Agent SDK guidance is conditional on an explicit user request.
- Preserve ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false. Production deployment remains paused; Datacenter remains the sole research/learning owner.
- Cursor Skill discovery/selection is model-mediated. Do not claim automatic invocation from file presence alone; record an observed runtime invocation test before making that claim.
- Initial scope is documentation and agent instructions only. Any runtime, CI, security, permission, deployment, cost, or trading scope requires a separate approved Work Order.

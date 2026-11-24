# NOVA Core — Control Plane Architecture A and Verification Plan

- Decision: **Architecture A — Control Only**
- Status: **PROPOSED / DOCUMENTATION REVIEW**
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Baseline: `main@e7d1f3795de3b2dc655e73f6f148056ddb9ed19f`
- Date: 2026-11-25
- Deployment: **NOT AUTHORIZED**
- Live trading / broker writes: **OFF**
- Scope: architecture and audit plan only; no runtime code, schema, secrets, permissions, broker state, or deployment changes.

## 1. Decision and authority boundary

NOVA Core is the ecosystem **Control Plane**. It owns central identity integration, authorization policy, service registry, API governance, risk-policy governance, approvals coordination, audit projection, operational status, and kill-switch state visibility.

NOVA Core is **not**:
- a strategy-generation or quantitative-research engine;
- the authoritative market-data store;
- an AI model that can authorize its own proposal;
- a broker credential vault or MT5 terminal;
- an order router, execution engine, or position manager;
- a second MCP Gateway or duplicate Command Center.

NOVA Core may validate a typed proposal against a versioned risk policy and return an allow/reject decision for research or paper workflows. Such a decision is not broker authorization and must never be interpreted as permission to submit an order.

Hard invariants on every customer-facing and internal path:
- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- `brokerWrites=false`
- MT5 remains Demo/read-only.
- No model, UI, MCP tool, approval record, or service may override these invariants.

## 2. Target architecture

```text
VOOM AI (product UI / user workflows)
        |
        | versioned authenticated contracts only
        v
NOVA CORE — CONTROL PLANE
  - Session verification / role and tenant authorization
  - API Gateway / allowlisted service routing
  - Service registry / health and freshness aggregation
  - Risk policy registry + deterministic decision interface
  - Durable approval lifecycle coordination
  - Audit projection / correlation / incident visibility
  - Kill-switch state and operational controls
        |
        +--------------------+--------------------+
        |                    |                    |
        v                    v                    v
DataCenter              MT5 / Broker           AI Provider
Research & ML           Connectivity           Gateway
Strategy, backtest,     Read-only data         Research/explanation
training, evaluation    and account snapshot   only; no authority
        |
        | no direct browser access; no direct broker writes
        v
Separate Execution / Position Service
FUTURE ISOLATED BOUNDARY ONLY — DISABLED, NOT OWNED BY NOVA CORE
No connection or activation is authorized by this document.
```

### 2.1 Ownership matrix

| Capability | Authoritative owner | NOVA Core responsibility |
|---|---|---|
| User-facing Trading Product and strategy presentation | VOOM AI | Publish and enforce shared API/security contracts |
| Identity session source | Supabase Auth / identity owner | Verify session server-side; derive subject, role and tenant from trusted claims/registry |
| Central API and service governance | NOVA Core | Own allowlists, contracts, routing policy and observability |
| Strategy, research, backtest, training and model registry | DataCenter | Authorize scoped read/request paths; never duplicate research storage |
| Broker connection and read-only MT5 data | System Hub / MT5 Bridge | Verify owner-bound connection state and expose sanitized status |
| Risk policy governance | NOVA Core | Version, scope, audit and serve deterministic policy decisions; no execution authority |
| Durable approvals | Existing canonical NOVA approval lifecycle | Coordinate read-only status and human-review state; do not create a second approval store |
| Broker order execution and position lifecycle | **Unassigned; separate service required** | No order API, no broker write, no direct execution call |
| Central MCP Gateway | Existing Remote MCP Worker | Keep one gateway; NOVA Core remains authorization/control authority |

### 2.2 Allowed and prohibited interfaces

Allowed in this phase:
- authenticated, tenant-scoped read APIs;
- typed research/backtest job requests to DataCenter, with bounded inputs and owner-scoped result reads;
- read-only broker connection/account/quote snapshots through System Hub;
- read-only approval status and sanitized audit views;
- service health and heartbeat reads with explicit freshness metadata;
- deterministic risk evaluation for paper/research proposals.

Prohibited:
- order submit, amend, cancel, close, transfer, deposit or withdrawal routes;
- generic reverse proxy to arbitrary internal or broker URLs;
- browser-direct access to internal services or Supabase service-role credentials;
- model-generated tenant/account/route identifiers treated as authority;
- approval state interpreted as execution permission;
- automatic retries after unknown broker outcomes;
- any control path that changes the hard-false trading flags.

## 3. Daily trading operating requirements

The product objective is intraday operation with no intentional overnight position carry. This is a requirement, **not evidence that automatic end-of-day liquidation exists**.

The intended control policy must eventually support:
1. Use broker/server trading-day boundaries and broker timestamps, not the browser or device clock.
2. Stop admitting new entries before the configured end-of-day cutoff.
3. Read and reconcile all open positions and pending orders through the authenticated read-only broker path.
4. Alert on any position that remains open near or after the cutoff.
5. Treat an unconfirmed close, disconnected bridge, stale quote, or unknown broker outcome as an incident; never claim the position is closed without broker confirmation.
6. Keep any future close-only automation in a separately owned, independently reviewed Position/Execution Service. NOVA Core may govern policy and observe status but must not send the close order itself.

The owner has previously stated desired risk parameters of a 10% daily loss limit, 9% maximum open risk, and 5 maximum orders. These are **requirements to reconcile**, not active runtime policy. Current repository code contains a paper-only RiskWorker prototype with different defaults (3% daily loss, 7% drawdown, 20% allocation, 1x leverage). Do not silently choose either set or activate numeric limits until a versioned, owner-approved policy is persisted and tested.

## 4. Current-main evidence and gaps

Snapshot is tied to `main@e7d1f3795de3b2dc655e73f6f148056ddb9ed19f`. This is a repository-source review, not a production runtime audit.

| Area | Evidence found | Assessment |
|---|---|---|
| Command Center UI | `apps/nova-command-center/` exists; README describes read-only trading intelligence, LIVE OFF and no broker mutation paths | UI foundation exists; does not prove deployed or fully wired control plane |
| API client | `apps/nova-command-center/src/lib/nova/api.ts` uses GET and `assertReadOnlyRequest`; health route is client-defined | Client-side guard only; server authorization remains authoritative |
| Auth UI integration | `apps/nova-command-center/src/lib/nova/auth.tsx` gets Supabase session and role for UI state | Not proof of server-side JWT validation or tenant isolation |
| Emergency stop | `apps/nova-command-center/src/lib/nova/emergency.ts` explicitly reports backend not connected and sends nothing | No confirmed server-side kill-switch action path |
| Core API | Existing Command Center API data-source plan says no Core API Worker/deployment target exists on main | Core API implementation/runtime remains NOT VERIFIED |
| Risk | `workers/risk/manager_prototype.py` is fail-closed paper validation only; no canonical persisted numeric policy source established | Prototype, not production Risk Service |
| Execution | `workers/execution/ccxt_exec.py` sets live execution disabled and raises on execute | Disabled stub; no production order path |
| Research runtime | `workers/runtime.py` exposes research/backtest endpoints and approval draft flow; approvals are disabled by default | Research/approval-only; not an execution service |
| Approval persistence | Existing repository migration defines public owner-scoped durable approval lifecycle; selected NOVA Supabase project has a schema mismatch per current governance addendum | Migration reconciliation blocker; do not create duplicate tables or apply migrations in this work |
| Audit | Several domain-specific audit sources exist; unified customer-safe audit projection is not established | Blocked pending source, scope, retention and RLS review |
| MT5 heartbeat | `public.system_heartbeats` was observed empty and staff-only in the linked project inspection | No verified tenant-readable heartbeat feed |
| Service health | No authoritative service-probe registry and freshness contract established | Do not display static ONLINE status |
| Trading flags | Read-only and disabled flags are present in multiple code/docs paths | Must be tested across all routes and responses; source presence alone is insufficient |

### 4.1 Critical schema and environment blocker

The current governance evidence records that the owner selected Supabase project `rovhmjeowracayicbqij` for NOVA, but its observed schema contains `nova.approvals` / `nova.audit_events` and lacks the canonical `public.nova_agent_threads` / `public.nova_approval_requests` tables expected by the durable approval client. Another linked project contains the public durable approval tables. Environment identity and migration state must be reconciled against the selected project before any schema work.

This document authorizes **no SQL writes, migrations, RLS changes, grants, data copy, table drop, or project redirection**.

## 5. Verification plan

All checks must be run against an exact commit SHA and use synthetic fixtures unless a separate staging authorization is issued. Record command, environment, SHA, result, logs/artifacts, reviewer and timestamp.

### Gate 0 — Repository and ownership baseline
- [ ] Re-fetch `refs/heads/main` immediately before implementation.
- [ ] Inventory open PRs and compare changed paths, ancestry, tests and migrations; do not duplicate or merge existing PR work.
- [ ] Map every caller, API route, Worker, workflow, deployment target and Supabase migration relevant to Command Center.
- [ ] Confirm one owner per service and one canonical MCP Gateway.
- [ ] Record exact source files and SHA for every conclusion.

Exit: ownership map and PR overlap map reviewed; no unresolved source-of-truth ambiguity hidden.

### Gate 1 — Contract and authorization
- [ ] Freeze versioned schemas for identity, tenant, role, service status, freshness, risk policy, approval status, audit event and error envelope.
- [ ] Server verifies Supabase JWT signature, issuer, audience, expiry and revocation/session semantics.
- [ ] Derive subject, role and tenant from trusted server-side claims/registry; reject client-supplied authority fields.
- [ ] Enforce deny-by-default role matrix and tenant ownership on every downstream call.
- [ ] Test two users / two tenants, cross-tenant reads, role escalation, expired/revoked tokens and malformed claims.
- [ ] Ensure no-store/private cache behavior and bounded pagination/timeouts/rate limits.

Exit: all negative authorization and tenant-isolation tests pass on exact SHA.

### Gate 2 — Service registry and heartbeat
- [ ] Define allowlisted service IDs, owners, environment, probe route, timeout, freshness threshold and degraded/unavailable semantics.
- [ ] Define a real MT5 Bridge heartbeat producer and tenant-to-connection binding.
- [ ] Project only customer-safe heartbeat status; do not expose staff-only tables or secrets.
- [ ] Test missing, stale, future-dated, replayed, cross-tenant and disconnected heartbeat cases.
- [ ] Ensure upstream timeout or malformed payload returns unknown/degraded/unavailable, never fabricated healthy state.

Exit: service status and Bridge status have source timestamps and fail-closed freshness semantics.

### Gate 3 — Risk policy governance (no execution)
- [ ] Select one canonical, versioned risk-policy persistence source and define owner/tenant scope.
- [ ] Reconcile the stated 10% daily loss / 9% open risk / 5 orders requirements with the current prototype defaults before setting policy values.
- [ ] Define broker-day equity baseline, realized + unrealized P/L treatment, commissions, swap, currency conversion, open-risk aggregation and reset semantics.
- [ ] Define entry-lock behavior separately from protective position management.
- [ ] Test exact boundary, just-below/above, negative, NaN/Infinity, stale account state, missing equity, currency mismatch, concurrent requests and policy-version drift.
- [ ] Verify risk rejection happens before optional approval-service availability checks.
- [ ] Verify a risk pass never produces an execution token or broker write.

Exit: deterministic policy decisions are reproducible, versioned, audited and incapable of authorizing execution.

### Gate 4 — Approval and audit
- [ ] Reconcile the selected Supabase project's actual migration ledger, schema, grants, RLS and dependencies read-only first.
- [ ] Reuse the canonical durable approval lifecycle; do not create a second approval schema.
- [ ] Confirm approval actor, owner, thread, immutable proposal, expiry, idempotency and state-transition audit.
- [ ] Define canonical audit source(s), customer-safe projection, append-only semantics, retention and access policy.
- [ ] Test denied cross-owner access, duplicate/replayed decisions, expired approvals, edited proposals and missing audit persistence.
- [ ] Confirm approval status can never set `executionEnabled` or `liveTradingEnabled` true.

Exit: approval and audit views are owner-scoped and traceable; no schema mutation occurs in this phase.

### Gate 5 — Daily close policy and position visibility
- [ ] Define broker-day timezone and end-of-day cutoff with a safety buffer.
- [ ] Implement read-only open-position/pending-order reconciliation and a no-new-entry cutoff signal.
- [ ] Define alert/escalation for any open position at cutoff and any unknown close outcome.
- [ ] Specify a separate Position/Execution Service contract for any future close-only automation; keep it disconnected and disabled now.
- [ ] Test daylight-saving/timezone changes, market holidays, broker session changes, Bridge loss, stale quotes and broker state disagreement.

Exit: monitoring and entry-lock behavior are evidenced; no automatic broker close is claimed or enabled.

### Gate 6 — End-to-end read-only verification
- [ ] Authenticated Command Center → NOVA Core → System Hub / DataCenter calls use only approved versioned contracts.
- [ ] Verify source, timestamp, freshness, environment and owner binding for every displayed value.
- [ ] Verify every response retains all four hard-false flags.
- [ ] Verify no route, tool, queue, model or frontend control can call order/position mutation endpoints.
- [ ] Verify correlation IDs connect UI request, gateway, downstream service and audit record.
- [ ] Run unit, contract, integration, security, build and exact-head CI checks.
- [ ] Produce a signed-off evidence bundle and independent review.

Exit: read-only E2E acceptance complete on exact SHA. This still does not authorize deployment.

## 6. Release and change controls

This work order is documentation and audit planning only. Any later code implementation requires a separate, narrowly scoped implementation approval and a fresh main-SHA check. Any schema migration, secret/permission change, staging activation, deployment, broker write, Demo execution, or Live activation requires its own explicit approval.

No merge or deployment is implied by passing any verification gate. Live activation remains a separate decision and is outside Architecture A.

## 7. Status and next actions

| Work item | Status | Next action |
|---|---|---|
| Architecture A decision | ACCEPTED BY OWNER | Preserve this boundary in Shared Contracts and repo docs |
| Main source audit | IN PROGRESS | Complete caller / route / workflow inventory |
| Core API runtime | BLOCKED / NOT VERIFIED | Reconcile existing #373/#377 work and implement only after approval |
| Auth and tenant isolation | VERIFY | Server-side negative tests required |
| Risk policy source | BLOCKED | Reconcile numeric policy and canonical persistence |
| Approval schema | BLOCKED | Non-destructive selected-project reconciliation plan |
| Audit projection | BLOCKED | Select canonical sources and retention/access model |
| Bridge heartbeat | BLOCKED | Producer and tenant-safe projection required |
| Execution / Position Manager | UNASSIGNED / OUT OF SCOPE | Define separate owner and service contract; keep disabled |
| Daily no-overnight control | REQUIREMENT / NOT IMPLEMENTED | Read-only position monitor and entry cutoff first |
| Deployment / Live Trading | NOT AUTHORIZED | No action |

## 8. Evidence references

- `docs/architecture/VOOM-ECOSYSTEM-TARGET-ARCHITECTURE.md`
- `docs/architecture/COMMAND-CENTER-REPOSITORY-STRUCTURE.md`
- `docs/governance/WO-004-COMMAND-CENTER-API-DATA-SOURCE-PLAN.md`
- `docs/governance/WO-004-MIGRATION-MANIFEST.md`
- `docs/NOVA-LIVE-TRADING-PRODUCT-TRANSITION.md`
- `apps/nova-command-center/README.md`
- `apps/nova-command-center/src/lib/nova/api.ts`
- `apps/nova-command-center/src/lib/nova/auth.tsx`
- `apps/nova-command-center/src/lib/nova/emergency.ts`
- `workers/risk/manager_prototype.py`
- `workers/execution/ccxt_exec.py`
- `workers/runtime.py`

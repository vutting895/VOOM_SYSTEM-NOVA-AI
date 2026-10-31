# NOVA HR & AI Workforce — Architecture and Delivery Plan

**Status:** Architecture proposal; implementation not started  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Base chain:** `main` → Draft PR #143 (Adaptive NOVA Main Dashboard) → this proposal  
**Main baseline SHA:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Dashboard design parent head:** `043b69a5efa5960de35279ea0148d4c2aab63ba1`  
**Primary frontend:** `frontend/` (Next.js; Netlify)  
**Backend:** Cloudflare Workers / NOVA System Integration Hub  
**Identity and data:** Supabase Auth + RLS  
**Master delivery tracker:** Issue #36

## 1. Owner-approved product decisions

| Decision | Selected value |
|---|---|
| Workforce scope | All departments: human employees and AI Agents |
| Agent creation | Automatically provision instances only from approved templates |
| Delivery priority | NOVA Main Dashboard first |
| Operating model | Hybrid: bounded autonomous work with human approval for consequential actions |

These decisions are the acceptance baseline for this proposal. They do not authorize production deployment, HR data collection, hosted database changes, or autonomous employment decisions.

## 2. Product goal

Build one NOVA Workforce capability inside the existing NOVA application. It manages people, organizational structure, approved Agent roles, work queues, capacity, performance evidence, training and approvals.

The Main Dashboard remains the primary entry point. HR and Agent Workforce are permission-aware module workspaces and dashboard widgets, not a second dashboard application. The existing owner-scoped `/command-center` remains a separate customer personal workspace.

## 3. Repository-first baseline and reuse

Inspected on `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`:

- `frontend/app/page.jsx`: existing NOVA root dashboard; bespoke navigation and illustrative market panels.
- `frontend/app/layout.jsx` and `frontend/components/nova-navigation.jsx`: global navigation is also rendered by the root layout, creating competing navigation ownership. Resolve through parent PR #143 rather than adding another shell.
- `frontend/app/command-center/page.jsx`: existing authenticated, owner-scoped personal workspace. Preserve its session and data boundaries.
- `frontend/components/widgets/README.md`: widgets must remain presentational and use typed server-side adapters; retain this rule.
- `frontend/lib/agent-approval-contract.mjs` and `frontend/lib/agent-approval-server.js`: existing approval primitives are scoped to current NOVA review/strategy workflows; do not assume they are a complete HR approval or workforce persistence layer.
- `supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql`: current durable approval schema is owner-scoped and strategy-draft-specific. Reuse concepts and security tests, not its tables as a generic HR schema.
- `.github/workflows/frontend-ci.yml`: CI already runs frontend builds and security/tenant/approval contract tests. Extend with targeted Workforce tests when implementation begins.
- `frontend/README.md`: Netlify is the primary frontend; Cloudflare Workers are backend/API. Preserve this boundary.

Related work to coordinate, not duplicate:
- PR #143: adaptive main dashboard and module/widget registry direction.
- PR #109: Production/Staging migration baseline reconciliation. HR schema work is gated on its verified outcome.
- PR #67 and current approval lifecycle: security regression dependency; do not weaken or bypass it.
- PR #116 and provider gateway work: use the existing server-side provider boundary if AI inference is needed; do not introduce browser-held provider keys or a second gateway.
- Issue #36: sole master delivery tracker.

## 4. Target organization and responsibility model

```text
NOVA Executive / Human Owner
  └── AI Chief of Staff (coordination, not unrestricted authority)
      ├── HR & Workforce Director
      │   ├── People Operations Agent
      │   ├── Recruitment Support Agent
      │   ├── Onboarding Agent
      │   ├── Skills & Training Agent
      │   ├── Workforce Planning Agent
      │   └── HR Compliance Support Agent
      ├── Department Directors
      │   ├── Development / QA
      │   ├── Research / Data
      │   ├── Marketing / Content
      │   ├── Operations / Support
      │   └── Finance / Administration
      └── Human managers and authorized reviewers
```

Every role must have a named human owner or accountable department, a defined scope, measurable outcomes, an escalation route and an explicit permission policy. An AI Director coordinates work; it does not become the legal employer, line manager of record, or final decision-maker for employment matters.

## 5. Main Dashboard-first information architecture

The existing root route `/` remains the single NOVA Main Dashboard. Add a Workforce overview through the trusted module/widget registry defined by parent PR #143.

Proposed dashboard widgets:
1. **Workforce Overview** — verified human/Agent counts, active/paused status, data freshness and access scope.
2. **Work Queue & SLA** — queued, assigned, blocked, overdue and review-pending work.
3. **Capacity & Forecast** — demand by department, available capacity, concurrency and forecast confidence.
4. **Agent Operations** — approved templates, running instances, health, cost and last evaluation.
5. **Human Review Inbox** — approvals and escalations requiring an authorized person.
6. **Quality & Performance** — completed work, QA pass rate, rework and SLA attainment with denominator and time window.
7. **People Operations** — restricted HR notices and tasks; sensitive employee details never appear on general dashboard widgets.
8. **Audit & Policy Health** — policy version, permission denials, failed runs and review trail.

Every widget must implement loading, empty, stale, unavailable, error, permission-denied and verified states. Never display invented counts, fabricated productivity, or missing data as zero.

## 6. HR and Workforce modules

| Module | Initial responsibility | Access boundary |
|---|---|---|
| Organization & Roles | Departments, reporting lines, job/Agent role catalog | HR/admin scoped |
| Employee Directory | Minimal employee profile and employment status | HR and authorized manager |
| Agent Registry | Template, instance, owner, version, lifecycle and health | Workforce operators |
| Agent Factory | Provision an instance from an approved template | Policy-gated service |
| Work Orchestrator | Queue, assignment, retry, escalation and SLA | Task/department scoped |
| Skills & Training | Skill catalog, learning plans and evaluation evidence | Subject/manager scoped |
| Performance & QA | Work evidence, quality and operational metrics | Role-scoped; human review |
| Approvals & Governance | Human decisions, policy versions and audit events | Explicit approver scope |
| Workforce Analytics | Capacity, cost, utilization and demand forecast | Aggregated by default |

Recruitment and onboarding are support workflows. Automated screening may summarize job-related evidence for human review but must not autonomously reject applicants or make employment decisions.

## 7. Approved-template Agent Factory

### 7.1 Separate immutable role template from runtime instance

- **Template:** reviewed role definition, allowed tools, input/output schemas, model policy, limits, evaluation suite and approval record.
- **Instance:** one provisioned runtime identity bound to a tenant, department, owner, template version and permission scope.
- **Task run:** a bounded execution with task ID, idempotency key, input reference, status, attempt count, cost, output reference and QA result.

### 7.2 Provisioning lifecycle

`DRAFT → VALIDATING → REVIEW_PENDING → APPROVED → PROVISIONED → ACTIVE → PAUSED / RETIRED`

Only an approved, non-revoked template version can be provisioned. Template changes create a new version and require review; a running instance must not silently inherit changed permissions.

### 7.3 Capacity control

Scale using bounded concurrency rather than unlimited agent creation:
- Observe queue depth, oldest task age, task arrival rate, service time, SLA risk and provider/runtime budget.
- Estimate required concurrency from measured workload and service-time history.
- Enforce per-tenant, per-department, per-template and global concurrency ceilings.
- Apply cooldown, hysteresis, rate limits, retry budgets and dead-letter handling.
- Pause new provisioning when budget, error rate, security posture or provider capacity crosses a configured limit.
- Scale down by draining work and pausing instances; never terminate an in-flight task without a recoverable state.

Auto-scaling creates instances only from approved templates. It cannot create new roles, grant new tools, raise budgets or change policies.

## 8. Hybrid authority and approval policy

| Level | Allowed behavior | Examples |
|---|---|---|
| L1 — bounded auto | Read, classify, summarize, draft, assign within approved scope | Internal summaries, task routing, reminders |
| L2 — human approval | Prepare a proposal and wait for a named authorized approver | External communication, access changes, payroll preparation |
| L3 — human decision | AI may provide evidence/checklists only | Hiring/rejection, compensation, promotion, discipline, termination, legal filings and payment release |

No model output is itself an authorization. Approvals must bind to the exact action payload hash, actor, subject, tenant, policy version and expiry. Reject replay, stale approvals, cross-tenant IDs and altered payloads. Record who approved, what was approved, when, and the resulting action receipt.

## 9. Data model proposal — not an active migration

Candidate entities for a later reviewed migration:
- `workforce_departments`
- `workforce_positions`
- `workforce_employees`
- `workforce_agent_templates`
- `workforce_agent_template_versions`
- `workforce_agent_instances`
- `workforce_tasks`
- `workforce_task_assignments`
- `workforce_task_runs`
- `workforce_approvals`
- `workforce_skill_catalog`
- `workforce_skill_evidence`
- `workforce_audit_events`

Every tenant-owned row must carry server-derived tenant/organization scope and appropriate owner/department references. Define RLS, grants, foreign keys, indexes, retention and deletion behavior before implementation. Do not trust tenant IDs, department IDs, role claims or approver identity supplied by the browser or an LLM.

Do not add these tables to hosted Production or Staging in this architecture phase. First reconcile the exact applied migration history, schema fingerprints and backup/restore gates tracked by PR #109. Keep sensitive employee data out of model prompts unless the exact field is necessary, authorized and minimized.

## 10. Security, privacy and compliance

- Use Supabase Auth for human identity and trusted server-side authorization for every mutation.
- Use RLS plus API-level owner/tenant/department checks; test two-tenant and two-user negative cases.
- Give each Agent a dedicated identity and least-privilege capability list. No shared service-role credential in browser code or agent prompts.
- Route provider calls through the existing NOVA AI Provider Gateway; redact secrets and minimize employee data.
- Maintain append-oriented audit evidence for provisioning, task assignment, tool invocation, approvals, policy changes and deactivation.
- Define retention, correction, access request, export and deletion workflows for employee records.
- Conduct Thai PDPA and labour-law review before handling actual employee records or enabling HR decision workflows.
- Do not infer protected or sensitive attributes, use emotion/personality inference, or autonomously rank/reject employees or applicants.
- Apply human review and documented criteria to any decision affecting hiring, pay, performance rating, discipline or employment status.

## 11. Runtime and integration boundaries

- Frontend: existing Next.js application and shared dashboard shell.
- API/control plane: existing Cloudflare System Integration Hub and approved backend services; do not create a second identity gateway.
- Durable asynchronous execution: select or extend a queue/runtime only after reviewing current Cloudflare bindings and retry semantics. Do not assume an existing durable queue is provisioned.
- Database: Supabase, subject to migration parity and RLS acceptance.
- AI: existing server-side provider gateway with provenance, bounded output and no client-supplied provider selection.
- Observability: per-task trace ID, template version, provider/model provenance, latency, token/runtime cost, retry count and sanitized failure reason.

## 12. Delivery phases and pull-request sequence

| Phase | PR scope | Exit evidence |
|---|---|---|
| P0 | This architecture proposal + parent dashboard alignment | Repository baseline, boundaries, owner decisions and reviewed plan |
| P1 | Dashboard Workforce widgets and trusted module metadata | Exact-head CI, responsive/accessibility checks, verified empty/loading/error states |
| P2 | HR Core read model and role-scoped API contracts | Migration parity, RLS/grant review, two-tenant isolation tests |
| P3 | Agent Registry and immutable approved templates | Schema/contract tests, version pinning, revoke/rollback tests |
| P4 | Task queue and Workforce Orchestrator | Idempotency, retry, timeout, dead-letter and tenant isolation tests |
| P5 | Agent Factory and bounded autoscaling | Budget/concurrency ceilings, cooldown, load and failure-injection tests |
| P6 | Performance, training, analytics and compliance | Evidence-backed metrics, privacy review and human decision controls |
| P7 | Staging acceptance and release review | Exact commit/deploy evidence, owner/foreign-user tests, rollback and audit evidence |

Each implementation PR must be independently reviewable and target the correct parent branch. Do not merge stacked PRs out of order. Keep implementation separate from this documentation PR.

## 13. Acceptance criteria

The Workforce capability is not complete until:
- Main Dashboard remains the only global dashboard and uses one shared navigation/module registry.
- Human and Agent counts are source-backed, permission-aware and freshness-labelled.
- Every Agent instance is traceable to an approved immutable template version and accountable owner.
- The Factory cannot provision unapproved templates or exceed policy ceilings.
- Every task has one accountable owner, idempotent execution semantics, lifecycle state and auditable outcome.
- Tenant/department isolation passes positive and negative tests with separate identities.
- Human approvals are payload-bound, expiring, replay-resistant and role-authorized.
- Sensitive HR data is not leaked to general dashboards, prompts, logs or other tenants.
- Autoscaling respects budgets, concurrency limits and safe draining.
- Exact-head CI, preview and required staging evidence pass before any release.
- No employment decision is delegated solely to AI.

## 14. Explicit non-goals and safety invariants

This proposal does not:
- Add or apply database migrations.
- Create employee records or collect personal data.
- Provision or activate AI Agent instances.
- Enable automatic hiring, rejection, payroll payment, compensation changes or termination.
- Change hosting, DNS, provider settings, secrets or deployment configuration.
- Enable arbitrary generated code, unrestricted tools or model-driven permission changes.
- Change broker configuration or trading controls.

Existing NOVA invariant remains: Exness Demo only; read-only + AI analysis; order submission OFF; Live Trading OFF.

## 15. Immediate next actions

1. Review and merge parent PR #143 only after its own dashboard architecture review.
2. Capture current Dashboard behavior at desktop/tablet/mobile and resolve the single navigation owner in a separate implementation PR.
3. Review this Workforce architecture with the owner and security reviewer.
4. Close the PR #109 migration-baseline gate before any Workforce schema PR.
5. Start P1 as a focused dashboard-only implementation, using verified states and mock-free empty states; do not add employee or Agent data until a trusted API exists.
6. Create the HR Core schema/API PR only after P0/P1 review and migration parity evidence.

**Current status:** design only. No application code, migration, provider setting, secret, employee record, Agent runtime, or production deployment is changed by this document.

# NOVA Agent & Provider Learning with Auto-GenSkill

- Date: 2026-10-31
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base branch: `main`
- Base SHA: `a2acfd8ec9b598e6593413549bef760e8f596a72`
- Parent roadmap: Issue #96 — Deep Research Core / Quantitative Intelligence
- Related learning foundation: PR #117 — Learning Universe 16 / Governed Auto-Learning Loop
- Scope: architecture and implementation contract; no runtime activation
- Safety: Exness Demo read-only; order submission, execution and Live Trading OFF

## 1. Decision

Extend the existing NOVA Learning Universe and Auto-Learning lifecycle with two capabilities:

1. **Agent & Provider Learning** — capture and evaluate bounded, privacy-filtered outcomes from internal agents and external AI providers.
2. **Auto-GenSkill** — derive declarative, versioned skill specifications from repeated and validated workflows, test them in isolation, and publish only after human approval.

This is not an autonomous self-modifying agent. Provider responses, agent transcripts and generated skill proposals are untrusted inputs. They cannot grant permissions, change system policy, deploy code, or approve themselves.

## 2. Reuse existing architecture; do not create parallel systems

| Existing component | Reuse responsibility | Extension boundary |
|---|---|---|
| NOVA AI request surface / future Provider Gateway | Existing authenticated API-to-Worker request boundary; PR #86 contains a Gemini adapter candidate but is 105 commits behind current main and must not be merged as-is | After a current-main provider adapter is reviewed, emit sanitized learning observations with actual provider/model/fallback provenance |
| Agent Orchestration contract candidate (PR #106) | Bounded run/step/tool contracts are proposed on an open Draft branch, not yet part of main | Rebase/review and accept the contracts before wiring event emission; do not treat the PR as a deployed runtime |
| System Integration Hub | Authentication, owner/tenant authorization, idempotency and audit | Authorize all ingestion, reads, publication and Skill invocation |
| Deep Research Core (#96) | Source snapshots, claims, hypotheses and research tasks | Supply evidence references; do not create a second evidence ledger |
| Learning Universe / Auto-Learning (Draft PR #117) | Branch-only catalog and fail-closed lifecycle primitive; not yet merged and has no persistence/scheduler/trainer | Add agent/provider/skill candidate types only after #117 is reviewed and its accepted contracts are available on the integration base |
| Quant Engine | Deterministic experiment execution and evaluation | Evaluate skill behavior where numerical or time-series evidence is required |
| NOVA AI Chat | User-facing intent and agent entry point | Invoke only published skills through typed server-owned routes |

PR #117 is currently a Draft branch-only change at the time of this design. Its lifecycle is not assumed to exist on main until reviewed and merged. This proposal is additive and must be reconciled against its exact accepted contracts before implementation.

## 3. Agent & Provider Learning data flow

```text
Internal Agent Runs ─────┐
                        ├─> Sanitization / Data Minimization
External Provider Calls ┘              |
                                       v
                              Observation Normalizer
                                       |
                                       v
                             Evidence & Provenance Check
                                       |
                         ┌─────────────┴──────────────┐
                         v                            v
                  Knowledge Candidate          Skill Candidate
                         |                            |
                  Deep Research / RAG          Auto-GenSkill
                         |                            |
                         └─────────────┬──────────────┘
                                       v
                           Learning Lifecycle (#117)
                                       |
                               Evaluation + Review
                                       |
                              Human Approval Required
                                       |
                         Published Knowledge / Skill
                                       |
                          NOVA AI / Agent Allowlist
```

### 3.1 Observation envelope

Use a strict, versioned `nova.learning-observation.v1` envelope. Proposed fields:

- `observation_id`: stable opaque identifier.
- `source_type`: `internal_agent` or `external_provider`.
- `source_id`: registered agent/provider identifier, never a user-supplied route.
- `provider_model`: provider and model identifier when applicable.
- `provider_version`: known model/API version or explicit `unknown`.
- `occurred_at`: timezone-aware timestamp.
- `task_class`: allow-listed task category.
- `outcome`: `success`, `partial`, `failed`, `abstained`, or `rejected`.
- `quality_signals`: bounded numeric/enum evaluation results.
- `evidence_refs`: references and hashes to approved evidence, not raw credentials or full private transcripts.
- `policy_version`: applicable data-handling and tool policy version.
- `tenant_scope_ref`: server-derived reference used by the Hub; never accepted as authority from model output.

Reject unknown fields, unbounded strings/arrays, arbitrary URLs, raw provider payloads, secrets, access tokens, broker/account/order/position data and transcript dumps. If customer-specific context is needed, store only a minimized reference under existing owner/tenant controls.

### 3.2 Provider normalization

The existing Provider Gateway remains the only provider-routing boundary. For each call, record the actual provider/model used, whether fallback occurred, normalized status, latency bucket and response/evaluation reference. Do not infer a provider from the configured preference when a fallback actually served the response.

Provider output is advisory evidence, not ground truth. Where practical, compare independent provider responses against deterministic checks and trusted source evidence. Conflicts should be retained as conflicts rather than averaged into false certainty.

Do not store raw chain-of-thought or hidden reasoning. Store concise user-visible summaries, structured outputs, test results and evidence references only.

## 4. Auto-GenSkill lifecycle

A Skill is a declarative capability package, not arbitrary code emitted by an LLM.

```text
DISCOVERED
  -> SPEC_DRAFT
  -> STATIC_VALIDATED
  -> SANDBOX_TESTED
  -> EVALUATED
  -> REVIEW_PENDING
  -> APPROVED
  -> PUBLISHED
  -> DEPRECATED | REVOKED
```

Only a human reviewer can approve publication. Failed validation or evaluation returns the candidate to a non-published state with a recorded reason. Published versions are immutable; changes create a new version.

### 4.1 Skill specification

Proposed `nova.skill.v1` fields:

- `skill_id`, `version`, `display_name`, `description`.
- `task_intents`: finite allow-listed intent identifiers.
- `input_schema`, `output_schema`: strict typed JSON schemas with size and depth limits.
- `tool_refs`: references to server-owned tool definitions, never arbitrary URLs or executable code.
- `required_capabilities`: requested capabilities checked against server-side policy.
- `data_scopes`: explicit allowed data classes and tenant scope.
- `preconditions`, `postconditions`, `failure_modes`, `timeout_ms`, `resource_budget`.
- `evidence_refs`, `evaluation_report_ref`, `policy_version`.
- `content_hash`, `created_at`, `review_status`, `review_record_ref`.

Reject code strings, shell commands, dynamic imports, arbitrary network destinations, secret references, permission escalation, policy overrides, self-approval and unknown tool identifiers. The first version should compose existing server-owned tools and fixed workflow templates only.

### 4.2 Candidate generation rules

A generator may propose a skill only when:
- the task pattern is observed repeatedly across eligible runs;
- evidence is sufficient and attributable to known source versions;
- the proposed workflow has a measurable expected improvement over an existing baseline;
- the proposed tools already exist in the server-owned allowlist;
- the input/output and failure behavior can be expressed with a strict schema;
- the skill does not require broader data access or privileges than the initiating user already has.

A single provider answer or one successful run is not enough to publish a skill. The discovery threshold is a configurable, reviewed policy parameter, not a value generated by the model.

## 5. Sandbox and evaluation

Sandbox execution must be isolated from production credentials and customer data. Start with synthetic fixtures and deterministic mocks. No shared filesystem, unrestricted egress, shell, dynamic code execution, broker bridge, database admin role or provider secret is available to generated skills.

Required test families:

1. **Schema:** unknown fields, oversized/deep JSON, invalid types, malformed identifiers and output contract violations.
2. **Authorization:** unauthenticated, wrong owner, foreign tenant, expired approval and unsupported tool.
3. **Injection:** prompt injection in provider responses, retrieved documents, tool output and user-supplied text.
4. **Secret hygiene:** secret-shaped input, log redaction, error redaction and artifact scanning.
5. **Reliability:** timeout, retry/idempotency, partial provider outage, duplicate event and malformed tool result.
6. **Regression:** fixed golden tasks, baseline comparison, deterministic replay and skill-version compatibility.
7. **Resource limits:** maximum steps, tool calls, token/input sizes, runtime, concurrency and cost budget.

A skill must fail closed on missing policy, missing authorization, stale evidence, unknown tool, malformed output or sandbox failure.

### 5.1 Evaluation record

Every evaluation must identify the immutable Skill content hash, test-suite version, fixture/data version, code revision, provider/model versions if used, baseline result, candidate result, failures, latency/cost bounds and reproducibility receipt. Preserve failed candidates and negative results.

Promotion requires measurable acceptance thresholds defined before the run. Do not tune thresholds after inspecting the final holdout.

## 6. Publication and invocation

- Registry reads and writes are owner/tenant scoped through the existing Hub.
- Publication requires a trusted human reviewer identity, rationale, exact content hash and policy version.
- Registry entries are immutable by version; a new edit creates a new candidate.
- Invocation resolves a published Skill ID/version through a server-owned registry.
- The Hub re-checks current user authorization, tenant scope and tool capability on every invocation.
- A Skill cannot call another unpublished Skill or modify its own registry state.
- Deprecation prevents new invocation; revocation blocks invocation immediately and retains audit evidence.
- Rollback selects a previously approved immutable version; it never rewrites history.
- The UI may display generated Skill proposals and review status, but cannot execute model-supplied HTML/JavaScript or code.

## 7. Storage and runtime placement

Do not add a new database or queue before reconciling the current Supabase migration baseline and the accepted Learning Universe / Deep Research contracts.

Recommended logical records (implementation names to be finalized after schema inventory):

- `learning_observations`
- `skill_candidates`
- `skill_versions`
- `skill_evaluations`
- `skill_review_events`
- `skill_invocation_events`

All persistent records require owner/tenant isolation, restrictive grants, retention policy and audit. Do not place raw prompts, provider payloads, credentials or sensitive broker data in the learning store.

Cloudflare Workers should remain request/control-plane services: authentication, validation, routing, bounded orchestration and registry access. Training, heavy evaluation and sandbox compute belong in an isolated external job/runtime selected through a separate reviewed decision. Do not run model training or arbitrary generated code inside request-bound Workers.

## 8. Delivery phases

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 | Reconcile PR #117, Provider Gateway, Agent Orchestration and Hub contracts | Exact source paths and owners confirmed; no duplicate schema |
| 1 | Observation envelope + provider/agent event adapters | Contract tests, redaction tests and tenant identity tests |
| 2 | Declarative Skill schema + static validator | Unknown fields, executable payloads and privilege escalation rejected |
| 3 | Isolated sandbox harness + synthetic fixtures | Isolation, resource-limit, timeout and prompt-injection tests pass |
| 4 | Evaluation pipeline + immutable report | Baseline, reproducibility, regression and failure retention pass |
| 5 | Skill registry + human approval lifecycle | RLS/authorization and two-tenant allow/deny tests pass |
| 6 | Chat/Agent integration | Only approved Skill versions callable; per-call authorization enforced |
| 7 | Controlled staging observation | Exact SHA, runtime evidence, rollback and operator review recorded |

Each phase is a separate PR or a narrowly scoped implementation milestone. No phase automatically authorizes production activation.

## 9. Security invariants

- NOVA Hub is the authority for identity, owner/tenant scope and authorization.
- Provider outputs, Agent outputs, retrieved documents and generated Skill specs are untrusted.
- No LLM can grant itself tools, access, reviewer identity or approval.
- No generated Skill can access secrets or invoke arbitrary network destinations.
- No cross-tenant memory, retrieval, observation or Skill invocation.
- No automatic prompt/system-policy rewrite, code deployment or provider credential mutation.
- Exness Demo remains read-only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- No broker order submission, position mutation or Live Trading.

## 10. Definition of done

This architecture milestone is complete only when the accepted contracts and paths are reviewed and linked to the parent roadmap. Runtime readiness is a separate milestone and requires implementation, automated positive/negative tests, tenant isolation, sandbox evidence, human approval, rollback verification and exact runtime evidence.

A design document, passing unit tests or green CI alone does not prove a Skill is published, a provider is configured, a scheduler is active or an autonomous learning loop is running.

## 11. Related repository work

- Issue #96 — Deep Research Core / Quantitative Intelligence.
- PR #117 — Learning Universe 16 / Governed Auto-Learning Loop (Draft at design time).
- Existing NOVA AI Worker Provider Gateway and Gemini-primary / Cloudflare fallback.
- Existing Agent Orchestration contracts and System Integration Hub.
- Existing approval lifecycle and server-owned tool allowlists.


## 12. Source baseline reconciliation — 2026-10-31

The following distinctions are mandatory when implementing this design:

- Current `main` is `a2acfd8ec9b598e6593413549bef760e8f596a72`. Its `frontend/app/api/chat/route.js` and `frontend/app/api/gen-ai/generate/route.js` provide authenticated request boundaries, but this is not evidence of a full multi-provider learning gateway.
- PR #86 proposes a Gemini Provider Adapter and Cloudflare Workers AI fallback. It is open and targets an older base (`ca25d39ee1f58e4d53bc173be268cffc962fcdc4)); comparing its head with current main shows 31 commits ahead and 105 behind, with a divergent history. **Do not merge or stack new work on #86 as-is.** Rebuild/port its useful changes onto current main in a fresh branch, then re-run exact-head tests and review before describing Gemini as active.
- PR #106 proposes bounded Agent Orchestration contracts but remains an open Draft and is not on main. Its contracts are a future integration dependency, not a deployed workflow runtime.
- PR #117 proposes Learning Universe 16 and the learning lifecycle but remains an open Draft and is not on main. Its code does not include persistence, scheduler, trainer, source ingestion or runtime activation.
- Legacy prototypes such as `integrations/nova-ai-mcp-full-clean/workers/feature/agentic_selfplay.py`, `learning_control.py`, and `continual_learning.py` contain random/mock/simulated behavior. They are not accepted training evidence, provider observations, production Agent Learning, or a source for automatic promotion.
- Therefore Issue #122 is staged: first reconcile and review #117; review #116 as the provider source of truth and #106 as the agent contract candidate; then add strict observation/skill contracts and isolated evaluation. No learning event collector, provider adapter or agent runtime is assumed active until exact source, CI and runtime evidence establish it.


## 13. NOVA AI Team Leads — governed multi-team operating model

### 13.1 Decision

Adopt a **Team Lead + Specialist Agents** model under one NOVA Hub-controlled orchestration plane. Each Team Lead owns a bounded domain, decomposes assigned work, delegates to registered specialist agents, consolidates evidence and returns a recommendation to the Coordinator. Team Leads are not privileged administrators and are not independent security principals.

Initial team map:

| Team Lead | Mission | Specialist roles coordinated | Required outputs |
|---|---|---|---|
| Research Lead | Discover facts, compare options and maintain evidence quality | Web researcher, literature analyst, domain analyst, source verifier | Research brief, source/evidence refs, uncertainty and conflicts |
| Engineering Lead | Design and implement approved repository changes | Frontend, backend/Workers, API, database, integration engineers | Technical plan, scoped branch/PR, change summary and test evidence |
| Review Lead | Independently review design and code quality | Architecture reviewer, code reviewer, maintainability reviewer | Findings by severity, exact file/line refs, merge recommendation |
| QA & Test Lead | Define and execute reproducible verification | Unit, contract, integration, regression and browser-test agents | Test matrix, exact commit/run refs, pass/fail/blocked results |
| Knowledge & Learning Lead | Curate approved knowledge and learning candidates | Knowledge curator, observation analyst, skill-spec author | Provenance-bound knowledge/skill candidates; never self-published |
| Optimization Lead | Improve reliability, latency, cost and measurable outcomes | Performance analyst, workflow optimizer, experiment analyst | Baseline comparison, bounded experiment, rollback recommendation |
| Security Lead | Enforce threat model, identity, tenant isolation and secret hygiene | Threat modeller, policy auditor, dependency/security scanner | Threat findings, allow/deny evidence, release security decision |
| Delivery Coordinator Lead | Maintain the single work queue, dependency graph and cross-team handoffs | Planner, status reporter, dependency tracker | One prioritized plan, owners, blockers, evidence ledger and next action |

A future Finance/Trading or Customer Operations team may be introduced only after its domain boundary, data classification and authorization contract are approved. It is not part of the initial privileged tool surface.

### 13.2 Reporting and authority

~~~text
User / Human Owner
       |
NOVA Hub Policy + Identity + Tenant Authorization
       |
Delivery Coordinator Lead
       |
  +----+---------+----------+---------+---------+
  |              |          |         |         |
Research      Engineering  Review    QA      Security
  |              |          |         |         |
Specialists    Specialists Specialists Specialists Specialists
       \          |          |         |        //
        +------ Evidence / Task Events ---------+
                         |
             Knowledge & Learning / Optimizer
                         |
             Coordinator recommendation
                         |
              Human approval when required
~~~

- The human owner defines goals and retains final authority over repository merges, production release, security exceptions, billing, credentials and any broker-write capability.
- NOVA Hub authenticates the initiating user and authorizes every task, resource, tool and data access. The Coordinator cannot bypass Hub policy.
- A Team Lead may assign work only to registered agents and only within the task's inherited authorization envelope. Delegation never increases permissions.
- Team Leads may recommend approval, rejection or escalation; they cannot approve their own output, their own Skill, a security exception, a merge or a production release.
- Review and QA must be independent from the implementation run. Security review is mandatory for identity, tenant, secret, provider, migration, approval, broker and deployment changes.
- If a required specialist is unavailable, the task remains blocked or is reassigned to an equivalently registered agent; the Coordinator must not silently skip a mandatory review.

### 13.3 Team Lead operating contract

Every Team Lead must implement the same versioned contract. The following is the logical envelope; actual API and storage names must be reconciled with the accepted Agent Orchestration and Hub schemas before runtime implementation.

~~~json
{
  "contract": "nova.team-lead-task.v1",
  "task_id": "opaque-server-issued-id",
  "parent_task_id": null,
  "team_id": "registered-team-id",
  "lead_agent_ref": "server-registered-agent-ref",
  "initiator_ref": "hub-derived-actor-ref",
  "tenant_scope_ref": "hub-derived-tenant-ref",
  "goal": "bounded task statement",
  "allowed_capabilities": ["server-resolved-capability-ref"],
  "input_refs": ["authorized-resource-ref"],
  "acceptance_criteria": ["measurable criterion"],
  "budget": {
    "max_steps": 20,
    "max_tool_calls": 12,
    "timeout_ms": 120000,
    "max_input_bytes": 65536,
    "max_output_bytes": 32768
  },
  "status": "queued",
  "evidence_refs": [],
  "approval_ref": null
}
~~~

Contract rules:
- Task IDs, actor references, tenant scope, agent identity and capabilities are issued or resolved by trusted server-side services, never copied from model-generated payloads.
- User goals and retrieved/provider content are untrusted data. They cannot alter policy, tool registry, team membership, budgets or reviewer identity.
- Unknown fields, arbitrary URLs, inline code, shell commands, dynamic imports, unregistered agent refs and unregistered tool refs are rejected.
- Every child task inherits the parent's tenant, data scopes, capability ceiling, deadline and remaining resource budget. A child cannot widen any of them.
- Use idempotency keys for task creation and state transitions. Record immutable task events with actor, policy version, timestamp, parent/child refs and result hash.
- A task may return BLOCKED with a machine-readable reason. It must never fabricate success or evidence to satisfy an acceptance criterion.

### 13.4 Team-specific responsibilities and gates

**Research Lead**
- Prioritize primary sources, record publication/version/date and distinguish fact, inference and hypothesis.
- Preserve conflicting evidence and confidence limitations; do not turn provider consensus into ground truth.
- Cannot write to production knowledge or tenant memory without Knowledge Lead validation and applicable human approval.

**Engineering Lead**
- Inspect current main, dependency PRs and delivery plan before changing code.
- Work only on scoped feature branches and PRs; do not merge, force-push protected branches or deploy to production.
- Provide tests and a rollback plan. Do not introduce secrets or enable broker writes.

**Review Lead**
- Review exact PR head SHA, changed-file scope, dependency chain, authorization, failure behavior and maintainability.
- Must be independent of the implementation agent/run. A review recommendation is not a GitHub approval event unless a human reviewer explicitly submits it.
- Report blockers separately from non-blocking suggestions.

**QA & Test Lead**
- Test positive and negative paths, including unauthenticated, expired, wrong-owner, cross-tenant, malformed, replayed and over-budget requests where applicable.
- Bind every result to exact commit SHA, workflow run, test suite version and logs.
- Treat skipped checks, preview cancellations and unrelated green checks as not verified.

**Knowledge & Learning Lead**
- Accept only minimized, sanitized, provenance-backed observations.
- Separate candidate, validated, approved, published, deprecated and revoked states.
- Cannot publish, mutate immutable history or approve a Skill proposed by itself.

**Optimization Lead**
- Establish baseline and success metric before experiments; use reproducible fixtures and preserve negative results.
- Respect resource budgets and stop conditions. No tuning against final holdout data or production customer data without an approved protocol.
- Recommend changes; Engineering implements them and QA verifies them.

**Security Lead**
- Review identity derivation, tenant boundaries, capability allowlists, secret handling, prompt injection, tool egress, audit and rollback.
- Can issue a security blocker and recommend deny/hold. It cannot grant itself additional access or waive a human-required approval.
- Security-sensitive changes require explicit allow/deny evidence, not a UI status or architecture statement alone.

**Delivery Coordinator Lead**
- Maintain one canonical task graph and reuse existing GitHub issues/PRs/trackers.
- Order work by dependencies and risk; assign team tasks and collect evidence.
- May mark an item complete only when acceptance criteria are met and evidence refs are attached. Otherwise use IN_PROGRESS, BLOCKED or NOT_STARTED.
- Cannot close a security blocker, waive a dependency or represent a deployment as successful without provider/runtime evidence.

### 13.5 Standard lifecycle and handoffs

~~~text
INTAKE
  -> AUTHORIZED
  -> PLANNED
  -> DELEGATED
  -> IN_PROGRESS
  -> EVIDENCE_SUBMITTED
  -> INDEPENDENT_REVIEW
  -> QA_VERIFIED
  -> SECURITY_REVIEW (when required)
  -> HUMAN_APPROVAL (when required)
  -> COMPLETED
~~~

Any stage may transition to BLOCKED, REJECTED or CANCELLED with a reason and audit event. Rework returns to the responsible team and creates a new evidence revision; it does not overwrite prior results.

Required handoff packet:
1. Parent task and child task refs.
2. Exact goal, scope, non-goals and acceptance criteria.
3. Authorized input refs and inherited capability ceiling.
4. Changed paths and exact commit/PR head SHA, if code changed.
5. Test results and exact workflow/run refs.
6. Security/privacy impact and unresolved risks.
7. Rollback/recovery plan.
8. Decision requested and the human role that must approve it.

### 13.6 Independence, quorum and escalation

- Code changes require Engineering output plus independent Review and QA evidence before a completion recommendation.
- Identity, tenant, secrets, migrations, approval lifecycle, provider routing and deployment changes additionally require Security review.
- Skill publication requires a distinct human approver and immutable candidate/evaluation hashes; no Team Lead quorum can substitute for that human.
- Production release, billing/plan changes, credential changes, destructive data operations and any broker-write action require explicit human authorization in the relevant provider/system. AI recommendations are not authorization.
- Conflicting Lead recommendations are escalated to the human owner with both evidence sets; the Coordinator cannot resolve a policy conflict by majority vote.
- A Team Lead may request a second opinion from another registered Lead, but may not select or rewrite the reviewer result.

### 13.7 Initial rollout phases

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| TL-0 | Inventory existing Hub identity, Agent Orchestration, approval and audit contracts | Exact source paths, schemas and ownership mapped; no duplicate registry |
| TL-1 | Team registry and role/capability catalog (design first) | Server-owned IDs, immutable versions, no model-supplied privilege |
| TL-2 | Team Lead task envelope and delegation validator | Schema, inheritance, budget, idempotency and fail-closed tests |
| TL-3 | Coordinator + Research/Engineering/Review/QA leads in shadow mode | Synthetic tasks only; no external writes or merge/deploy actions |
| TL-4 | Security + Knowledge + Optimization leads | Tenant isolation, sanitized evidence, independent review and bounded experiments |
| TL-5 | Durable task events and human approval handoffs | Owner-scoped RLS, replay/expiry tests, audit and recovery proof |
| TL-6 | Controlled staging pilot | Exact SHA, allow/deny tests, resource metrics and rollback; human sign-off |
| TL-7 | Production consideration | Separate activation decision after all delivery-plan gates; not authorized by this design |

**Initial recommendation:** implement the contract and team-role catalog first, then run Coordinator and the four delivery leads in shadow mode against synthetic tasks. Do not connect the leads to customer records, broker tools, production deployment or merge permissions during the first rollout.

### 13.8 Definition of done for Team Leads

The architecture milestone is complete when team responsibilities, reporting line, contracts, inheritance rules, handoff packets, independence gates, escalation and rollout criteria are reviewed in the canonical PR. Runtime readiness remains separate and requires Hub-backed identity, server-owned team/agent registry, tenant isolation, durable events, budget enforcement, independent evaluation, audit, human approvals and tested rollback.

This model adds Team Leads to the existing Agent Orchestration / Learning Universe architecture. It does not create a parallel agent platform, task tracker, memory store, approval system or Skill registry.


## 13.9 Team Lead implementation gate — repository evidence, 2026-10-31

A repository-first inspection of current `main` confirms the following implementation facts:

- `integrations/system-hub/worker.js` authenticates through Supabase Auth and scopes broker connection reads by the authenticated `user_id`. It does not expose a verified tenant-registry lookup or a server-owned tenant membership contract.
- `supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql` defines owner-scoped `nova_agent_threads` and `nova_approval_requests`, with `user_id`, RLS, and atomic owner-bound approval RPCs. It does not define a general-purpose team task queue, team registry, delegation records, immutable task-event ledger, or task idempotency store.
- `frontend/app/api/agent/threads/route.js` and the approval routes use the authenticated Supabase user and the existing approval lifecycle. They are not a Team Lead runtime or general task scheduler.
- The existing approval lifecycle is a separate human-review primitive. Team Leads must call or hand off to that existing lifecycle when a supported approval is required; they must not create another approval table or infer approval from a Lead recommendation.

### Required identity decision before durable delegation

Until a tenant registry and membership contract are found and accepted on the canonical base:

1. Treat the authenticated Supabase `user.id` as the verified owner/actor identifier for owner-scoped records.
2. Do not manufacture a `tenant_ref`, infer a tenant from a connection, or treat a model-supplied tenant string as authorization.
3. Keep tenant-scoped delegation disabled. A future tenant identifier may be introduced only by an additive, reviewed identity/membership migration with RLS and two-principal allow/deny tests.
4. Do not persist Team Lead tasks or events yet. The current thread/approval tables do not provide the required parent-child delegation, immutable event, idempotency, cancellation, retry, or recovery semantics.
5. Before adding persistence, map the exact existing migration history and staging/production parity, then design the smallest additive schema that reuses `nova_agent_threads` and the existing approval RPCs without weakening their owner checks.

### Revised next implementation sequence

| Step | Deliverable | Gate |
|---|---|---|
| TL-0A | Identity source map: Auth user, owner-scoped rows, any existing tenant membership source | Exact schema/API evidence; no inferred tenant |
| TL-0B | Migration inventory and environment parity | Clean replay and source mapping evidence |
| TL-1 | Server-owned Team/Agent registry design | Immutable version, trusted lead-agent mapping, capability ceiling |
| TL-2 | Additive durable task/event schema proposal | Owner/RLS, idempotency, append-only events, parent-child inheritance, expiry and recovery tests |
| TL-3 | Server adapter and shadow-mode coordinator | Synthetic fixtures only; no customer data or external side effects |
| TL-4 | Independent Review, QA and Security gates | Exact-head CI and positive/negative owner-isolation evidence |

**Stop condition:** if identity ownership, migration parity, or the existing approval contract cannot be verified, keep the Team Lead runtime in design/contract-only mode. Passing Python contract tests does not authorize database writes, delegation execution, customer-data access, merge or deployment.


## 13.10 Owner-first Team Lead contract alignment — 2026-10-31

The Team Lead contract implementation was tightened after the current-main Hub and migration inspection. The current repository proves authenticated owner identity through Supabase Auth and owner-scoped rows, but it does not prove a tenant registry or tenant membership source.

Accordingly, the server-derived authorization context now requires an opaque owner reference and permits a tenant reference only when a trusted Hub tenant registry has actually resolved one. Owner-only scope is valid for the current owner-scoped model; a task payload may never supply either reference. Parent/child delegation must preserve owner scope and, when present, the exact verified tenant scope. No test fixture should invent a tenant identity merely to satisfy the contract.

Implementation evidence: PR #106 Team Lead contract head `6156380131d9980ba3f2a721db6b3d9c846f1f10` adds owner-scope validation, optional verified tenant scope, and tests for owner-only authorization and child owner-scope escalation. The NOVA Agent Orchestration Contracts workflow passed on that exact head: [run #41179271525](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41179271525). Frontend CI remains separately pending/in progress at the time of this update.

This is still a pure contract/validation milestone. It does not establish a tenant registry, durable task persistence, an authenticated Hub adapter, a scheduler, or an active Team Lead runtime. Runtime delegation remains blocked until the identity and migration gates are independently verified.


## 13.11 Synthetic four-team shadow planner — 2026-10-31

PR #106 now adds a pure in-memory shadow planning primitive for the initial Coordinator → Research / Engineering / Review / QA handoff. It requires all four child teams exactly once, validates each child against the server-owned registry and Hub-derived owner/capability/resource/deadline context, enforces distinct Coordinator/Engineering/Review/QA lead identities, and constrains the aggregate child budget to the parent task budget. Child input references must also be a subset of the parent task's declared inputs.

The returned plan is explicitly `shadow_only`; execution, persistence, external I/O and customer-data flags are false. Every parent input reference must use the `synthetic.` fixture namespace, and child references must be a subset of the parent task inputs. The module has no database, scheduler, tool, agent invocation or customer-data adapter. Synthetic tests cover complete planning, missing teams, non-synthetic inputs, parent-input scope, aggregate budget overrun, actor changes and independent reviewer/QA lead identities.

Implementation head: PR #106 commit `08f20d1359e6a092a77fe177bbd238ed52b4a9a8`. The NOVA Agent Orchestration Contracts workflow passed on that exact head: [run #41179627916](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41179627916). Frontend CI remains a separate in-progress check.

This advances the contract-only shadow planning milestone. It is not a durable task queue, a live Coordinator, a tenant registry, or an activated AI Team Lead runtime.

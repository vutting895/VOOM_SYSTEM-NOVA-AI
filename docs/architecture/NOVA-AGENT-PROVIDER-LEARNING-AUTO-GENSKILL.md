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

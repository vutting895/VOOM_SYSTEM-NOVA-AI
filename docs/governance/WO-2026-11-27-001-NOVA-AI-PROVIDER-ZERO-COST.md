# WO-2026-11-27-001 — NOVA AI Provider Setup (Zero-cost)

**Status:** AUTHORIZED — Work Order created; implementation is not yet authorized beyond branch-scoped planning/specification and non-production tests.
**Owner decision:** Gemini Primary; Cloudflare Workers AI fallback; Supabase-backed persistent Memory; NOVA AI Control Center; zero additional spend.
**Repository baseline:** `main@040a3bddd87b99c825d630a52c42ff36bf6fcab8` (checked 2026-11-27).
**Work branch:** `work/nova-ai-provider-zero-cost-20261127`
**Production boundary:** No deployment, production secret mutation, production DB/schema migration, billing activation, paid-service provisioning, or provider spend is authorized by this Work Order. Those require separate review and explicit approval.

## 1. Objective

Deliver a single governed AI provider path for NOVA with Gemini as the primary model, Cloudflare Workers AI as a bounded fallback, Supabase-backed owner-scoped persistent memory, and a simple NOVA AI Control Center. Reuse the existing `integrations/nova-ai-worker`, System Hub, Supabase Auth, and NOVA Command Center. Do not create a second AI Worker, duplicate authentication gateway, or parallel memory service.

## 2. Approved scope

1. **Gemini Primary**
   - Implement a server-side provider adapter using Google's supported Gemini API.
   - Keep provider credentials server-side only; never expose keys to browser bundles, logs, errors, or client-visible configuration.
   - Select a model only after verifying current API availability, documented free-tier eligibility, rate limits, data handling, and region/account constraints. Do not assume a model or quota is free.
   - Normalize provider responses, timeouts, transient errors, safety blocks, token/size limits, and request correlation into a provider-neutral contract.

2. **Cloudflare AI Fallback**
   - Reuse the existing Cloudflare AI binding in `integrations/nova-ai-worker/wrangler.toml`.
   - Fallback only for explicitly classified transient Gemini failures (e.g. timeout, 429, provider 5xx); do not silently fallback on authentication, authorization, validation, policy, or safety denials.
   - Enforce per-request and per-user limits. If the Cloudflare allowance is unavailable/exhausted, return a clear `provider_capacity_exhausted` response; do not use a paid route.
   - Expose provider/model actually used in safe diagnostics, without secrets or prompt leakage.

3. **Supabase Memory**
   - Design persistent conversation/thread memory using the selected NOVA Supabase project and the authenticated user's access token / owner scope.
   - Inspect current schema, migrations, RLS, retention, and existing thread/approval tables before proposing changes. Do not create duplicate tables or assume service-role access.
   - Define tenant/user isolation, explicit memory categories, retention/deletion semantics, bounded retrieval, prompt-injection/data-poisoning defenses, and audit redaction.
   - Prefer user-scoped RLS and least privilege. Any production migration, service-role secret, or data backfill is out of scope pending separate approval.
   - No cross-user retrieval, training on user content, or hidden memory write path.

4. **NOVA AI Control Center**
   - Add a compact, accessible UI within the existing NOVA Command Center.
   - Show provider readiness, configured primary/fallback policy, current request provider/model, memory status, safe usage/limit indicators, and sanitized recent diagnostics.
   - Include explicit disabled/unconfigured states; never infer readiness from static configuration alone.
   - No UI control may enable billing, change production secrets, deploy, alter Supabase production schema, or enable trading.

5. **Zero-cost governance**
   - No billing activation, paid plan, paid API, paid Worker resource, or automatic upgrade.
   - Use only verified free-tier allowances and existing resources. Document quotas, reset behavior, limits, and possible overage behavior before enabling any provider.
   - Hard-stop on exhausted/unverifiable allowance. No automatic paid fallback.
   - Add tests proving no billing or paid-provider path is invoked by router behavior.

## 3. Explicit exclusions / invariants

- No production deployment or release.
- No production secret changes, secret rotation, or secret reads.
- No production Supabase schema migration, RLS change, data backfill, or service-role use.
- No changes to GitHub Actions billing/account policy, Cloudflare billing, Google Cloud billing, or Supabase plan.
- No provider key in frontend code, committed files, test fixtures, logs, URLs, or error messages.
- No OpenAI provider invocation in this zero-cost setup.
- No broker mutation, order execution, Demo activation, Live Trading, or trading permission changes. Preserve `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`, and `brokerWrites=false`.
- No changes to DataCenter training/research ownership or model-promotion gates.

## 4. Architecture and contracts

- Keep the existing authenticated NOVA AI Worker as the provider boundary; browser requests must continue to pass through Supabase authentication.
- Proposed internal interfaces: `ProviderAdapter.generate(request, context)`, `ProviderRouter.generate(request, policy)`, and a Memory repository with explicit owner-scoped read/write methods.
- Router policy is server-owned and immutable from browser input: Gemini first; Cloudflare AI fallback only for eligible transient failures; otherwise fail closed.
- Provider selection, timeout, retry count, prompt/message size, output size, and fallback eligibility are bounded and testable.
- Memory retrieval is owner-bound, relevance/recency bounded, and treated as untrusted context; system policy always takes precedence.
- Control Center reads a sanitized health/status contract. It must not expose raw environment bindings, secret presence details beyond boolean readiness, user prompts, or raw provider payloads.

## 5. Phases and acceptance gates

### Phase 0 — Inventory and design (IN_PROGRESS)
- [ ] Re-read current Main SHA and inventory AI Worker, System Hub, Command Center routes/components, Supabase schema/migrations/RLS, and deployment workflow.
- [ ] Map all current provider calls and identify the existing Cloudflare AI invocation.
- [ ] Verify Gemini API/free-tier availability and document quota/region/overage conditions without enabling billing.
- [ ] Define provider-neutral schema, error taxonomy, fallback matrix, limits, memory threat model, and UI status contract.
- [ ] Identify exact files to change; avoid duplicate runtime or memory implementation.

### Phase 1 — Provider adapters and router (branch only)
- [ ] Implement Gemini adapter behind server-only environment binding.
- [ ] Implement Cloudflare AI adapter using existing binding.
- [ ] Implement deterministic router and fail-closed zero-cost policy.
- [ ] Add unit tests for primary success, eligible fallback, non-fallback errors, timeouts, 429/5xx, invalid response, limits, and exhausted allowance.
- [ ] Add secret-redaction and no-client-exposure tests.

### Phase 2 — Supabase Memory design and isolated validation
- [ ] Complete schema/RLS/migration inventory before any migration proposal.
- [ ] Implement repository contract and local/mock tests without production writes.
- [ ] Test owner isolation, cross-tenant denial, retention boundaries, deletion semantics, bounded retrieval, malicious memory payload handling, and audit redaction.
- [ ] Submit any required schema migration as a separate reviewable artifact; do not apply it to production under this Work Order.

### Phase 3 — AI Control Center (branch only)
- [ ] Add provider and memory status view in existing Command Center.
- [ ] Show unknown/degraded/disabled states accurately.
- [ ] Add accessible responsive layout, loading/error states, and safe diagnostics.
- [ ] Verify no client-side secret or provider-direct API call exists.

### Phase 4 — Verification and security review
- [ ] Run local unit/integration tests and static checks on exact branch head.
- [ ] Require hosted CI with assigned runner and inspectable executed steps; `runner_id=0` or empty steps are not test evidence.
- [ ] Review auth, RLS, tenant isolation, prompt injection, SSRF/redirect handling, abuse limits, privacy, and secret redaction.
- [ ] Verify no billing/account/production resource change occurred.
- [ ] Publish exact SHA, changed paths, test evidence, limitations, and a rollback plan.

### Phase 5 — Separate production readiness decision (NOT AUTHORIZED)
- [ ] Present provider quota evidence, security review, migration proposal, secret-name requirements (never values), operational limits, and deployment plan.
- [ ] Obtain separate explicit approval for production secret configuration, any production DB migration, and deployment. These approvals are independent.
- [ ] Until then, production remains unchanged and the feature remains unconfigured/disabled in production.

## 6. Required test matrix

| Area | Required proof |
|---|---|
| Gemini | Authenticated server-side call; valid response; timeout and provider error mapping |
| Fallback | Only eligible transient failures invoke Cloudflare AI; no fallback on 4xx/auth/policy/safety |
| Zero-cost | Exhausted or unverifiable quota hard-stops; no paid route or billing mutation |
| Secrets | No key in client bundle, source, logs, URL, test output, or API response |
| Auth | Missing/expired token denied; owner identity derived from verified Supabase session |
| Memory | Owner A cannot read/write Owner B data; RLS and repository checks agree |
| Memory safety | Bounded retrieval, untrusted-context treatment, deletion/retention tests |
| UI | Shows actual provider and health; does not claim ONLINE from static config |
| Trading | All execution flags remain false; no broker mutation route added |

## 7. Deliverables

- This Work Order and linked tracker record.
- Provider contract, adapters, router and tests on the work branch.
- Supabase Memory schema/RLS assessment and (if needed) a separate unapplied migration proposal.
- AI Control Center UI and safe status contract.
- Exact-head verification/security dossier and separate production approval checklist.

## 8. Stop conditions

Stop and report `BLOCKED_DECISION` if work requires billing, paid resources, production secrets, production deployment, production schema/RLS mutation, scope expansion, or any trading capability change. Stop and report `BLOCKED_DEPENDENCY` for unverified Gemini free-tier eligibility, missing Supabase schema/RLS evidence, unavailable test runner, or missing authentication/tenant evidence.

## 9. Initial audit facts (2026-11-27)

- Current Main: `040a3bddd87b99c825d630a52c42ff36bf6fcab8`.
- Existing AI Worker: `integrations/nova-ai-worker`; README identifies it as the source of truth for the deployed `voom-system-nova-ai` Worker.
- Existing Worker has Cloudflare AI binding `AI`, Supabase Auth verification, authenticated chat input validation, and research-only response contract.
- Existing Worker README states conversation threads are not yet persisted.
- System Hub Brain Core exists separately; this Work Order reuses the current AI Worker and Command Center rather than creating another Gateway.
- Current Command Center API contract includes `/v1/assistant/status`; its implementation and data source must be reconciled before UI claims readiness.
- Gemini adapter, verified Gemini free-tier eligibility, and complete persistent memory implementation have not yet been proven by this audit.
- No source runtime, secrets, production database, billing, or deployment was changed while creating this Work Order.

## 10. Next actions

1. Complete Phase 0 inventory, including current AI Worker provider invocation and Supabase schema/RLS.
2. Produce a narrow file-level implementation plan and fallback/error matrix.
3. Implement only on this work branch; keep production configuration and deployment blocked.
4. Update NOVA Master Tracker with exact branch/PR/CI evidence as work progresses.

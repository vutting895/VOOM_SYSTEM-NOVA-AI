# Command Center API — Data-source and implementation plan

**Date:** 2026-11-25  
**Baseline:** main@6968e5b3564a83b29a7e16976787bffd92387a49  
**Authority:** WO-004 documentation-only design. This document does not authorize runtime code, schema changes, PR merges, or deployment.

## 1. Source-of-truth matrix

| API route | Authoritative source / owner | Current evidence | Decision |
|---|---|---|---|
| GET /v1/health | Core API Worker process/build metadata; dependency probes reported separately | Contract exists; no Core API Worker/deployment target on main | Implement liveness separately from dependency readiness; process liveness must not imply every dependency is healthy |
| GET /v1/me | Supabase Auth verified session; role from trusted app_metadata.nova_role | Contract specifies JWT validation and fail-closed roles | Derive subject/role server-side; never trust browser-supplied user, tenant or role |
| GET /v1/services | Explicit allowlisted service probes and configured deployment metadata | No canonical live service registry/health aggregator identified | BLOCKED until probe list, timeout, freshness and degraded semantics are defined; no static ONLINE values |
| GET /v1/bridge/status | System Hub plus tenant-bound MT5 Bridge heartbeat/last-seen telemetry | System Hub owns connection records and read-only broker proxy; Command Center expects heartbeat fields; no canonical heartbeat record/API found | BLOCKED pending heartbeat producer/schema and tenant-to-connection mapping; missing/stale heartbeat must be disconnected/unknown, never inferred connected |
| GET /v1/bridge/account | System Hub owner-scoped connection/account snapshot | System Hub queries broker_connections under authenticated user and exposes sanitized connection/account paths | Reuse/proxy the typed System Hub operation; mask login/account identifiers; Core API must not access broker credentials directly |
| GET /v1/risk/policy | NOVA deterministic RiskWorker/policy configuration; policy version and effective scope | Risk schema defines decision outcomes and live_execution_allowed=false; UI asks for dailyLossLimit/maxExposure/maxOrders, but no canonical persisted policy source was identified | BLOCKED until one versioned policy source and owner/tenant scope are selected; do not synthesize limits from UI, docs or defaults |
| GET /v1/approvals | Existing public.nova_approval_requests joined to owner-scoped public.nova_agent_threads | Main migration 202610300001_nova_durable_approval_lifecycle.sql defines owner/thread RLS, expiry, immutable proposal and atomic RPC transitions | Reuse this lifecycle; map actual statuses (pending/approved/rejected/edited/expired/cancelled) to a versioned response; do not create a second approval store |
| GET /v1/audit | Append-only audit source with actor, action, time, correlation and sanitized metadata | nova.audit_events exists only in app-local 20261122000000_nova_schema_DRAFT.sql, explicitly NOT AUTO-APPLIED; no live migration-ledger proof | BLOCKED; decide whether to extend an existing canonical audit source or separately review/apply a dedicated audit migration. Do not assume draft table exists |
| GET /v1/assistant/status | NOVA AI Provider Gateway/runtime health, based on bounded provider readiness checks | AI Worker and model adapters exist, but no canonical aggregate status endpoint/source was established | BLOCKED pending provider registry, safe model identifier, readiness semantics and probe behavior; never expose keys, raw env or account data |

## 2. Critical schema conflict and guardrails

- The app-local draft migration creates nova.approvals and nova.audit_events. The existing durable approval migration uses public.nova_approval_requests and public.nova_agent_threads plus nova_create_approval/nova_resolve_approval. These are different data models. The draft nova.approvals table is not the canonical approval lifecycle and must not be applied as a duplicate.
- The draft nova.audit_events table is not evidence of an applied audit store. Its role-based SELECT policy and service-role write assumption require independent schema, grants, tenant scoping, retention and SECURITY DEFINER review before use.
- The current Command Center contract is GET-only. Keep all customer-facing routes read-only. Approval decisions and emergency-stop writes, if separately authorized in future, remain distinct POST operations with idempotency, role/ownership checks and durable audit confirmation; they are not part of this API implementation slice.
- Core API must verify Supabase sessions server-side, derive owner/role from trusted claims, enforce tenant ownership at every downstream call, use allowlisted upstream operations, sanitize responses, set bounded timeouts/rate limits, and return explicit unknown/degraded/unavailable states rather than fabricated health.
- Preserve ordersEnabled=false, executionEnabled=false, liveTradingEnabled=false and brokerWrites=false as hard invariants.

## 3. Implementation sequence — design only

1. Contract freeze: version response schemas, role matrix, error envelope, timestamps/freshness, pagination, cache policy and correlation IDs in Shared Contracts; reconcile Command Center with the existing durable approval lifecycle.
2. Data-source adapters: define typed read-only adapters for Supabase Auth, System Hub connection/account status, RiskWorker policy, durable approvals, audit source and AI Provider Gateway. Do not add a generic proxy.
3. Resolve blockers: identify/implement a real Bridge heartbeat producer; select canonical risk-policy persistence; decide audit-store ownership and migration; define service/provider probe registries.
4. Security and data tests: two-user/two-tenant isolation, role denial, expired/revoked token, stale heartbeat, upstream timeout, malformed response, secret redaction, pagination bounds and no-store behavior.
5. Exact-main implementation PR: create a fresh branch from current main; port only required code from #373/#377 after review. Do not merge either branch wholesale.
6. Staging verification: verify migration ledger and schema/RLS against the actual staging project; run exact-SHA API tests and authenticated Command Center E2E; verify deployment target and rollback.
7. Production gate: separate explicit authorization after evidence review. No deployment is authorized here.

## 4. Status after source review

- Durable approval source: IDENTIFIED IN REPOSITORY; live project migration state remains UNVERIFIED.
- Bridge heartbeat source: BLOCKED / NOT IDENTIFIED.
- Canonical risk-policy source: BLOCKED / NOT IDENTIFIED for the Command Center policy response.
- Audit source: BLOCKED; only a draft app-local table was found.
- Services and assistant aggregate health: BLOCKED pending explicit probe contracts.
- Core API implementation/deployment and authenticated E2E: NOT IMPLEMENTED / NOT VERIFIED on current main.
- No tests, migrations, runtime code, PR states, deployment, secrets, permissions or broker state were changed in this review.


## 5. Live Supabase verification addendum — 2026-11-25

Read-only connector inspection covered both linked active NOVA-related Supabase projects. Project identity/production-vs-staging designation must not be inferred from project names alone.

| Project ref | Repository/user context | Migration/schema evidence | Implication |
|---|---|---|---|
| rovhmjeowracayicbqij | The checked-in Command Center implementation document calls this the isolated staging project; the user has also previously referred to this project URL for NOVA Video production, so its environment designation is conflicting and must be reconciled | Migration ledger lists nova_durable_approval_lifecycle and nova_core_owner_scoped_schema. Catalog lookup confirms nova.approvals and nova.audit_events exist, but public.nova_agent_threads and public.nova_approval_requests do not exist. | This project has the app-local duplicate approval/audit schema but lacks the public durable approval tables expected by the existing canonical approval client. Treat as schema/migration drift; do not apply or drop anything until project role and migration ownership are resolved. |
| tlyyxufuiimrbaksoitf | Linked Supabase project named Voom_system; production designation not independently verified in this pass | Migration ledger includes nova_durable_approval_lifecycle. Catalog lookup confirms public.nova_agent_threads and public.nova_approval_requests exist; nova.approvals and nova.audit_events do not. | This project has the repository's durable approval schema. It also has public.system_heartbeats, public.system_controls, public.security_events, public.mcp_tool_audit and public.nova_analysis_audit_events. |

Additional verified observations:
- In tlyyxufuiimrbaksoitf, public.system_heartbeats currently reports zero rows. Its current RLS policy is staff-only, so it is not yet a customer-readable Bridge heartbeat feed. It is a candidate schema, not evidence of active heartbeat telemetry.
- public.system_controls currently contains three control keys: global_kill_switch, live_trading_enabled and llm_strategy_generation_enabled. This is not a complete numeric Risk Policy source for daily loss, exposure and order limits.
- public.security_events and public.mcp_tool_audit are staff-only read sources; public.nova_analysis_audit_events is a domain-specific analysis-job lifecycle audit. None is yet proven to be the complete customer-facing audit timeline required by /v1/audit.
- public.nova_agent_threads and public.nova_approval_requests have owner-scoped RLS policies. public.risk_guard_decisions has owner-or-active-staff read policy. public.system_heartbeats and public.system_controls have active-staff-only read policies.
- The project list and migration ledger were inspected read-only. No SQL writes, migrations, data edits, RLS changes, key changes or deployment were performed.

**Correction to Section 2 and Section 4:** The app-local nova.approvals/nova.audit_events schema is not merely an un-applied draft in every environment. It is present in rovhmjeowracayicbqij, while the canonical public approval tables are present in tlyyxufuiimrbaksoitf. The two projects have divergent schemas despite both migration ledgers listing a durable approval migration. This is a cross-environment migration reconciliation blocker, not permission to copy/drop schemas.

**Updated decisions:**
- Approval: canonical repository design remains public.nova_approval_requests/public.nova_agent_threads. tlyyxufuiimrbaksoitf has those tables; rovhmjeowracayicbqij does not. Verify which project is the intended NOVA staging/production target before any migration repair.
- Bridge: system_heartbeats is a candidate only; it is empty and staff-only. Need heartbeat writer, component naming, tenant/connection binding, freshness threshold and customer-safe projection.
- Risk: system_controls holds only global boolean toggles; no numeric daily-loss/max-exposure/max-orders policy source was found.
- Audit: several domain-specific sources exist; a unified customer-safe audit projection and explicit ownership/retention contract are still required.


## 6. NOVA Supabase ownership decision — user confirmed 2026-11-25

The user explicitly confirmed that Supabase project `rovhmjeowracayicbqij` is to be used for NOVA. Treat this project as the designated NOVA Supabase project for future NOVA planning and integration.

This confirms **project ownership/selection**, not its deployment tier. Whether this project is NOVA production, staging, or a dedicated NOVA Video environment remains unconfirmed; do not label it production or staging without a separate explicit designation.

Current live schema remains as observed:
- `nova.approvals` and `nova.audit_events` exist.
- `public.nova_agent_threads` and `public.nova_approval_requests` do not exist.
- The durable approval lifecycle migration is listed in the migration ledger, but its expected public objects are absent from this project.
- This is a schema/migration reconciliation issue to resolve against the selected NOVA project, not a reason to redirect NOVA to another Supabase project or copy/drop tables immediately.

**Next implementation prerequisite:** prepare a project-specific, non-destructive migration reconciliation plan for `rovhmjeowracayicbqij`, including migration ledger, actual schema, RLS, grants, dependencies, row counts and rollback/backup evidence. No SQL mutation or migration application is authorized by this ownership confirmation.

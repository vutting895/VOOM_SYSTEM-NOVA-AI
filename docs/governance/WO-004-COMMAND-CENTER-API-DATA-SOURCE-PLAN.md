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

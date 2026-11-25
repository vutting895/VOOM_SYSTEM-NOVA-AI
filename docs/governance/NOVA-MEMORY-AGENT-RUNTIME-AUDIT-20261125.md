# NOVA Memory and Agent Runtime Audit

**Date:** 2026-11-25  
**Repository baseline:** `main@821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Branch:** `audit/nova-memory-agent-runtime-20261125`  
**Scope:** Repository/code and read-only Supabase catalog. No DDL, migration, deployment, or trading action was performed.

## Executive finding

Do not activate a new Durable Memory Adapter or general Agent Tool Execution runtime yet. Existing owner-scoped approval and MT5 read-only routing components should be reused. Two connected Supabase projects have different approval schemas, and the intended production/staging mapping is not confirmed. No dedicated tenant-scoped conversation-memory adapter was verified in the inspected runtime. The legacy Python MCP prototype is mock/in-memory and explicitly not production-ready.

## Evidence

### GitHub main
- Main SHA: `821db357d70d3613b0ca61520eaae5c5307e8fd4`.
- Durable approval migration: `supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql`.
- Approval tests: `tests/nova-approval-migration.test.mjs`, `tests/sql/nova-approval-migration.integration.sql`.
- Existing control plane: `integrations/system-hub/worker.js`.
- Remote MCP: `integrations/remote-mcp-worker/src/index.js`.
- Read-only tenant router: `integrations/mt5-relay/tenant_router.py`.
- Legacy MCP prototype: `integrations/nova-ai-mcp-full-clean/mcp-server/server.py`.

### Supabase read-only inspection (2026-11-25)

| Project | Status | Approval schema |
|---|---|---|
| `rovhmjeowracayicbqij` (`vutting895's Project`) | ACTIVE_HEALTHY | Has `nova.approvals` and `nova.audit_events`; lacks `public.nova_agent_threads` and `public.nova_approval_requests` |
| `tlyyxufuiimrbaksoitf` (`Voom_system`) | ACTIVE_HEALTHY | Has both public durable approval tables with RLS |

In `rovhm...`, the migration ledger records `20261030052224 nova_durable_approval_lifecycle`, and public wrappers/private implementation functions exist, but the expected public tables are absent. Authenticated role has EXECUTE on private approval implementation functions. Do not call these functions until schema is reconciled.

In `tlyyx...`, the ledger records `20261031070311 nova_durable_approval_lifecycle`. It contains `public.nova_agent_threads`, `public.nova_approval_requests`, `public.nova_analysis_jobs`, `public.nova_analysis_audit_events`, `public.mcp_tool_audit`, and `public.learning_events`, with RLS enabled. Observed policies include owner-scoped thread/approval reads and thread creation, owner-scoped analysis audit reads, and staff-only MCP audit reads. Catalog presence does not prove end-to-end API or two-tenant tests pass now.

**Environment conflict:** repository documentation calls `rovhm...` isolated staging, while the user previously supplied its URL for a NOVA Video project. The other project is labelled `Voom_system`. Confirm project roles before any schema change.

## Runtime findings

- Reuse System Hub as the authenticated control plane; do not create another broker gateway.
- Tenant router binds the verified user ID and connection ID and allows only read-only capabilities.
- Approval migration implements owner-bound review threads, immutable proposal hash, expiry, versioned decisions and replay protection. It is for strategy-draft review, not general tool execution.
- No dedicated tenant-scoped durable conversation-memory adapter was verified in inspected runtime/catalog.
- `mcp_tool_audit` is an audit table, not an authorization registry.
- `learning_events` is a lifecycle event table, not proof of online memory retrieval.
- Legacy Python MCP uses in-memory `strategies_db` and random mock backtest/tuning values; README explicitly says not production-ready.
- GitHub code search had intermittent timeouts. These findings are bounded by inspected paths/catalog; search absence is not proof of global absence.

## Required sequence

1. **Gate A — BLOCKED:** confirm production/staging project mapping; compare migration ledger, tables, grants, RLS and function definitions; reconcile schema drift with rollback plan.
2. **Gate B — NOT STARTED:** define versioned memory contract; implement server-side owner-scoped reads/writes; RLS and two-user negative tests; retention, deletion/export, redaction and audit; do not store secrets or raw chat by default.
3. **Gate C — NOT STARTED:** separate tool catalog from executable capabilities; add typed contracts, tenant/resource binding, permission checks, bounded execution, audit and approval routing; test cross-tenant, replay, expiry and denied tools.
4. **Gate D — NOT STARTED:** one-way GitHub-main-to-Notion documentation sync first. Notion is not runtime memory or authorization. Add source SHA, deterministic mapping, conflict detection and secret/data sanitization.
5. **Gate E — NOT STARTED:** local migration tests and two-user tests on confirmed staging; record exact SHA, CI run, migration ledger, test logs and rollback evidence.

## Guardrails

- GitHub `main` is source of truth; use reviewed PRs.
- Do not apply, repair, rename or drop schema until project roles are confirmed.
- Do not create duplicate approval storage or a second broker gateway.
- Memory owner/tenant scope must derive from verified `auth.uid()`, never caller-supplied authority.
- Retrieved memory/model output never grants tool permissions.
- Keep MT5 read-only; order submission and Live Trading remain disabled.

## Status snapshot

| Item | Status |
|---|---|
| Main SHA and project catalog | DONE |
| Approval schema comparison, RLS and grants | DONE (read-only) |
| Runtime memory inventory | IN PROGRESS (search timeouts) |
| Production/staging mapping | BLOCKED |
| Durable Memory Adapter / general Agent Runtime / Notion sync | NOT STARTED |
| Schema repair or deployment | NOT AUTHORIZED / NOT EXECUTED |

This is an audit snapshot, not a production-readiness certificate. Re-audit current main and confirmed project mapping before implementation.

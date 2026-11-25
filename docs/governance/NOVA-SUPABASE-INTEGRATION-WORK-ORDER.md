# NOVA Supabase Integration Reconciliation — Dev/Test Work Order

**Date:** 2026-11-25  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Base branch:** `main`  
**Base SHA:** `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Work branch:** `work/nova-supabase-integration-reconciliation`  
**Execution class:** Documentation / Dev-Test planning only  
**Production changes:** NOT AUTHORIZED

## 1. Objective

Resolve the mismatch between NOVA's documented Supabase target, runtime database contracts, and live project schema/migration state. Establish a reproducible, recoverable Dev/Test path before proposing any schema repair or environment change.

This work order does not authorize a production database change, migration, data copy, secret rotation, deployment, broker connection, or live execution.

## 2. Evidence baseline

### Repository and runtime

- Canonical repository main was rechecked at `821db357d70d3613b0ca61520eaae5c5307e8fd4`.
- `docs/NOVA-SUPABASE-CONNECTION.md` identifies project `rovhmjeowracayicbqij` as the user-confirmed NOVA target and sets the frontend URL to `https://rovhmjeowracayicbqij.supabase.co`.
- NOVA MT5 read-only proxy and system-hub runtime use `public.broker_connections`.
- The repository migration `supabase/migrations/202610270001_mt5_customer_connections.sql` defines the expected owner-scoped, Demo-only broker connection contract with RLS.
- The existing `docs/governance/NOVA-SUPABASE-MIGRATION-RECONCILIATION.md` records that the selected `rovhmjeowracayicbqij` project reports `MIGRATIONS_FAILED`, lacks `public.nova_agent_threads` and `public.nova_approval_requests`, and has migration ledger entries whose exact SQL provenance is unresolved.
- The same reconciliation record says backup/PITR and restore-point evidence are unavailable through the connected tools and must be verified by an operator in the Supabase Dashboard.

### Project comparison

- `rovhmjeowracayicbqij`: documented/user-confirmed NOVA target; do not switch away from it without an explicit architecture decision. Current schema/migration drift blocks any claim of readiness.
- `tlyyxufuiimrbaksoitf`: has a more complete observed schema for some NOVA runtime contracts, including `public.broker_connections`, but is not established by current repository configuration as the authorized NOVA target. Treat it as a comparison/reference project only until ownership, environment, data classification, and intended role are confirmed.
- `sblwulsqzlqmycvdolcu`: inactive project; contents remain unverified. Do not restore or activate it because the Free organization is at its two-active-project quota and doing so may require pausing another project.

No database writes or project configuration changes were performed for this work order.

## 3. Required work packages

### WP-1 — Runtime configuration inventory

1. Enumerate every Supabase consumer in the repository: frontend, Cloudflare Workers, backend services, tests, scripts, scheduled jobs, and CI.
2. Record variable names and consumer paths only. Never retrieve, print, commit, or copy secret values.
3. Identify each consumer's expected schema, tables, RPCs, Auth behavior, and required role.
4. Compare repository defaults, deployment variable names, and actual project references without changing any environment.
5. Produce a consumer-to-contract matrix with source path and evidence.

**Exit criteria:** every consumer is mapped; no unexplained Supabase URL or service-role usage remains.

### WP-2 — Migration provenance and schema drift

1. Export the exact migration ledger for the documented target.
2. Compare every ledger version/name to migration files in the canonical repository and release artifacts.
3. Recover authoritative SQL for ledger versions `20261123120144`, `20261123120159`, and `20261123172149` (and any other unmatched entries) from their original release source. Do not reconstruct SQL from migration names.
4. Resolve the durable-approval timestamp/name mismatch between the live ledger entry and repository migration.
5. Explain why the durable-approval functions exist while their expected public tables are absent.
6. Inspect grants, RLS policies, function EXECUTE permissions, SECURITY DEFINER search_path, triggers, indexes, and dependencies table-by-table.

**Exit criteria:** every live migration is traceable to exact source SQL and every expected/missing object has a documented explanation.

### WP-3 — Recoverability and backup evidence

1. In Supabase Dashboard, verify plan, backup type, latest successful backup timestamp, retention, and available restore points.
2. Verify PITR status and recovery window, if available; do not enable paid features.
3. Verify Storage object backup separately from PostgreSQL backup.
4. Obtain a logical schema-and-data export with checksum and documented scope.
5. Demonstrate restore to a separate, cost-approved test target if available. Never overwrite the selected project for a test.
6. Record who verified the restore and the exact evidence.

**Exit criteria:** a restorable pre-change snapshot and rollback route are demonstrated, not merely assumed.

### WP-4 — Isolated Dev/Test validation

Only after WP-1 through WP-3 pass and a test target is explicitly approved:

1. Apply recovered/reconciled migrations only to the isolated test target.
2. Test two-user tenant isolation and unauthorized cross-user reads/writes.
3. Test approval creation, resolution, expiry, duplicate requests, invalid state transitions, and role denial.
4. Test emergency-stop visibility and authorization semantics.
5. Test `public.broker_connections` owner scoping, pending-only insertion, Demo-only constraints, and read-only MT5 proxy behavior.
6. Verify service-role credentials remain server-side and no secret enters browser bundles or logs.
7. Run regression tests for system-hub and MT5 proxy endpoints.
8. Capture SQL catalog snapshots, test logs, migration ledger, and exact tested commit SHA.

**Exit criteria:** all tests pass on the isolated target with reproducible evidence; no production resource was modified.

## 4. Decision gates

| Gate | Required evidence | Current status |
|---|---|---|
| A — Runtime inventory | Complete consumer/config contract matrix | NOT STARTED |
| B — Migration provenance | Exact SQL for every live ledger entry | BLOCKED |
| C — Recoverability | Backup/export checksum and restore proof | BLOCKED |
| D — Test target | Isolated target, cost and ownership approved | BLOCKED |
| E — Dev/Test validation | Tenant/RLS/RPC/API regression evidence | NOT STARTED |
| F — Production change proposal | Separate explicit approval and rollback plan | NOT AUTHORIZED |

A blocked gate must not be bypassed by manually applying guessed SQL or changing the environment URL.

## 5. Canonical target decision rule

The documented target `rovhmjeowracayicbqij` remains the configuration baseline because the repository explicitly identifies it as the user-confirmed NOVA project. This is not a claim that the project is migration-healthy or production-ready.

The project `tlyyxufuiimrbaksoitf` must not be promoted to canonical solely because its observed schema appears more complete. A future change requires a written decision covering:
- project ownership and intended environment;
- all data domains and tenant boundaries;
- frontend, Worker, and backend consumer compatibility;
- Auth/JWT issuer and key compatibility;
- RLS/grants/function security parity;
- data migration and reconciliation;
- backup/restore and rollback;
- deployment cutover and verification.

## 6. Safety invariants

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No broker writes or broker account connections.
- No production database DDL/DML, migration, data copy, or RLS/grant/function changes.
- No production secrets or environment variables changed.
- No deployment and no merge to `main`.
- No paid plan, PITR add-on, or new project creation.
- Do not pause an active project to restore the inactive project without separate explicit approval.

## 7. Deliverables

1. Supabase consumer-to-contract inventory.
2. Live migration ledger-to-source provenance matrix.
3. Table/RPC/RLS/grant/security compatibility matrix.
4. Backup and restore evidence record.
5. Dev/Test execution report with exact tested commit and logs.
6. Separate production change proposal only after all prior gates pass.

## 8. Current status

**WORK ORDER CREATED:** documentation-only plan on `work/nova-supabase-integration-reconciliation`.

**IN PROGRESS:** branch contains this work order only.

**BLOCKED:** migration provenance, backup/restore evidence, isolated test target approval, and full runtime consumer inventory.

**NOT DONE:** no schema changes, SQL writes, data copy, secret changes, deployment, merge, broker action, or live-trading enablement.

**Next action:** complete WP-1 by inventorying every repository Supabase consumer and produce the contract matrix; request operator-supplied Dashboard backup/restore evidence before any database test or DDL.

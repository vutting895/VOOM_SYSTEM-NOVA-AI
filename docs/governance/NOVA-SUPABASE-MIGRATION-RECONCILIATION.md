# NOVA Supabase Migration Reconciliation Plan

**Date:** 2026-11-25  
**Selected project:** `rovhmjeowracayicbqij` (user-confirmed NOVA Supabase project)  
**Repository baseline before this document:** `7e1f2933b4a24c03db66d63d5246f22ab7d0a351`  
**Execution status:** READ-ONLY AUDIT COMPLETE; REPAIR NOT AUTHORIZED / NOT EXECUTED.

## 1. Executive finding

The selected project is reported `ACTIVE_HEALTHY` by the project API, but its only listed branch `main` reports `MIGRATIONS_FAILED`. Do not treat project health as proof that schema migrations are healthy.

The migration ledger reports eight versions:
- `20261030052224 nova_durable_approval_lifecycle`
- `20261030125402 mt5_customer_connections`
- `20261101123853 affiliate_cleanup_legacy_tables`
- `20261101124123 affiliate_core_state_persistence`
- `20261123120144 nova_core_owner_scoped_schema`
- `20261123120159 nova_core_owner_fk_indexes`
- `20261123141239 nova_mt5_customer_connections`
- `20261123172149 nova_mt5_connection_view_contract`

However, the repository's root `supabase/migrations` directory contains the durable approval file named `202610300001_nova_durable_approval_lifecycle.sql`, not the ledger version `20261030052224`. The three later NOVA migration names/versions shown in the live ledger were not found as matching files in the root migration directory at the inspected main baseline. The app-local `20261122000000_nova_schema_DRAFT.sql` is explicitly marked DRAFT / NOT AUTO-APPLIED.

## 2. Live schema inventory

### Present in selected project
- `nova.approvals`: 0 rows, RLS enabled.
- `nova.audit_events`: 0 rows, RLS enabled.
- `nova.emergency_stops`: 0 rows, RLS enabled.
- `nova.mt5_broker_connections`: 0 rows, RLS enabled.
- Project also has `public.affiliate_state_snapshots` (0 rows; table comment identifies it as VOOM Studio Affiliate private server-side state).

### Missing but expected by canonical durable approval migration
- `public.nova_agent_threads`
- `public.nova_approval_requests`

### Orphaned approval functions
The following public wrappers and private implementation functions exist:
- `public.nova_create_approval`
- `public.nova_resolve_approval`
- `private.nova_create_approval_impl`
- `private.nova_resolve_approval_impl`
- `private.nova_approval_guard_update`
- `private.nova_valid_strategy_draft_proposal`

The implementation functions explicitly query/write the missing `public.nova_agent_threads` and `public.nova_approval_requests`. Calls relying on this approval lifecycle are therefore not proven operational and are expected to fail until the schema is reconciled. Do not execute them as a test against this project.

## 3. Existing `nova.*` controls and permissions

- `nova.approvals` authenticated role has SELECT only; RLS policy allows a row when requester/decider matches `auth.uid()` and signed `nova_role` is one of admin/operator/viewer.
- `nova.audit_events` authenticated role has SELECT only; RLS policy filters actor to `auth.uid()` and requires admin/operator/viewer role.
- `nova.emergency_stops` authenticated role has SELECT only; RLS policy requires requester ownership and admin/operator role.
- `nova.mt5_broker_connections` authenticated role has SELECT and INSERT only; INSERT policy restricts to own pending Exness MT5 Demo request with no bridge route assigned.
- `nova` schema usage is granted to authenticated and service_role; not anon.
- `private` schema usage is granted to authenticated; not anon. Review this exposure as part of the repair because authenticated callers can reach granted private approval implementation functions.
- Public schema currently has no RLS policies returned by the policy catalog query. Do not infer that this means all public tables are exposed; inspect grants and RLS table-by-table.
- The database has no row data in the four listed `nova.*` tables at the time of inspection.

## 4. Advisor and runtime evidence

- Security advisor: INFO finding on `public.affiliate_state_snapshots` having RLS enabled with no policies; WARN that leaked-password protection is disabled.
- Performance advisor: five unused indexes on currently empty `nova.*` tables. Do not drop them based on this snapshot alone.
- Health advisor: no findings returned.
- Only listed Edge Function: `nova-staging-auth-isolation-once`, ACTIVE, `verify_jwt=true`; its source returns HTTP 410 `staging_test_endpoint_disabled`. It is not a production NOVA API.
- Database size reported as 11 MB; this is not a backup or restore-point verification.
- Supabase connector exposes no backup inventory/restore-point listing action in this workflow. Backup/PITR status and a restorable backup therefore remain UNVERIFIED.
- Postgres log query for migration/approval errors over the available recent log window returned no rows; this does not explain the historical branch `MIGRATIONS_FAILED` state.

## 5. Required reconciliation sequence (non-destructive first)

### Gate A — establish recoverability
1. In Supabase Dashboard, verify the selected project's backup schedule, latest successful backup timestamp, PITR availability/retention and restore procedure.
2. Obtain a logical schema-and-data export or other independently restorable snapshot before DDL.
3. Record restore point, export checksum, export scope and owner approval. Do not proceed if restoreability is not demonstrated.
4. Do not create a Supabase development branch until its cost is known and explicitly accepted; the currently listed branch itself reports `MIGRATIONS_FAILED`.

### Gate B — reconcile migration provenance
1. Export the exact migration ledger and compare every live version/name against the Git repository and any deployment artifact that applied it.
2. Recover the exact SQL for ledger versions `20261123120144`, `20261123120159`, `20261123141239`, and `20261123172149` from the authoritative release artifact/source repository. Do not reconstruct or re-run them from their names.
3. Resolve the timestamp/name mismatch for durable approval migration (`20261030052224` live vs `202610300001` repository file) and mt5 migration history before any migration action.
4. Determine why the durable approval ledger entry exists while both required public tables are absent, and why its public/private functions remain installed.

### Gate C — choose canonical data model
1. Preserve the repository's durable owner/thread approval model (`public.nova_agent_threads` + `public.nova_approval_requests`) as the intended lifecycle unless an explicit architecture decision supersedes it.
2. Do not silently map or copy `nova.approvals` rows into the durable model. Although currently zero rows, preserve the table until dependency and ownership checks are complete.
3. Decide whether `nova.audit_events` is retained as a separate legacy audit source, adapted, or superseded. No destructive cleanup in this plan.
4. Keep Affiliate-owned `public.affiliate_state_snapshots` out of NOVA API scope; determine whether its presence is intentional or a project-boundary violation.

### Gate D — implement only after explicit authorization
1. Write a forward-only, idempotent reconciliation migration based on recovered authoritative SQL and the verified live catalog.
2. Ensure all owner-scoped RLS, grants, function EXECUTE permissions, SECURITY DEFINER search_path hardening, trigger dependencies and indexes are explicitly tested.
3. Do not drop legacy tables/functions or rewrite migration history in the repair migration.
4. Apply first to an isolated, cost-approved test target; run two-user isolation, approval create/resolve/expiry, role denial and no-broker-write tests.
5. Obtain explicit approval before applying to the selected NOVA project. Then verify catalog, migration ledger, function calls, rollback/restore readiness and exact deployed revision.

## 6. Rollback principles

- Preferred rollback is restore to the verified pre-change backup/PITR point if forward migration causes unexpected behavior.
- A SQL down migration is not yet safe to define because the exact provenance and dependencies of later live migrations are unresolved.
- Do not drop `nova.approvals`, `nova.audit_events`, `nova.emergency_stops`, `nova.mt5_broker_connections`, approval functions or schemas as a rollback shortcut.
- Preserve migration history; never delete or rewrite applied ledger rows to make status appear healthy.

## 7. Current decision

**BLOCKED:** backup/PITR verification, exact SQL provenance for four live migration entries, cause of `MIGRATIONS_FAILED`, and canonical schema reconciliation remain unresolved.

**NOT DONE:** no DDL, SQL write, migration, data copy, row update, RLS/grant change, branch creation, function invocation, Edge Function deployment, production deployment or broker action was performed.

**Safety invariant:** `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`, and broker writes remain disabled.


## 8. Backup/PITR verification — 2026-11-25 follow-up

The connected Supabase project metadata exposes project/database status and branch status, but the connected Supabase toolset does not expose a backup inventory, latest backup timestamp, PITR retention window, or restore-point validation action. Therefore backup/PITR is still **UNVERIFIED**; no inference is made from `ACTIVE_HEALTHY`, PostgreSQL 17.11, or database size.

Supabase's current documentation states:
- Daily automatic database backups are provided for Pro, Team and Enterprise projects (retention varies by plan); Free projects should create regular logical exports and keep off-site copies.
- PITR is a paid add-on for paid plans; when PITR is enabled, daily backups are replaced by PITR recovery coverage.
- PITR restore overwrites the current database state. Supabase recommends restoring to a new project first when preserving current data is important.
- Database backups do not include Storage API object contents; Storage objects require a separate backup/transfer plan.

References:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery

### Required operator evidence (Dashboard)
1. Open the selected project `rovhmjeowracayicbqij` in Supabase Dashboard.
2. Open **Database → Backups** and capture the backup type, latest successful backup timestamp, and available restore points. If PITR is configured, open **Point in Time** and capture earliest/latest recovery points and retention period.
3. Confirm project plan and billing impact before enabling PITR or creating a restore/clone target. No paid add-on is authorized by this work order.
4. Verify Storage object backup separately; a database backup alone is insufficient for full application recovery.
5. For repair testing, prefer **Restore to a New Project** if the plan supports it; do not restore over the selected NOVA project.
6. Record evidence (timestamp, timezone, backup type, restore window, retention, Storage backup coverage, and whether restore-to-new-project is available) in this document before proposing any DDL.

**Result:** No backup listing or restore-point evidence was accessible through the connected tools. Operator Dashboard evidence is required. No restore, clone, PITR enablement or billing change was performed.

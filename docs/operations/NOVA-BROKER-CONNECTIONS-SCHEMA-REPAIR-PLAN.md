# NOVA broker_connections schema repair plan

**Status:** BLOCKED — investigation only; no production DDL authorized or executed.
**Project:** `rovhmjeowracayicbqij` (canonical NOVA Supabase project)
**Observed:** 2026-11-23
**Related PR:** #373

## 1. Evidence

- `to_regclass('public.broker_connections')` returned `NULL`.
- Supabase table inventory did not include `public.broker_connections`.
- `supabase_migrations.schema_migrations` records version `20261030125402`, name `mt5_customer_connections`.
- The stored migration row contains one SQL statement matching the current repository migration `supabase/migrations/202610270001_mt5_customer_connections.sql`.
- The recorded migration has no rollback statements (`rollback IS NULL`).
- The repository migration creates the owner-scoped Exness MT5 Demo table, enables RLS, grants authenticated SELECT/INSERT only, and defines owner-only SELECT plus pending-only INSERT policies.
- No evidence currently identifies when or how the table disappeared.

## 2. Safety boundary

Do not:
- rerun the already-recorded migration through the normal migration runner;
- execute ad hoc DDL against production;
- drop/recreate unrelated schemas or tables;
- assign a customer bridge route or mark a connection connected;
- deploy the customer proxy or claim customer E2E success;
- enable broker writes, order execution, or Live Trading.

## 3. Required preflight before any repair

1. Confirm project identity and `ACTIVE_HEALTHY` status.
2. Confirm a recent recoverable database backup/PITR restore point in Supabase dashboard and record its timestamp. The available connector does not expose backup inventory or prove restore readiness.
3. Export the current schema-only definition and security state for the target object namespace: grants, RLS flags, policies, triggers, indexes, and relevant functions. Preserve a timestamped copy outside production.
4. Re-run read-only checks for:
   - `to_regclass('public.broker_connections')`;
   - all relations named `broker_connections` across schemas;
   - migration row version/name/statements/rollback;
   - current project migrations and repository migration checksum/blob;
   - grants and RLS state after the table is present.
5. Reconcile any new evidence with this plan and obtain explicit approval before production DDL.

## 4. Isolated validation

Use an existing isolated Supabase staging project only if its identity and isolation are verified. Do not create a paid Supabase branch or project without cost disclosure and user approval.

Apply the exact repository migration to staging and verify:
- table columns, constraints, unique keys, index, trigger and comments;
- RLS enabled;
- authenticated has SELECT and INSERT only;
- anon/public have no access;
- SELECT policy is owner-scoped;
- INSERT policy permits only the caller's pending Exness Demo request with no route ID;
- customer A cannot read customer B's row;
- customer cannot assign `bridge_route_id` or change status to connected.

A passing local Supabase test is not a substitute for hosted staging acceptance.

## 5. Production repair approach (proposal only)

If preflight and staging pass and the user explicitly approves:
- create a new, separately named forward-repair migration (do not rewrite the historical migration row);
- use the reviewed canonical table definition from `202610270001_mt5_customer_connections.sql`;
- do not include unrelated NOVA, Affiliate, broker, or trading changes;
- apply once through the Supabase migration workflow;
- verify catalog, grants, policies, indexes and trigger immediately afterward;
- run an authenticated, controlled customer-session read test before enabling proxy routing.

Because the relation is currently absent, no existing table rows can be backed up from it. That does not remove the need for a project-level recoverable backup before production DDL.

## 6. Rollback and recovery

The historical migration row has `rollback = NULL`. Do not invent a destructive SQL rollback. The safe rollback strategy is:
- stop rollout and keep the Worker/proxy disabled;
- if repair fails, preserve diagnostics and do not drop the partially repaired table automatically;
- restore the project from the verified pre-change backup/PITR point only under a separately approved recovery decision;
- otherwise prepare a forward corrective migration after review.

Restoring a project backup can roll back unrelated customer data and migrations; it is not a routine rollback and requires explicit approval.

## 7. Exit criteria

- [ ] Backup/PITR recovery point verified and recorded.
- [ ] Staging migration and two-customer RLS acceptance pass.
- [ ] Explicit production DDL approval received.
- [ ] Forward repair migration applied and catalog/security checks pass.
- [ ] Supabase Data API exposes schema/table as required.
- [ ] Authenticated customer JWT can read only its own pending connection.
- [ ] Tenant route is provisioned separately by trusted administration.
- [ ] Customer proxy E2E passes with read-only account/quote data and no secrets exposed.

**Current release state:** Customer Proxy BLOCKED; Worker NOT DEPLOYED; PR #373 DRAFT; no production DDL; all broker writes and Live Trading OFF.

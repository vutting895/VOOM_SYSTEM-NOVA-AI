# NOVA Phase B — Data Catalog & R2 Adapter

**Target Supabase:** `Voom_system` / `tlyyxufuiimrbaksoitf` / `ap-southeast-1`  
**Target Cloudflare account:** connected account; R2 activation currently required.  
**Git baseline:** `main` SHA `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`.  
**Working branch:** `feature/nova-data-training-foundation-20261118`.

## Findings
- The Supabase `Voom_system` project is ACTIVE_HEALTHY on PostgreSQL 17.11.
- It already contains 24 public tables, all with RLS enabled, and 29 recorded migrations.
- Existing schema includes NOVA governance, analysis jobs, MT5 connection metadata, and other application data. Phase B therefore adds only three new catalog tables and does not alter existing tables.
- R2 API returned error 10042 asking to enable R2 in Dashboard. Bucket creation and remote object tests are blocked until that account-level action is completed.

## Additive database draft
The SQL draft is at `supabase/migration-drafts/nova_data_catalog.sql`. It adds:
1. `nova_data_ingestion_jobs` — idempotent ingestion job ledger.
2. `nova_datasets` — immutable dataset catalog and approval/quality state.
3. `nova_data_artifacts` — object index with SHA-256 and size.

All three tables enable RLS, revoke client roles `anon` and `authenticated`, and grant access only to `service_role`. No broker credentials, raw candles, model weights, or large binary data are stored in Postgres.

This file is deliberately a **draft**, not a Supabase migration and has not been applied. The repository does not currently contain `supabase/config.toml`, and the Supabase skill requires creating the formal migration using `supabase migration new nova_data_catalog` from a local Supabase CLI workspace. Do that after checkout; then place the reviewed SQL in the generated migration file.

## R2 adapter
`workers/data-ingestion/r2_storage.mjs`:
- restricts object keys to NOVA prefixes and blocks traversal;
- computes SHA-256 on the Worker side;
- performs atomic create-only writes (no overwrite);
- verifies checksum metadata after upload and after download;
- exposes head/list/read/write helpers only; no delete helper.

Unit tests are in `r2_storage.test.mjs` and run with:
`node --test workers/data-ingestion/r2_storage.test.mjs`

## Backup, preview, apply, rollback
1. Export a verified pre-change database backup (schema + data) and retain its timestamp/checksum outside this repository.
2. Verify the target project ref is `tlyyxufuiimrbaksoitf`; do not point this migration at the separate NOVA Video project.
3. Create a Supabase development/preview environment only after checking its cost; do not create a billable branch without cost review.
4. Apply the additive migration in preview; verify RLS, grants, indexes, and empty-table behavior.
5. Run Supabase Security and Performance Advisors; resolve any critical/high findings.
6. Promote the same migration to production only after the backup and preview evidence are reviewed.
7. Rollback application behavior by disabling the Worker binding/routes and returning to the prior app version. Keep catalog tables and audit data; do not drop tables as an automatic rollback. If a schema rollback is required, export the new tables first and perform a separately reviewed destructive operation.

## Acceptance gates
- SQL preview creates exactly the three intended tables; no existing table changes.
- RLS is enabled on all three; `anon` and `authenticated` have no privileges; `service_role` has intended backend access.
- Unique idempotency and object/SHA constraints work.
- R2 create-only write rejects overwrites; checksum mismatch is detected; path traversal is rejected.
- No public bucket, public object URL, broker order permissions, or live-trading setting is introduced.

## Current status
- [x] Inspect target project, tables, migrations, and account.
- [x] Draft additive catalog SQL.
- [x] Implement local R2 adapter and unit tests.
- [ ] Run unit tests in a repository runtime.
- [ ] Enable R2 subscription in Cloudflare Dashboard.
- [ ] Create private bucket and bind it to a Worker.
- [ ] Generate formal Supabase migration via CLI.
- [ ] Obtain verified backup and preview validation.
- [ ] Apply production migration after explicit approval.

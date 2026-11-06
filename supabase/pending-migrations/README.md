# Pending Supabase migrations

This directory holds SQL that has **not** been applied to Production and is deliberately excluded from the active `supabase/migrations/` directory.

## NOVA Video Workspace

- Preserved source: `supabase/migrations/202610310001_nova_video_workspace.sql`
- Preserved from main commit: `6e8d390ac45187fb70b6acb23f1e428a20ca7006`
- Production migration ledger maximum: `20261031070311`
- Reason parked: its filename timestamp sorts before the latest already-applied Production migration. Leaving it active would make a clean chronological replay ambiguous.
- Preserved SQL: `nova_video_workspace.sql`

Do not apply this file directly. When the Video integration branch is reconciled, create a fresh timestamped migration using the Supabase CLI command `supabase migration new nova_video_workspace`, move this exact SQL payload into that generated file, update the related CI path filters, then run the isolated full replay and tenant tests. The current Video PR #215 must be rebased/reconciled against the migration-lineage PR before it can proceed.

This is a preservation/ordering change only. No hosted DDL, migration repair, `db push`, branch creation, backup, or Production mutation is authorized by this directory.

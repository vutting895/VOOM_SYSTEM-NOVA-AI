# NOVA Video Supabase Migration Reconciliation

## Verified state (2026-11-05)

- Target Supabase project: `tlyyxufuiimrbaksoitf` (Singapore, existing Free project).
- Production migration history ends at `20261031070311` (`nova_durable_approval_lifecycle`).
- The Production schema has no `nova_video_projects`, `nova_video_jobs`, `nova_video_preparations`, or `nova_video_approval_decisions` tables.
- The Supabase `main` development branch reports `MIGRATIONS_FAILED`.
- No isolated staging database has been verified.
- Repository migration files include older versions `202610300001_nova_durable_approval_lifecycle.sql` and `202610310001_nova_video_workspace.sql`; the remote history has a later `20261031070311` version not represented by a matching local migration file.

The source-level video API must therefore be treated as **not deployable** until the migration ledger and database schema are reconciled. A green GitHub Actions run does not prove database readiness.

## Candidate migration

`supabase/migrations/20261105143000_nova_video_preparation_approval.sql`

The candidate is forward-only and idempotently creates the Video workspace tables when absent, then adds:
- `nova_video_preparations` — one immutable owner-bound Engine plan snapshot per job, including SHA-256 hash and planner version.
- `nova_video_approval_decisions` — one append-only owner decision per preparation, bound to the same snapshot hash.

RLS is enabled on all four Video tables. The authenticated role receives only `SELECT` and `INSERT`; no client `UPDATE` or `DELETE` is granted. Preparation insertion is restricted to the job owner and a `video_generation` job in `blocked_no_free_gpu`. Decision insertion is restricted to the preparation owner and exact snapshot hash. There are no `SECURITY DEFINER` functions in this candidate.

Approval never changes the job status or enables model execution. A job remains `blocked_no_free_gpu`; future execution must independently verify model rights, source/checkpoint integrity, hardware, zero-cost compute evidence, security approval and worker dispatch authorization.\n\n## Additional trust-boundary gate\n\nThe current candidate grants authenticated users direct `INSERT` on preparation and decision tables so that the Worker can write using the same caller bearer token and no service-role secret. RLS enforces owner binding, and the records cannot be changed/deleted by authenticated users, but direct PostgREST callers can still create their own rows without invoking the Worker. The snapshot hash detects accidental or subsequent content changes; it does not attest the producer or prove the Worker created the row. This is acceptable only for a non-executable draft/review lane. Before any generation/worker execution is enabled, introduce a separately trusted write path or a reviewed server signature scheme, revoke direct client insert permissions, and test REST bypass attempts from both tenants. No privileged credential or signing secret is configured for this current source-only milestone.

## Migration safety plan — not executed

1. Obtain the exact authoritative migration source for remote version `20261031070311` and compare it with the repository's local migration history. Do not guess or fabricate a replacement file.
2. Resolve the older pending local migration `202610310001` and the remote/local ordering mismatch through an inspected migration-history reconciliation plan. Do not mark any migration as applied unless the corresponding schema is verified present.
3. Investigate and repair the existing Supabase `main` branch's `MIGRATIONS_FAILED` state. Do not reset or delete the branch as a shortcut.
4. Create or verify an isolated staging database from the reconciled production baseline. The current Free-plan branch state is not accepted as a valid staging proof.
5. Produce an encrypted logical backup of schema and data, back up any Storage objects separately, and restore into a separate isolated database. Validate row counts, constraints, functions, RLS policies, grants and extensions.
6. Review the candidate SQL independently, including composite owner foreign keys, insert policies, unique decision constraints, data retention and rollback.
7. Apply only to isolated staging after review. Test two distinct authenticated users across project, job, preparation and decision read/write paths. Tenant A must receive no rows and no successful writes for Tenant B's resources.
8. Verify API integration from the exact HTTPS frontend origin. Inspect PostgREST grants and Auth token behavior.
9. Present the verified backup/restore, migration diff, SQL review and two-tenant evidence before requesting separate approval for any Production migration.

## Rollback posture

- Do not automatically drop the new tables or data after a failed rollout.
- Stop the API/Worker route first.
- Prefer a forward corrective migration if a schema defect is isolated.
- Restore from the verified backup only if data integrity is compromised and the restore has already been tested.
- Never remove existing `nova_agent_threads` or `nova_approval_requests` objects as part of this Video change.

## Current restriction

No migration was applied. No Production data or schema was changed. No Worker was deployed. This document is a migration plan and candidate review record, not a release approval.

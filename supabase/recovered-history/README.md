# Recovered Supabase migration history

**Purpose:** Preserve the exact SQL statement payloads retained in each project's Supabase migration ledger so missing source SQL can be reviewed and replay-tested without guessing.

## Provenance

- Export source: `supabase_migrations.schema_migrations` (`version`, `name`, `statements`, `rollback`).
- Production runtime project: `tlyyxufuiimrbaksoitf` — 24 applied migration records.
- Staging/candidate project: `rovhmjeowracayicbqij` — 2 applied migration records.
- Extraction date: 2026-10-31.
- Each SQL file contains the recorded `statements` array joined in its original order. The original migration ledger has no rollback statements for these records.

## Critical handling rules

1. This is a **forensic archive**, not an active Supabase CLI migration directory.
2. Do not move these files into `supabase/migrations/`, run `db push`, or apply them to either hosted project as a batch.
3. Production and Staging have distinct histories and must be replayed separately. Do not concatenate the histories or infer that one is a superset of the other.
4. The ledger preserves the exact SQL recorded as applied, but not necessarily the original Git commit, operator context, or any out-of-band SQL changes made after the migration.
5. A successful clean replay still needs a fresh local Supabase environment, a schema-only fingerprint comparison, RLS/grant/function/trigger/index checks, and application contract tests. No hosted database was modified during recovery.
6. Supabase's 2026-10-30 Data API exposure change means public tables are no longer automatically exposed by default. Replay acceptance must explicitly inspect table grants/exposure and must not assume RLS alone enables the Data API.

## Counts

| Environment | Recovered SQL files | Ledger rows |
|---|---:|---:|
| Production runtime | 24 | 24 |
| Staging/candidate | 2 | 2 |
| **Total** | **26** | **26** |

See `manifest.json` for the exact versions, names, paths, statement counts and byte lengths.

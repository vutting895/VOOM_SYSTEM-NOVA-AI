# Production migration SQL recovery archive

**Scope:** Supabase `Voom_system` (`tlyyxufuiimrbaksoitf`) Production migration ledger only. Extracted read-only on 2026-11-06.

This directory contains the exact SQL statement payloads currently stored in `supabase_migrations.schema_migrations.statements[1]` for all 25 Production versions. Each file is written without an added terminal newline. The adjacent `manifest.json` records version, migration name, character count and SHA-256 calculated from the exact UTF-8 SQL payload.

## Critical safety boundary

- This is a **forensic recovery archive**, not an active migration directory.
- Do not copy these files wholesale into `supabase/migrations/` or apply them to a hosted database.
- Do not edit, insert, delete or repair rows in the hosted migration ledger.
- The current active migration filenames contain identity/version collisions. Resolve those through a separate reviewed reconciliation change and disposable clean replay.
- The pending NOVA Video migration is not in this archive because it is not recorded as applied in Production.
- No secret, credential, customer row data or database backup is stored here.

## Verification

SHA-256 fingerprints were computed by PostgreSQL `pgcrypto.digest(..., 'sha256')` over each live statement payload. SQL was read through read-only queries and committed here exactly as returned. After commit, verify every file hash against `manifest.json` before any further use.

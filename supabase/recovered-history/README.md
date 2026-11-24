# Production migration SQL recovery archive

**Scope:** Supabase `Voom_system` (`tlyyxufuiimrbaksoitf`) Production migration ledger only. Extracted read-only on 2026-11-06.

This directory contains the exact SQL statement payloads currently stored in `supabase_migrations.schema_migrations.statements[1]` for all 28 Production versions. Each file is written without an added terminal newline. The adjacent `manifest.json` records version, migration name, character count and SHA-256 calculated from the exact UTF-8 SQL payload.

## Critical safety boundary

- This directory remains the **forensic recovery archive**. PR #284 also restores byte-identical copies of these 28 already-applied Production payloads into `supabase/migrations/` under their original Production version IDs so local history matches the hosted ledger.
- Do not apply these recovered payloads to the hosted database; they are already recorded as applied.
- Do not edit, insert, delete or repair rows in the hosted migration ledger.
- Validate the active copies and archive copies against this manifest, then perform a disposable clean replay before merging.
- The pending NOVA Video migration is not in this archive because it is not recorded as applied in Production.
- No secret, credential, customer row data or database backup is stored here.

## Verification

SHA-256 fingerprints were computed by PostgreSQL `pgcrypto.digest(..., 'sha256')` over each live statement payload. SQL was read through read-only queries and committed here exactly as returned. After commit, verify every file hash against `manifest.json` before any further use.

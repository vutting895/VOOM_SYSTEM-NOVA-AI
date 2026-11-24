# NOVA — Persistent Data Infrastructure Backup & Restore Runbook

**Status:** implementation specification; not evidence of a completed backup or restore  
**Project:** NOVA  
**Supabase project ref:** `tlyyxufuiimrbaksoitf`  
**Database target:** PostgreSQL managed by Supabase  
**Production writes:** prohibited by this runbook

## 1. Scope and isolation

This runbook applies only to **NOVA** and its named Supabase project ref above. Do not reuse credentials, dump files, migration history, manifests, or archive paths from the other VOOM project. The NOVA and Affiliate repositories and databases remain independent.

A logical database dump from Supabase CLI does **not** include Supabase-managed `auth` and `storage` schemas, extension-owned schemas, Storage object bytes, Edge Function source, project secrets, or provider-side settings. Track these as separate recovery domains. Storage objects must be exported separately if buckets are later created. Never put secrets or raw access tokens in the manifest or repository.

## 2. Required tooling and CLI safety

- Use a Linux environment with Python 3.11+.
- Use Supabase CLI v3 and Docker (the CLI runs `pg_dump` in a container).
- Authenticate using the Supabase CLI's secure login flow. Do not paste database passwords, access tokens, service-role keys, or connection URLs into chat, source control, shell history, or logs.
- CLI v3 runs database commands locally unless `--remote` is explicit. Always use the exact project ref on every dump command; inspect the emitted `Target:` line. Never run `db push`, `db reset --remote`, `migration repair`, or any schema-changing command as part of backup.
- Do not use a linked-project default. Do not use `--yes` for any hosted mutation in this workflow.

References: [Supabase CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3), [Backup and restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## 3. Create a logical backup (read/export only)

Set the project ref explicitly in the current shell. Create a private directory outside the repository; do not commit backup files.

```bash
export PROJECT_REF="tlyyxufuiimrbaksoitf"
export PROJECT_NAME="NOVA"
umask 077
export BACKUP_DIR="$HOME/voom-backups/${PROJECT_NAME}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
```

Export roles, schema, and application data separately:

```bash
supabase db dump -f "$BACKUP_DIR/roles.sql" --role-only --remote="${PROJECT_REF}"
supabase db dump -f "$BACKUP_DIR/schema.sql" --remote="${PROJECT_REF}"
supabase db dump -f "$BACKUP_DIR/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes" \
  --remote="${PROJECT_REF}"
```

If migration history is present and needs a portable recovery copy, export it as a paired supplemental artifact. Do not restore it until the source/target migration lineage has been reconciled:

```bash
supabase db dump -f "$BACKUP_DIR/migration-history-schema.sql" \
  --schema supabase_migrations --remote="${PROJECT_REF}"
supabase db dump -f "$BACKUP_DIR/migration-history-data.sql" \
  --use-copy --data-only --schema supabase_migrations --remote="${PROJECT_REF}"
```

The source database's actual migration history must be captured and compared with the repository migration files. A migration list alone is not a backup. Do not infer that a missing or failed migration record means the schema is absent.

## 4. Create and verify the SHA-256 manifest

The helper is offline and does not connect to Supabase. It hashes existing files, rejects empty files, rejects path traversal/symlinks, writes the manifest atomically with owner-only permissions, and refuses to overwrite an existing manifest by default.

```bash
python scripts/pdi_backup_manifest.py create \
  --project "${PROJECT_NAME}" --project-ref "${PROJECT_REF}" \
  --backup-dir "$BACKUP_DIR" \
  --migration-history-schema migration-history-schema.sql \
  --migration-history-data migration-history-data.sql

python scripts/pdi_backup_manifest.py verify \
  --backup-dir "$BACKUP_DIR" \
  --project "${PROJECT_NAME}" --project-ref "${PROJECT_REF}"
```

If migration history was not exported, omit both optional history arguments. The tool requires the history schema and data artifacts as a pair.

Expected integrity result: `BACKUP_INTEGRITY_PASS`. Any mismatch or missing file is a failure. A passing hash check proves only that the local files match their manifest; it does not prove that the dump is complete, that an archive is immutable, or that a restore works.

## 5. Archive handling

1. Keep the working backup outside the Git repository and restrict filesystem permissions.
2. Encrypt the archive before copying it to a separate, access-controlled location. Keep encryption keys separate from the archive.
3. Preserve the manifest with the encrypted archive and verify hashes again after transfer.
4. Record archive provider, object/version identifier, retention policy, encryption status, and independent access test in the recovery evidence.
5. Mark archive immutability as **unverified** unless the destination demonstrably enforces write-once retention or equivalent controls. A normal cloud folder or second disk is not automatically immutable.
6. Do not delete local working copies until the independent copy has been downloaded/read back and verified.

No archive upload or storage provisioning is performed by the helper.

## 6. Restore test — isolated environment only

**Do not restore into this Production project.** Use a disposable local Supabase stack or a separately approved non-Production project. Creating a hosted project/branch can incur cost and requires separate approval.

Before restore:
- Confirm target identity and that it contains no user/production data.
- Confirm PostgreSQL major version and required extensions.
- Verify the manifest and every artifact again.
- Review roles/schema SQL for Supabase-managed role/ownership statements that may need platform-specific handling.
- Do not automatically replay migration history until the target schema and repository migrations have been reconciled.

Supabase documents a manual PSQL restore using a single transaction and `ON_ERROR_STOP`. Adapt only for the isolated target:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/roles.sql" \
  --file "$BACKUP_DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/data.sql" \
  --dbname "$ISOLATED_RESTORE_DB_URL"
```

The restore URL must be supplied through a protected environment/secret mechanism and must point to the isolated target, never Production. Do not put the URL literal in shell history or logs. Migration-history SQL is supplemental and must be applied only after explicit lineage review.

After restore, compare table/row counts, constraints, indexes, RLS enabled state and policies, grants, extensions, representative data checksums, and application-level read paths. Run cross-owner denial tests where applicable. Record the exact isolated target, timestamp, tool versions, command result, and validation evidence.

## 7. Project-specific inventory and current known gaps

This runbook is scoped to project ref `tlyyxufuiimrbaksoitf`. The last read-only inventory found one public table, `affiliate_state_snapshots`, with RLS enabled but no policy and no rows in the snapshot table at that time; no Storage buckets were returned. Re-run the inventory before backup and record its timestamp. Do not assume the state is unchanged.

The database's small size does not reduce the need for backup verification. Empty application tables can still contain schema, constraints, grants, and migration history needed for recovery.

## 8. Release gates

| Gate | Required evidence | Current status |
|---|---|---|
| Database inventory | Timestamped schema/data/RLS/grants/extensions inventory | Pending refresh |
| Logical backup | roles + schema + data exports | Not performed |
| Integrity | manifest and post-transfer SHA-256 verification | Not performed |
| Archive | separate encrypted copy + read-back | Not performed |
| Restore | isolated restore and post-restore validation | Not tested |
| Security | RLS, grants, tenant isolation, secrets/storage review | Blocked |
| Migration lineage | repo migrations reconciled to live ledger/schema | Blocked |
| Release | exact-head CI + independent review | Locked |

**No Production migration, Merge, Deploy, Storage bucket creation, schema write, or data mutation is authorized by this runbook.**

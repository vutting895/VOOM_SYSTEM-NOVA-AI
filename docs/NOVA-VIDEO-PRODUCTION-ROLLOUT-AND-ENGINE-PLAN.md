# NOVA Video — Production Migration, Backup, Rollback & Engine Delivery Plan

Date: 2026-11-05  
Production target: Supabase project `Voom_system` (`tlyyxufuiimrbaksoitf`, ap-southeast-1)  
Repository baseline: `main@6e8d390ac45187fb70b6acb23f1e428a20ca7006`  
Status: **PLAN ONLY — NO MIGRATION, BACKUP, RESTORE, DEPLOYMENT OR PRODUCTION CONFIGURATION HAS BEEN EXECUTED**

## 1. Executive decision

Voom_system is the selected Production database for NOVA Video. Production is not yet ready to receive the Video Workspace migration.

The migration must remain unapplied until all gates in this document have evidence. This plan does not authorize schema changes, branch creation, paid resources, Worker publication, frontend configuration, or production deployment.

## 2. Verified baseline

Read-only inspection on 2026-11-05 found:

- Project `Voom_system` is `ACTIVE_HEALTHY`, Postgres 17.11, region `ap-southeast-1`.
- The applied migration ledger ends at `20261031070311` (`nova_durable_approval_lifecycle`).
- The repository contains `supabase/migrations/202610310001_nova_video_workspace.sql`, but that version is absent from the Production migration ledger.
- The current Production public schema contains 21 tables; all 21 report RLS enabled.
- Neither `public.nova_video_projects` nor `public.nova_video_jobs` currently exists.
- Supabase Branch status reports `MIGRATIONS_FAILED`; the branch listing does not expose the underlying failure log.
- The current NOVA Video Worker PR is metadata-only. Its exact-head CI validates Worker contract behavior and syntax; it does not validate live Supabase RLS or run a real media pipeline.

### Migration ordering / preview blocker

The pending repository migration version `202610310001` is earlier than the latest applied Production version `20261031070311`. The Preview/Branch migration failure has not yet been diagnosed from its deployment log. Do not assume the timestamp is the sole cause and do not work around the failure by applying SQL directly to Production.

Required correction path:

1. Retrieve the actual Supabase Branch deployment log and identify the failing migration and database error.
2. Reconcile repository migration history with the Production ledger and the recovered migration baseline.
3. Produce a corrected, forward-only migration history in a reviewed GitHub PR. Do not rewrite an already-applied migration or fabricate a successful ledger entry.
4. Run clean replay and schema-fingerprint checks against a disposable local PostgreSQL/Supabase environment.
5. Confirm the corrected migration is additive and does not alter existing NOVA tables, policies, roles, or data.

## 3. Backup plan — mandatory before Production migration

The project is on the Free-first posture. Supabase Free does not include automatic daily backups; Supabase documents manual logical exports through the CLI. Do not enable a paid plan, PITR, paid compute, or paid branch to satisfy this gate.

### 3.1 Pre-change backup set

An operator with authorized access must create and securely retain:

1. **Role/privilege export** — role definitions and relevant grants.
2. **Schema export** — database schema, constraints, indexes, policies, functions and triggers.
3. **Data export** — table data with numeric precision preserved.
4. **Storage inventory and object backup** — enumerate buckets and separately export object bytes and metadata needed for recovery. A database dump alone does not back up Storage API object bytes.
5. **Configuration evidence** — Auth URL/provider settings, Data API exposure settings, Edge Function inventory, and non-secret runtime configuration. Never export secret values into GitHub or logs.
6. **Baseline evidence** — migration ledger, table/column/constraint inventory, RLS state, grants, row counts and schema fingerprint.

Use the current Supabase-supported CLI backup workflow (roles, schema and data exports) after checking the installed CLI version and command help. Store encrypted copies outside the Production project in an owner-controlled location. Do not commit backups, connection strings, database passwords, tokens or customer data to this repository.

### 3.2 Backup acceptance

A backup is **not complete** merely because a command exits successfully. Acceptance requires:

- all expected files exist and are non-empty;
- file checksums and timestamps are recorded;
- the export is encrypted at rest and access is restricted;
- a restore has been performed into an isolated, non-production PostgreSQL/Supabase target;
- restored schema, key constraints, RLS/policies, grants and representative row counts match the recorded baseline;
- Storage objects are separately verified;
- restore duration and any omissions are recorded.

No backup or restore is currently claimed. Do not proceed until evidence is attached to the release checklist.

## 4. Migration scope and safety review

The intended Video Workspace schema is additive and metadata-only:

- `nova_video_projects`: owner-scoped project metadata.
- `nova_video_jobs`: owner-scoped job-request metadata.
- owner/time indexes;
- composite project-owner foreign key;
- per-user idempotency uniqueness;
- RLS enabled on both tables;
- authenticated owner-only SELECT/INSERT policies;
- least-privilege grants.

The reviewed SQL currently defines free-only blocked jobs (`execution_mode='free_only'`, `estimated_cost=0`) and has no media binary storage or execution worker.

Before approval, the migration review must verify:

- `auth.uid()` ownership predicates on every policy;
- INSERT `WITH CHECK` prevents owner spoofing;
- no UPDATE/DELETE grant or policy is introduced without a separately reviewed need;
- composite foreign key prevents a job from referencing another user's project;
- idempotency is unique per owner;
- numeric cost remains exactly zero;
- no service-role credential or SECURITY DEFINER bypass is introduced;
- no existing table, column, policy, role, trigger, function or data is dropped or rewritten;
- Data API grants are explicitly reviewed alongside RLS;
- the migration is safe to run once and clean-replay tests pass.

## 5. Production release sequence — gated, not yet authorized

| Gate | Required evidence | Current state |
|---|---|---|
| A. Source review | Current main SHA, migration diff, dependency and history reconciliation | IN PROGRESS |
| B. Migration diagnosis | Supabase Branch deployment log and root cause for `MIGRATIONS_FAILED` | BLOCKED |
| C. Backup | Encrypted role/schema/data + Storage export | NOT DONE |
| D. Restore rehearsal | Successful isolated restore and fingerprint comparison | NOT DONE |
| E. Migration CI | Clean replay, idempotency/constraint/RLS checks | NOT VERIFIED |
| F. Independent security review | Approval of migration, Worker auth, CORS, RLS and tenant boundaries | PENDING |
| G. Two-user staging | User B cannot list, reference or create jobs for User A's project | NOT DONE |
| H. Production authorization | Explicit owner approval after all evidence is reviewed | NOT GRANTED |
| I. Production migration | Apply only the reviewed exact migration SHA | PROHIBITED UNTIL H IS GRANTED |
| J. Post-apply verification | Ledger, tables, constraints, RLS, grants, advisors and API smoke tests | NOT DONE |

A Supabase Preview Branch may incur compute/egress/storage charges. Do not create a branch unless zero-cost eligibility is verified and separately approved. Prefer a disposable local PostgreSQL/Supabase replay for SQL validation where available.

## 6. Rollback plan

### 6.1 Application/API rollback

If a release fails after a future approved deployment:

1. Stop accepting new Video job requests.
2. Disable or roll back the NOVA Video Worker deployment to the last reviewed Worker SHA.
3. Remove/blank the Affiliate proxy's Video API origin configuration and disable the Video UI integration if necessary.
4. Preserve existing project/job metadata and logs for investigation.
5. Verify existing NOVA Trading, Auth, broker read-only and other Production routes remain unaffected.

This rollback does not require dropping database tables.

### 6.2 Database rollback

The preferred database rollback is **forward-safe application disablement**, not destructive DDL:

- Keep the two additive Video tables in place but unused.
- Do not drop tables automatically during rollback.
- If schema reversal is later required, first disable all writers, export the Video rows, verify backup/restore, record row counts and obtain explicit owner approval.
- Only a separately reviewed rollback migration may drop the two newly introduced tables, and only after confirming that no retained data, foreign keys, downstream consumers or audit requirements depend on them.
- Never restore the entire Production database merely to undo this additive feature; full-project restore can discard unrelated writes made after the backup and causes downtime.

### 6.3 Rollback acceptance

Rollback is complete only when the Video API is disabled, no new jobs are accepted, retained metadata is accounted for, existing Production services pass smoke tests, and the incident/change record identifies the exact deployed and database migration versions.

## 7. NOVA-owned AI Video Engine — delivery plan

The current Worker is a control-plane/API slice, not a video engine. The product must be built as NOVA-owned orchestration and processing components rather than a thin wrapper that claims an external provider is NOVA's engine.

### Phase 1 — NOVA Video Control Plane

- typed project, asset, job, model and workflow contracts;
- owner-scoped state machine and idempotent job lifecycle;
- quota and free-only policy enforcement;
- job cancellation, bounded retries, audit events and status callbacks;
- private asset metadata and retention/deletion contracts.

### Phase 2 — CPU-only NOVA Engine vertical slice

- deterministic Video Director that converts a brief into scenes, shots and prompts;
- NOVA-owned workflow planner and validated job graph;
- local/isolated FFmpeg pipeline for safe trim, concat, audio mix, subtitles and export validation;
- PySceneDetect and OCR/transcription adapters only after exact versions, licenses and resource requirements are verified;
- mock worker and reproducible fixture-based end-to-end tests before real media is accepted.

CPU processing must run outside the Cloudflare request handler in a bounded worker runtime. The Cloudflare Worker remains the authenticated control plane and must not attempt long-running media rendering inside a request.

### Phase 3 — Media storage and safety

- private tenant-isolated object storage only after free quota and data-region terms are verified;
- upload size/type/duration checks, checksums, malware/media parser isolation and short-lived download access;
- retention, deletion, audit and abuse controls;
- no public buckets or arbitrary workflow/plugin uploads.

### Phase 4 — Generation and model adapters

- benchmark candidate open models (Wan, LTX-Video, CogVideoX) by exact immutable revision;
- verify code, checkpoint, tokenizer and dataset licenses for the intended use;
- verify truly zero-cost compute, VRAM/RAM/disk, runtime, concurrency, quotas, region and privacy terms;
- if no qualifying free GPU exists, keep Text-to-Video/Image-to-Video blocked; no paid API, trial credits, promotional credits or automatic fallback.

### Phase 5 — Staging and production

- two-user tenant-isolation tests for projects, jobs, assets and downloads;
- end-to-end CPU pipeline tests with inspectable artifacts;
- reproducible model/worker benchmark and zero-cost evidence;
- independent security review and exact-SHA release approval;
- production enablement only after a separate explicit owner authorization.

## 8. Definition of done

NOVA Video is an operational engine only when it can complete a reproducible end-to-end workflow with inspectable output artifacts, owner isolation, private storage, cancellation/retry behavior, deletion verification, safety controls, exact model/workflow versions, verified zero-cost compute and CI evidence for the reviewed SHA.

A catalog entry, successful API response, recorded job, frontend Preview or passing contract test is not proof that video was generated.

## 9. Current decision

- Production target remains `Voom_system`.
- Keep the current migration unapplied.
- Keep Worker URL unpublished and all execution disabled.
- Keep paid APIs, GPU, storage, trial credits, Supabase upgrades and billable branches disabled.
- Continue with migration-history diagnosis, backup/restore runbook evidence and the CPU-only NOVA Engine vertical slice through GitHub PRs only.

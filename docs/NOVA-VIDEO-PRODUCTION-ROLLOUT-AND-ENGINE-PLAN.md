# NOVA Video — Production Migration, Backup, Rollback & Engine Delivery Plan

Date: 2026-11-05  
Production target: Supabase project `Voom_system` (`tlyyxufuiimrbaksoitf`, ap-southeast-1)  
Repository baseline: `main@6e8d390ac45187fb70b6acb23f1e428a20ca7006`  
Status: **PLAN ONLY — NO MIGRATION, BACKUP, RESTORE, DEPLOYMENT OR PRODUCTION CONFIGURATION HAS BEEN EXECUTED**

## 1. Executive decision

Voom_system is the selected Production database for NOVA Video. Production is not yet ready to receive the Video Workspace migration.

The migration must remain unapplied until all gates in this document have evidence. This plan does not authorize schema changes, branch creation, paid resources, Worker publication, frontend configuration, or production deployment.

## 2. Verified baseline (read-only, 2026-11-06)

- Project `Voom_system` (`tlyyxufuiimrbaksoitf`) is `ACTIVE_HEALTHY`, Postgres 17.11, region `ap-southeast-1`.
- Production ledger has 25 rows, from `20261023110233` through `20261031070311`; every row has one recorded SQL statement.
- The public schema still has 21 tables with RLS enabled on all 21; `nova_video_projects` and `nova_video_jobs` are absent.
- Supabase Branch inventory still contains only `main`, whose status is `MIGRATIONS_FAILED`. No NOVA-only Staging branch is available.
- The recorded migration workflow failure remains: `Remote migration versions not found in local migrations directory.`
- No Production schema mutation, migration, backup, restore, branch creation, Worker deployment or environment change was performed during this verification.

### 2.1 Production payload recovery — now verified at the SQL-payload level

The live ledger payloads were hashed inside Production using `pgcrypto.digest(array_to_string(statements, E'\\n'), 'sha256')`. The values below are evidence fingerprints, not secrets.

| Production version | Migration name | SHA-256 of live SQL payload |
|---|---|---|
| 20261023110233 | `voom_system_core_schema` | `0e634ea0bc6dd6043cd9db7605f70f0188fe39bbee91fd89a05bef468dc4a0ae` |
| 20261023110249 | `voom_system_security_hardening` | `94ae6fc4603baa1a5e5f0b20a6672edb6375ec966ef23ad10a7915da6190bab1` |
| 20261023110825 | `voom_auth_roles` | `b2ce88e41c2f0862bc5a8a67e1b617817f463202856084ade0fc86cb6d78c5f5` |
| 20261023122933 | `voom_ai_strategies_registry` | `5639805ec795da59cbb3b31f29e88eead2f5fe7295ec7fa83da689862faf12dd` |
| 20261023122940 | `voom_customer_ai_subscriptions` | `c22695a0a91cd7e2dc184a9e752cfc663c49ad36ead6994760413ec8091816cd` |
| 20261023122947 | `voom_signal_delivery_log` | `e8795a2452043a690d5622d3af5bbd03d6a717ac80f5cc5ad6e2cb70783c026c` |
| 20261023123015 | `voom_customer_marketplace_read_rpcs` | `1710826e621e43b1995effd966f8eeffcea60a7288cc877287b8467fbcfb878d` |
| 20261023123038 | `voom_customer_marketplace_activation_rpcs` | `f9689ff72f69f1f59cec4567efc605155fac5734387e76fda95c14e27f53802b` |
| 20261023123626 | `voom_marketplace_resume_paused_subscription` | `10699029a238c00274bd4b9daaa4591f5a63c7ea5df60fddc09b2b2f7d554fa3` |
| 20261023134347 | `voom_dashboard_readonly_rls_v1` | `0ede75593e628258d0c6fffd4eb76bb67cad50a6d8c704028ddc54b9dfafdf8c` |
| 20261023134425 | `voom_staff_dashboard_read_policies_v2` | `e1f142f77ea225b0eea7f3c16d9e67ed8e30b292ac09be55d1c5d8a36edd499b` |
| 20261023134437 | `voom_signal_delivery_log_deny_client_v1` | `d513f95f538c0139952d8119dfdb3360d06eb619dc21a5aea4226c5b52451ef4` |
| 20261023211000 | `customer_signup_profile_trigger` | `3ca5ff40a60be87b97ad34c152f45a9f07c6ad3878e5790265c96a42c8e01f4d` |
| 20261023211405 | `customer_profiles_select_own_policy` | `51fb19ba19a125afea67de571c4c63ea25d54b8b592366443fee132e548e9bd8` |
| 20261023211417 | `remove_redundant_customer_profile_select_policy` | `3637885404f705e4530956461fcbc155fb91da9ead0d710a5b7dcc8234483829` |
| 20261023213059 | `remove_duplicate_profile_policy_and_index_foreign_keys` | `7c4831fc27783be5f1ac8c61b01ab7bec03671ef1e2cbc455507227cb37b43c0` |
| 20261024121812 | `nova_governance_tables` | `d85d2224d42deadd4de14388d31feb2cc07f631845c7d2958d49192d78aeab88` |
| 20261024121826 | `nova_governance_rls_and_seed` | `20345562c99985198ddd4cf1f8a39fe0790733b731203d1c1b66d3fda704891e` |
| 20261024154354 | `alpaca_oauth` | `13f0c29fa81b88568f204ed91b204b1c9ca82d71489644c187d929e5c80b5747` |
| 20261024231905 | `secure_alpaca_secret_tables` | `80195d9db471e96a763fd460b3faf9af9ccce888f3bc1e23bd327198ce64ef4f` |
| 20261025142554 | `enable_rls_ai_strategies` | `d7b17c47b716c786c2b5e8a94b19a9119b515d596dc8ad77a07f3ae1a4a734c7` |
| 20261025142708 | `index_alpaca_oauth_states_user_id` | `0396569e35c555a2a43e05dfd1fc2839a53b1995f587c7930222225f36188d0a` |
| 20261027160402 | `mt5_customer_connections` | `30fde3da05f90de888d2cf6bb252551ec52102dcc16b0cb8f0bbe5e271addd14` |
| 20261029084244 | `security_definer_marketplace_hardening` | `5b02013f1829d825d486146302280f98b72088c9a0bfb309af0ee670eebe6342` |
| 20261031070311 | `nova_durable_approval_lifecycle` | `7eb494acd6f498cd50e4d52ec06f7c21fe7f8d91ec28afcfb3c8396b804deb3e` |

Reconciliation results against repository history:

1. All 24 Production SQL files in PR #109's forensic archive match the live Production `(version, name)` pairs.
2. Six of those 24 archive files are byte-for-byte equal to the stored SQL payload. The remaining 18 differ only by one archive-side terminal line ending; after removing that one terminal LF/CRLF, their content and SHA-256 match the live payload.
3. The 25th live Production payload, version `20261031070311` / `nova_durable_approval_lifecycle`, is byte-for-byte equal to current-main file `supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql`: 15,377 characters; SHA-256 `7eb494acd6f498cd50e4d52ec06f7c21fe7f8d91ec28afcfb3c8396b804deb3e`.
4. Therefore all 25 live Production SQL payloads now have a verified content source. This is **payload recovery**, not yet a canonical active migration-directory reconciliation or clean-replay acceptance. Do not treat the recovered archive as ready to copy into the active migration directory.

### 2.2 Current active migration-directory mismatches

The current-main `supabase/migrations/` directory still contains five files. Their payload identities are:

| Current active file | Current status against Production |
|---|---|
| `202610240001_alpaca_oauth.sql` | Not byte-identical to the Production file at `20261024154354`. A SQL lexical-token comparison (comments and insignificant whitespace excluded; quoted strings and quoted identifiers preserved; dollar-quoted PL/pgSQL bodies tokenized recursively) produced 301 tokens on each side with identical token streams. This is stronger than a line/whitespace comparison, but it is not a PostgreSQL AST equivalence proof or a clean-replay test. Preserve both source files and retain the migration identity mismatch until parser-aware validation is available. |
| `202610270001_mt5_customer_connections.sql` | Exact SQL payload match for live version `20261027160402`, name `mt5_customer_connections`; active filename version differs. |
| `202610290001_security_definer_marketplace_hardening.sql` | Exact SQL payload match for live version `20261029084244`, name `security_definer_marketplace_hardening`; active filename version differs. |
| `202610300001_nova_durable_approval_lifecycle.sql` | Exact SQL payload match for live version `20261031070311`, name `nova_durable_approval_lifecycle`; active filename version differs. |
| `202610310001_nova_video_workspace.sql` | Pending Video candidate; no matching applied Production ledger row. Its timestamp is older than the latest Production version. |

The mismatch must not be “fixed” by timestamp-only renaming. Four current active files appear to represent already-applied historical content under different filename versions; they could be treated as pending by migration tooling and replayed. The Alpaca file also differs byte-for-byte from the archived Production payload. Build a reviewed canonical mapping, determine the intended disposition of every duplicate/modified active file, preserve historical payloads, and only then run disposable clean-replay/schema-fingerprint validation. Do not edit the hosted migration ledger.

### 2.3 Migration reconciliation — updated gate

PR #109 remains an open Draft based on `a2acfd8ec9b598e6593413549bef760e8f596a72`; it is stale relative to current main `6e8d390ac45187fb70b6acb23f1e428a20ca7006` (previous comparison: 34 commits ahead / 120 behind). Its manifest contains 24 Production rows plus 2 Staging rows for a different project; it does not itself provide the 25th Production ledger identity. The 25th SQL payload is recovered from the current-main durable-approval migration file as described above. Do not merge or retarget PR #109 blindly.

Remaining steps:
1. Create a refreshed reconciliation PR based on the verified current main; retain the old 24+2 archive as forensic-only, with provenance and checksums.
2. Reconcile the 25 original Production version/name/payload identities without rewriting any remote row.
3. Resolve the four active-file identity collisions and the differing Alpaca candidate through a reviewed file-by-file mapping.
4. Determine a forward-only Video migration version greater than `20261031070311`; preserve the original candidate SQL as source evidence and do not apply it yet.
5. Run clean replay and schema fingerprint checks in a disposable local PostgreSQL environment, then inspect Supabase Preview migration logs.
6. Only after those pass, plan a NOVA-only staging target and real two-user isolation tests. Production remains untouched.

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
| A. Source review | Current main SHA and migration inventory | IN PROGRESS |
| B. Migration history recovery | Recover/checksum all 25 applied versions; refresh stale PR #109 | BLOCKED |
| C. Preview diagnosis | Re-run branch migration after history reconciliation and inspect logs | BLOCKED |
| D. Backup | Encrypted role/schema/data + Storage export | NOT DONE |
| E. Restore rehearsal | Successful isolated restore and fingerprint comparison | NOT DONE |
| F. Migration CI | Clean replay, idempotency/constraint/RLS checks | NOT VERIFIED |
| G. Independent security review | Approval of migration, Worker auth, CORS, RLS and tenant boundaries | PENDING |
| H. Two-user staging | User B cannot list, reference or create jobs for User A's project | NOT DONE |
| I. Production authorization | Explicit owner approval after all evidence is reviewed | NOT GRANTED |
| J. Production migration | Apply only the reviewed exact migration SHA | PROHIBITED UNTIL I IS GRANTED |
| K. Post-apply verification | Ledger, tables, constraints, RLS, grants, advisors and API smoke tests | NOT DONE |

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

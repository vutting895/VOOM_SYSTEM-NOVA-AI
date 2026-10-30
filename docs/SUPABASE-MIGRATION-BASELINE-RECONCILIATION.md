# Supabase Migration Baseline Reconciliation

- Reviewed: 2026-10-31
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Repository baseline: `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72`
- Status: **reconciliation required; no schema change authorized by this document**
- Related work: Issue #96 (Deep Research Core), PRs #94, #97, #98, #99 and #108

## 1. Executive finding

The checked-in migration directory and the two reachable Supabase projects do not describe one interchangeable migration history.

Two distinct database histories were observed:

1. The newer NOVA-oriented project has a short applied migration history containing the durable NOVA approval lifecycle and MT5 customer connections. Its current public schema contains those tables plus five older tables.
2. The older `Voom_system` project has a larger 24-entry migration history and contains the Marketplace, customer-profile and strategy objects referenced by the repository's Marketplace hardening migration.

3. **The current deployed configuration points to the older `Voom_system` project.** Netlify site `voomsystem` has a non-secret `NEXT_PUBLIC_SUPABASE_URL` endpoint targeting that project. Cloudflare Workers `voom-system-hub` and `voom-system-nova-ai` also have non-secret `SUPABASE_URL` bindings targeting the same endpoint. Only the endpoint match was recorded; no publishable key, secret binding value or credential was emitted. This is direct configuration evidence that the currently connected frontend and the two inspected Workers share the older project as their runtime Supabase target.

The checked-in repository currently contains only four migration files. This is insufficient evidence to replay the older runtime target's full schema from an empty database. Do not combine migration histories, change migration version records, run `db reset`, or apply a new Research migration until its exact applied SQL and out-of-band objects are reconciled. The newer NOVA-oriented project should be treated as a separate candidate/environment, not assumed to be the database serving the inspected current deployment.

This review used read-only Supabase project, migration, table, extension, policy, grant and PostgreSQL catalog metadata, plus Netlify environment-variable metadata and Cloudflare Worker binding metadata. No DDL, migration, seed, user row, token or secret was created, changed or read.

## 2. Repository migration inventory at the reviewed main SHA

| Checked-in file | Purpose inferred from SQL | Reconciliation note |
|---|---|---|
| `202610240001_alpaca_oauth.sql` | Historical Alpaca OAuth state/connection tables and service-only RPCs | Preserve as historical migration evidence. The Alpaca implementation was retired separately; do not replay it into a new target without an explicit retirement decision. |
| `202610270001_mt5_customer_connections.sql` | Per-user Exness MT5 Demo connection request with owner-scoped SELECT/INSERT policies | Its filename timestamp differs from the applied version observed in both projects. Do not rename after application; record the mapping. |
| `202610290001_security_definer_marketplace_hardening.sql` | Moves Marketplace SECURITY DEFINER implementations into `private` and restores public SECURITY INVOKER wrappers | Depends on Marketplace functions, helper and tables from the older Voom_system schema chain. It is not independently replayable on the newer project. |
| `202610300001_nova_durable_approval_lifecycle.sql` | Owner-scoped durable review threads and expiring approval requests | Its filename timestamp differs from the applied version observed in the newer project. Record the mapping before using CLI history reconciliation. |

There is no checked-in complete bootstrap migration for all legacy tables observed in either database. The migration directory therefore must not be treated as a fresh-install baseline yet.

## 2.1 Forensic source files found in the older repository

A read-only inventory of `vutting895/Voom_system` on its `main` branch found these eight PostgreSQL migration files:

1. `Supabase/migrations/20261023_000001_voom_core.sql`
2. `Supabase/migrations/20261023_000002_voom_system_security_hardening.sql`
3. `Supabase/migrations/20261023_000003_voom_auth_roles.sql`
4. `Supabase/migrations/20261023_000004_ai_marketplace.sql`
5. `Supabase/migrations/20261023_000005_source1_test_registry.sql`
6. `Supabase/migrations/20261024_000001_customer_signup_profile_trigger.sql`
7. `Supabase/migrations/20261024_000002_security_policy_indexes.sql`
8. `Supabase/migrations/20261024_000003_customer_paper_trading.sql`

The older repository is forensic source material only; `VOOM_SYSTEM-NOVA-AI/main` remains the canonical product repository. `Research/MCP_Server/commercial_schema.sql` in the old repository uses SQLite syntax (`PRAGMA`) and must not be treated as a Postgres/Supabase migration.

The `ai_marketplace.sql` file aggregates the DDL for `ai_strategies`, `customer_ai_subscriptions` and `signal_delivery_log`, while the runtime migration history records these as separate migration entries. This is a source mapping, not a one-file-to-one-applied-migration match.

These eight files do not account for all 24 applied runtime migrations. In particular, the separate RPC/read/activation migrations, NOVA governance tables/RLS/seed, Alpaca secret hardening, and later RLS/index changes are not all represented as standalone source files in the old repository's current `main` tree. Further source recovery or reviewed schema extraction is required.

## 3. Observed database histories

### 3.1 Newer NOVA-oriented project

Read-only project metadata reported an active/healthy PostgreSQL 17 project. Its applied migration history contained these two rows:

| Applied migration version | Name |
|---|---|
| `20261030052224` | `nova_durable_approval_lifecycle` |
| `20261030125402` | `mt5_customer_connections` |

The names correspond to two checked-in migration files, but their filename prefixes are not the same as the applied migration versions:

| Repository filename prefix | Applied database version | Name |
|---|---|---|
| `202610300001` | `20261030052224` | `nova_durable_approval_lifecycle` |
| `202610270001` | `20261030125402` | `mt5_customer_connections` |

Do not attempt to make these values match by editing remote migration history. Determine how the migrations were applied and preserve the existing recorded versions.

The public table inventory returned eight tables:

- `nova_agent_threads`
- `nova_approval_requests`
- `broker_connections`
- `user_brokers`
- `ai_strategy_state`
- `video_histories`
- `bot_config`
- `latest_signal`

The last five are legacy-looking tables whose creation source and intended current owner were not identified in the checked-in migration set.

Catalog inspection confirmed:
- `nova_agent_threads` has authenticated owner SELECT and constrained owner INSERT policies.
- `nova_approval_requests` has owner-scoped SELECT; approval transitions use narrow authenticated RPC wrappers and private implementations.
- `broker_connections` has authenticated owner SELECT and constrained pending-request INSERT policies.
- `authenticated` and `anon` roles do not have BYPASSRLS. `service_role` does and must stay server-side.
- The `private` schema exists, but the Marketplace helper and functions checked in the hardening migration do not exist in this project.

The active migration list, public table inventory and catalog function checks are separate pieces of metadata; none alone proves that every object or dependency in every schema has been inventoried.

### 3.2 Older `Voom_system` project

Read-only migration metadata returned 24 applied migrations, including:

- `voom_system_core_schema`
- `voom_system_security_hardening`
- `voom_auth_roles`
- `voom_ai_strategies_registry`
- `voom_customer_ai_subscriptions`
- `voom_signal_delivery_log`
- `voom_customer_marketplace_read_rpcs`
- `voom_customer_marketplace_activation_rpcs`
- `voom_marketplace_resume_paused_subscription`
- `voom_dashboard_readonly_rls_v1`
- `voom_staff_dashboard_read_policies_v2`
- `customer_profiles_select_own_policy`
- `nova_governance_tables`
- `nova_governance_rls_and_seed`
- `alpaca_oauth`
- `secure_alpaca_secret_tables`
- `enable_rls_ai_strategies`
- `index_alpaca_oauth_states_user_id`
- `mt5_customer_connections`
- `security_definer_marketplace_hardening`

The complete 24-row history is available from the project migration inventory; this summary is not a replacement for exporting its exact migration definitions.

### 3.2.1 Applied migration-to-source mapping

The following matrix compares the 24 applied migration names with source files found in the old `Voom_system` repository and the current NOVA repository. A source file listed as “aggregate” contains multiple groups of DDL and is not assumed to be byte-for-byte identical to the applied migration. “Not recovered” means the original SQL is not present in the two inspected repositories' current `main` migration directories; it does not mean the migration did not run.

| Applied runtime migration | Source evidence found | Status / follow-up |
|---|---|---|
| `voom_system_core_schema` | Old repo `20261023_000001_voom_core.sql` | Source found; compare exact applied definition and later alterations. |
| `voom_system_security_hardening` | Old repo `20261023_000002_voom_system_security_hardening.sql` | Source found. |
| `voom_auth_roles` | Old repo `20261023_000003_voom_auth_roles.sql` | Source found. |
| `voom_ai_strategies_registry` | Old repo `20261023_000004_ai_marketplace.sql` | Aggregate source; contains `ai_strategies` DDL alongside two later migration concerns. |
| `voom_customer_ai_subscriptions` | Old repo `20261023_000004_ai_marketplace.sql` | Aggregate source; not a standalone migration file. |
| `voom_signal_delivery_log` | Old repo `20261023_000004_ai_marketplace.sql` | Aggregate source; not a standalone migration file. |
| `voom_customer_marketplace_read_rpcs` | No original SQL file recovered; current function definitions inspected from `pg_get_functiondef` | Current public/private function state is known, but original migration source and chronological changes are not recovered. |
| `voom_customer_marketplace_activation_rpcs` | No original SQL file recovered; current function definitions inspected from `pg_get_functiondef` | Current public/private function state is known, but original migration source and chronological changes are not recovered. |
| `voom_marketplace_resume_paused_subscription` | No original SQL file recovered | Source recovery and catalog/history attribution remain open. |
| `voom_dashboard_readonly_rls_v1` | No original SQL file recovered | RLS policy definitions exist in current catalog; exact migration source not recovered. |
| `voom_staff_dashboard_read_policies_v2` | Old repo has partial role/security source; no exact matching migration file | Current staff policies are visible in catalog; exact migration source not recovered. |
| `voom_signal_delivery_log_deny_client_v1` | No original SQL file recovered | Current deny-client policy is visible in catalog; exact migration source not recovered. |
| `customer_signup_profile_trigger` | Old repo `20261024_000001_customer_signup_profile_trigger.sql` | Source found. |
| `customer_profiles_select_own_policy` | Old repo core SQL contains an owner-read policy, but no exact matching migration file | Later policy transitions need to be reconciled against current catalog. |
| `remove_redundant_customer_profile_select_policy` | No original SQL file recovered | Current catalog does not preserve historical policy sequence; source recovery required. |
| `remove_duplicate_profile_policy_and_index_foreign_keys` | Old repo `20261024_000002_security_policy_indexes.sql` | Likely related aggregate follow-up; verify exact SQL and applied ordering before mapping as equivalent. |
| `nova_governance_tables` | No original SQL file recovered | Current 19-table runtime inventory does not show a separate governance table set under those names; classify as removed/renamed/out-of-band only after schema diff. |
| `nova_governance_rls_and_seed` | No original SQL file recovered | Seed/data and policy history must be recovered or documented as out-of-band; do not replay guessed seed rows. |
| `alpaca_oauth` | Current NOVA repo `supabase/migrations/202610240001_alpaca_oauth.sql` | Source file found in canonical repo; compare against runtime definition/version. Keep only as historical provenance after Alpaca retirement. |
| `secure_alpaca_secret_tables` | No exact follow-up source file recovered | Current `alpaca_connections` / `alpaca_oauth_states` structures and deny-client policy exist; exact hardening migration SQL remains missing. |
| `enable_rls_ai_strategies` | Old repo marketplace aggregate enables RLS and revokes browser grants | Partial source coverage; exact applied migration body not recovered. |
| `index_alpaca_oauth_states_user_id` | No original SQL file recovered | Current index definition can be inspected, but original migration source remains missing. |
| `mt5_customer_connections` | Current NOVA repo `supabase/migrations/202610270001_mt5_customer_connections.sql` | Source file found; applied runtime version `20261027160402` differs from filename prefix. |
| `security_definer_marketplace_hardening` | Current NOVA repo `supabase/migrations/202610290001_security_definer_marketplace_hardening.sql` | Source file found; applied runtime version `20261029084244` differs from filename prefix. |

Read-only function catalog inspection recovered the current definitions for `private.is_active_staff`, the four private Marketplace implementation functions and their four public wrappers, plus `public.voom_handle_new_auth_user`. The public Marketplace functions currently report `SECURITY INVOKER`; the private implementation functions report `SECURITY DEFINER`. This describes current catalog state only, not the original SQL or the exact chronology of the applied migrations.



Catalog inspection in this older project confirmed the existence of the Marketplace public wrappers, private implementation functions, `private.is_active_staff()`, `public.ai_strategies` and `public.customer_profiles` referenced by `202610290001_security_definer_marketplace_hardening.sql`.

This explains why the Marketplace hardening migration's dependencies were absent in the newer project's catalog but present in the older project's catalog. The deployment-configuration check further confirms that the older project is the current runtime target for the inspected Netlify and Cloudflare resources. This is not a claim that it is ready for schema replay or that a future migration/cutover cannot select a new project.

### 3.3 Runtime configuration and schema alignment

Read-only deployment-configuration inspection found the same non-secret Supabase endpoint target in all three inspected resources:

- Netlify site `voomsystem`: `NEXT_PUBLIC_SUPABASE_URL` (context `all`).
- Cloudflare Worker `voom-system-hub`: `SUPABASE_URL` binding.
- Cloudflare Worker `voom-system-nova-ai`: `SUPABASE_URL` binding.

All three matched the older `Voom_system` project. No publishable key value or secret binding value was emitted or copied.

Catalog inspection of that runtime project found 19 public tables. The following are present: `customer_profiles`, `ai_strategies`, `customer_ai_subscriptions`, `signal_delivery_log`, `broker_connections`, `alpaca_connections`, `alpaca_oauth_states`, `trading_sessions`, `strategy_signals`, `backtest_runs`, `strategy_versions`, `learning_events`, `quality_gate_configs`, `quality_gate_results`, `risk_guard_decisions`, `security_events`, `mcp_tool_audit`, `system_controls` and `system_heartbeats`.

The same catalog checks returned these objects as absent:

- `public.nova_agent_threads`
- `public.nova_approval_requests`
- `public.paper_orders`

This creates a verified schema/configuration mismatch for the durable NOVA approval feature: `VOOM_SYSTEM-NOVA-AI/main` contains frontend API routes under `frontend/app/api/agent/threads/**` and approval routes that query `nova_agent_threads` / `nova_approval_requests` and invoke `nova_create_approval` / `nova_resolve_approval`. The durable approval migration is applied to the separate newer NOVA-oriented project, but not to the older `Voom_system` project currently named by all three inspected endpoint bindings.

The old repository contains a `customer_paper_trading` migration for `paper_orders`, but the runtime catalog reports that table absent and the 24-row runtime migration history has no matching `paper_orders` migration name. Do not replay that SQL automatically; classify whether it was never applied or was later retired.

Important deployment qualification: the Netlify deploy metadata inspected during this review identified the currently published deploy record as a PR #89 Deploy Preview (commit `37502c0448c9ea955f60ff529c304f3571ea2c48`), not an exact `main` production commit. Therefore this document records endpoint configuration and schema mismatch evidence, but does not claim that the latest `main` approval routes are currently served or that a public endpoint smoke test has failed.

Decision: treat `Voom_system` as the current configured runtime database baseline for reconciliation. Treat the newer NOVA-oriented Supabase project as a separate candidate/environment until a reviewed migration and cutover process says otherwise. Do not switch endpoint bindings or apply the approval migration to the old runtime project as part of this documentation change.


## 4. Supabase test and security observations

For the newer NOVA-oriented project:

- `pgcrypto` was installed.
- `supabase_vault` was installed (extension version `0.3.1`).
- `pgtap` was available in the extension catalogue but had no installed version. It was not enabled during this review.
- Supabase Security Advisor reported five tables with RLS enabled but no policies: `ai_strategy_state`, `bot_config`, `latest_signal`, `user_brokers` and `video_histories`.
- Catalog grant inspection also showed existing table grants to `anon` and `authenticated` for these five tables. With RLS enabled and no applicable policies, reads/writes are denied by RLS, but broad grants still represent unnecessary exposed surface and need a separate ownership/usage review before least-privilege revocation.
- Performance Advisor identified the composite foreign key `nova_approval_owner_thread_fk` without a covering index. This is a performance follow-up, not evidence of an authorization bypass.

No blanket policies should be added to silence the RLS advisor. Each legacy table must first be classified as active, server-only, retired or belonging to a different project. Any grant/policy repair should preserve the deny-by-default behavior and be covered by allow/deny tests.

## 5. Required decisions before creating the Evidence Ledger migration

### Gate A — Confirm the runtime target and classify the future target

Current endpoint configuration identifies the older `Voom_system` project as the runtime Supabase target for the inspected Netlify site and Cloudflare Hub/NOVA Workers. Use it as the baseline for current-runtime reconciliation. This does not establish that the inspected deployment is the latest `main` commit: the available Netlify deploy metadata was for a PR #89 Deploy Preview.

The decision record must still state:
- whether `Voom_system` is intended to remain the long-term production database or only the current runtime/rollback baseline;
- whether the newer NOVA-oriented project is a staging candidate, future replacement or retained experiment;
- which customer records, services and broker routes must be preserved during any migration;
- whether current Netlify and Cloudflare bindings remain on `Voom_system` until a separately approved cutover;
- who owns final migration approval.

### Gate B — Produce schema and migration evidence

For each project that must be retained:
1. Export a schema-only snapshot, including tables, views, functions, triggers, policies, grants, extensions and storage policies.
2. Export the exact applied migration history and obtain the source SQL for every applied migration, including migrations absent from this repository.
3. Compare the snapshot with a clean local database and the repository's current migration files.
4. Classify every discrepancy as missing migration, intentionally out-of-band change, project-specific object, legacy object or retired object.
5. Preserve a restorable backup/rollback reference before any schema repair.
6. Record the file-prefix-to-applied-version mapping for the two migrations whose names match but timestamps differ.

### Gate C — Establish local/staging replay

- Add/restore the correct Supabase CLI and project configuration in an isolated clean workspace.
- Do not use the existing Windows checkout at `C:\Program Files\voom_system` as the migration workspace until its modified/untracked files are safely preserved and a clean checkout is prepared. That working copy was observed on `cloudflare-cutover-wip` with many modified and untracked files; it was not changed during this review.
- Recreate the intended schema from the reconciled migration set in local Supabase or a dedicated staging project.
- Run migration replay from a clean database, pgTAP structural tests, security advisors and application contract tests.
- Test authenticated owner allow, foreign-owner deny, anonymous deny, service-role server-only behavior, update/reassignment denial, and artifact-key ownership.
- Record exact command/tool outputs, project/environment, commit SHA and migration versions.

### Gate D — Build Research persistence only after A–C

Use the existing NOVA owner model first:
- `owner_user_id` is derived from the authenticated Supabase session / trusted Hub context.
- A client/model-supplied owner or tenant ID is never an authorization input.
- `tenant_id`, if retained as metadata, is server-authored by the trusted Hub. It does not widen access until an actual tenant-membership model and cross-tenant tests exist.
- Keep evidence, sources, claims, hypotheses, experiment manifests and artifact references owner-scoped.
- Store source snapshots and experiment artifacts by immutable content hash; enforce owner authorization before returning an artifact.
- Do not store broker credentials, bridge tokens, Vault plaintext, raw Authorization headers or private query credentials in Research records.
- Keep source-fetch SSRF enforcement in a dedicated adapter; URL shape validation alone is not network authorization.
- Research approval remains separate from paper/shadow promotion, broker connection and order execution.

## 6. Proposed pgTAP acceptance matrix

Tests must run in a transaction and roll back test fixtures. Use synthetic IDs and no production customer rows.

| Test identity | Operation | Expected result |
|---|---|---|
| User A | Create research task with trusted owner A | Allowed |
| User A | Read task/source/evidence/artifact owned by A | Allowed |
| User B | Read task/source/evidence/artifact owned by A | Denied / not found |
| Anonymous | Read private Research rows | Denied |
| User A | Insert or update row with owner B | Denied |
| User A | Supply model-generated `tenant_id` not assigned by Hub | Ignored/rejected; never broadens access |
| Server worker with server-only role | Persist validated snapshot for authorized owner | Allowed only through constrained service path |
| Research worker | Read broker credential or Vault plaintext | No route/API exists; denied by architecture |

The tests should also assert:
- RLS is enabled on every table in an exposed schema;
- exposed roles receive only required table/function privileges;
- no public/anon EXECUTE path reaches SECURITY DEFINER internals;
- all private implementation functions have explicit grants and fixed safe search paths;
- duplicate idempotency keys do not create duplicate research tasks or snapshots;
- artifacts are not downloadable by guessing an object key;
- retention/deletion semantics are explicit and do not silently mutate an immutable snapshot.

## 7. Non-goals and safety boundaries

This reconciliation document does not:
- select a canonical Supabase project on the user's behalf;
- change any remote migration history or database schema;
- install pgTAP in a remote database;
- create buckets, queues, functions, users, tenant records or secrets;
- authorize a production deployment;
- enable broker writes, order submission or live trading.

Exness Demo remains read-only. Order Submission and Live Trading remain OFF.

## 8. Exit criteria

The migration baseline is ready only when:
- the canonical target project and environment are explicitly recorded;
- the complete schema snapshot and exact migration history have been preserved;
- every applied migration has a reviewed source or a documented out-of-band classification;
- a clean local/staging database replays the canonical migration set successfully;
- RLS, grants, functions and storage policies pass the owner/foreign-owner/anonymous test matrix;
- the baseline commit and rollback reference are recorded;
- the Evidence Ledger schema is then introduced in a separate focused migration and PR.

Until all exit criteria are evidenced, the Evidence Ledger database milestone remains **blocked**, not done.

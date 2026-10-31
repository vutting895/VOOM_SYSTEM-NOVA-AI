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

The same catalog inspection reported the four private Marketplace implementation functions as `SECURITY DEFINER` and the four public API wrappers as `SECURITY INVOKER`. The current private implementations include owner/role checks for active customers and per-user subscription/session scoping. The inspected public trigger helper `voom_handle_new_auth_user` is `SECURITY DEFINER`. The currently visible public-table triggers include timestamp updates for `customer_profiles`, `trading_sessions` and `broker_connections`, plus the `strategy_versions_immutable` trigger. Treat these as current catalog observations only; verify exact grants, trigger bodies and function `search_path` settings from a complete schema export before replay.



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


### 3.4 Current runtime public-table schema fingerprint (read-only)

The `list_tables(verbose=true)` catalog inventory returned 19 public tables. All 19 report RLS enabled. The following is a compact metadata fingerprint (table/column count/primary key/foreign-key relationships); relationships can include incoming or outgoing references as surfaced by the catalog inventory. It does not include customer rows or column values and is not a substitute for schema-only SQL export.

| Public table | Columns | Primary key | FK-related tables (incoming/outgoing) | RLS |
|---|---:|---|---|---|
| `customer_profiles` | 6 | `user_id` | `auth.users` | enabled |
| `trading_sessions` | 11 | `id` | `auth.users`, `trading_sessions`, `strategy_signals`, `customer_ai_subscriptions` | enabled |
| `strategy_signals` | 14 | `id` | `auth.users`, `trading_sessions`, `signal_delivery_log`, `risk_guard_decisions` | enabled |
| `risk_guard_decisions` | 7 | `id` | `auth.users`, `strategy_signals` | enabled |
| `security_events` | 12 | `id` | `auth.users` | enabled |
| `system_heartbeats` | 4 | `component` | none | enabled |
| `ai_strategies` | 18 | `id` | `auth.users`, `customer_ai_subscriptions`, `strategy_versions`, `learning_events` | enabled |
| `customer_ai_subscriptions` | 10 | `id` | `auth.users`, `ai_strategies`, `trading_sessions`, `signal_delivery_log` | enabled |
| `signal_delivery_log` | 9 | `id` | `strategy_signals`, `customer_ai_subscriptions` | enabled |
| `strategy_versions` | 11 | `id` | `ai_strategies`, `backtest_runs`, `learning_events`, `quality_gate_results`, self-reference | enabled |
| `backtest_runs` | 16 | `id` | `strategy_versions` | enabled |
| `quality_gate_configs` | 6 | `id` | `quality_gate_results` | enabled |
| `quality_gate_results` | 9 | `id` | `strategy_versions`, `quality_gate_configs` | enabled |
| `learning_events` | 7 | `id` | `strategy_versions`, `ai_strategies` | enabled |
| `mcp_tool_audit` | 9 | `id` | `auth.users` | enabled |
| `system_controls` | 4 | `key` | `auth.users` | enabled |
| `alpaca_oauth_states` | 4 | `state_hash` | `auth.users` | enabled |
| `alpaca_connections` | 5 | `user_id` | `auth.users` | enabled |
| `broker_connections` | 10 | `id` | `auth.users` | enabled |

The observed public policy inventory includes owner-scoped reads/updates for selected customer rows, staff-only reads for control/audit/research tables, explicit browser-deny policies for Alpaca state/connection tables and signal-delivery logs, and owner-scoped pending-request policies for `broker_connections`. RLS enabled on all tables must not be mistaken for complete isolation: table grants, policy predicates, SECURITY DEFINER functions, views and Storage policies still require a full schema/security export and allow/deny testing.

A grouped `information_schema.role_table_grants` inspection found legacy grants that should be reviewed separately from RLS policy correctness:

- `anon` retains `SELECT` (and metadata privileges such as `REFERENCES`, `TRIGGER`, `TRUNCATE`) on `customer_profiles`, `strategy_signals` and `trading_sessions`; their current SELECT policies are scoped to `authenticated`, so these grants alone do not establish anonymous row visibility.
- `anon` and `authenticated` retain broad table privileges on `alpaca_connections` and `alpaca_oauth_states`, but explicit `ALL` deny policies apply to both browser roles. The policies are fail-closed; the grants are still unnecessary surface and should be reduced after checking any remaining consumers.
- Most research, audit, gate and control tables grant authenticated SELECT only with staff-only policies. `broker_connections` grants authenticated SELECT/INSERT, constrained by owner and pending-only policies.
- `service_role` has BYPASSRLS at the role level and must remain server-only; its table privileges should be treated as privileged backend capability, not a browser permission.

No anonymous data read was performed. A policy-denied operation was not simulated against customer rows. Recommended next security migration: explicitly REVOKE obsolete browser grants and re-GRANT only the required operations, without adding permissive policies; test owner allow, foreign-owner deny and anonymous deny in staging first.

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


## 9. M0.1 source recovery log — 2026-10-31

This section extends the existing reconciliation record in-place. It does not create a new migration baseline, PR, tracker or automation.

### 9.1 Repositories and refs inspected

| Repository/ref | Commit/tree SHA | Result |
|---|---|---|
| `vutting895/VOOM_SYSTEM-NOVA-AI` `main` | `a2acfd8ec9b598e6593413549bef760e8f596a72` | Four checked-in SQL migration files under `supabase/migrations/`. |
| `vutting895/Voom_system` `main` | `188d060bb4f28557603c6f448dc680b1ee5ca8f6` | Eight SQL files under `Supabase/migrations/`. |
| Old repo `feature/ai-learning-engine-architecture` | `dc21a9857c2ba4ce79d6c80551d276bb2a871c7e` | Same eight SQL files; no additional historical migration source found. |
| Old repo `fix-main-b3dbc0b0063b` | `ac8bfd778708b37c80cb208c5999179830809746` | Seven SQL files; no additional source beyond the common set. |
| Old repo `base44/setup-9fe2f052` | `a41dddaf02071ade90318247befdf2a28bfe9b64` | Seven SQL files; no additional source beyond the common set. |

The old repository's checked-in migration files were read directly. Blob SHA values below identify the exact Git objects inspected. They prove source-file identity, not byte-for-byte equality with the SQL originally applied to the remote database.

### 9.2 Old repository source manifest

| Source file | Blob SHA | Applied-ledger mapping / disposition |
|---|---|---|
| [`20261023_000001_voom_core.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261023_000001_voom_core.sql) | `1bacf7e8a781c0a946e8376511b0c81d48e17628` | Candidate source for `voom_system_core_schema`; exact applied body and later alterations still need comparison. |
| [`20261023_000002_voom_system_security_hardening.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261023_000002_voom_system_security_hardening.sql) | `207f92d639e365a0a09fe76fed050eb3a62258d5` | Candidate source for `voom_system_security_hardening`; verify applied body. |
| [`20261023_000003_voom_auth_roles.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261023_000003_voom_auth_roles.sql) | `c879b328437a84dc9cc1e00510feebaa648fd4ba` | Candidate source for `voom_auth_roles`; verify applied body. |
| [`20261023_000004_ai_marketplace.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261023_000004_ai_marketplace.sql) | `2b5670b3b7a8e159065c595c49a7f6d0c8e453d1` | Aggregate candidate for `voom_ai_strategies_registry`, `voom_customer_ai_subscriptions`, and `voom_signal_delivery_log`; not a one-file/one-migration equivalence. |
| [`20261023_000005_source1_test_registry.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261023_000005_source1_test_registry.sql) | `15a78ce5675335c6e2126fe9d3be76cf392bc2c0` | Auxiliary seed/registry file; no matching name in the 24-row older Production ledger. Do not infer it was applied. |
| [`20261024_000001_customer_signup_profile_trigger.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261024_000001_customer_signup_profile_trigger.sql) | `7707801cb9f73fb30e8b7d2958f2d3a62fbb1184` | Candidate source for `customer_signup_profile_trigger`; verify applied body and trigger history. |
| [`20261024_000002_security_policy_indexes.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261024_000002_security_policy_indexes.sql) | `bb208bcfca686a8ccf5b2f714ce28c6fe7e3239b` | Aggregate/partial candidate for `remove_duplicate_profile_policy_and_index_foreign_keys`; also contains policy/grant/index changes that need exact migration attribution. |
| [`20261024_000003_customer_paper_trading.sql`](https://github.com/vutting895/Voom_system/blob/main/Supabase/migrations/20261024_000003_customer_paper_trading.sql) | `cdb090f136d5dd801f337b25753d7db01e901d16` | Auxiliary paper-orders migration, added in later old-repo history; no matching name in the 24-row older Production ledger. Do not infer it was applied or replay it. |

### 9.3 Canonical NOVA repository migration manifest

| Canonical file | Blob SHA on reviewed `main` | Runtime ledger observation |
|---|---|---|
| [`202610240001_alpaca_oauth.sql`](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/blob/main/supabase/migrations/202610240001_alpaca_oauth.sql) | `86deecba8cdbac633b4402f47382f0aeba8ad165` | Older Production ledger contains `alpaca_oauth`; source body still needs comparison. |
| [`202610270001_mt5_customer_connections.sql`](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/blob/main/supabase/migrations/202610270001_mt5_customer_connections.sql) | `2bd91023da515d0c6aa4e139e714828f6f47b639` | Older Production applied version `20261027160402`; newer NOVA/Staging applied version `20261030125402`. Filename prefix is not the recorded applied version. |
| [`202610290001_security_definer_marketplace_hardening.sql`](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/blob/main/supabase/migrations/202610290001_security_definer_marketplace_hardening.sql) | `c14be5891252f6a247ccdfb3cd6cf6e7af955663` | Older Production applied version `20261029084244`; depends on Marketplace objects in the older project. |
| [`202610300001_nova_durable_approval_lifecycle.sql`](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/blob/main/supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql) | `0d793079e23dfea2ba8f2cbe1c65b85ad8128e06` | Applied in newer NOVA/Staging as `20261030052224`; absent from older Production's 24-row ledger. PR #67 remains the mandatory regression dependency. |

### 9.4 Applied Production migration source-coverage disposition

The 24-row older Production ledger is classified as follows. “Candidate source” means a plausible checked-in source file was located; it does not mean equivalence to the applied SQL has been proven.

| Applied migration name | Current source disposition |
|---|---|
| `voom_system_core_schema` | Candidate source found: old repo core SQL. |
| `voom_system_security_hardening` | Candidate source found: old repo security-hardening SQL. |
| `voom_auth_roles` | Candidate source found: old repo auth-roles SQL. |
| `voom_ai_strategies_registry` | Aggregate candidate: old repo AI marketplace SQL. |
| `voom_customer_ai_subscriptions` | Aggregate candidate: same AI marketplace SQL. |
| `voom_signal_delivery_log` | Aggregate candidate: same AI marketplace SQL. |
| `voom_customer_marketplace_read_rpcs` | Not recovered as original migration SQL; current function catalog is not a historical source substitute. |
| `voom_customer_marketplace_activation_rpcs` | Not recovered as original migration SQL; current function catalog is not a historical source substitute. |
| `voom_marketplace_resume_paused_subscription` | Not recovered. |
| `voom_dashboard_readonly_rls_v1` | Not recovered as original migration SQL; current policy catalog is not a historical source substitute. |
| `voom_staff_dashboard_read_policies_v2` | Partial role/security evidence only; exact migration source not recovered. |
| `voom_signal_delivery_log_deny_client_v1` | Not recovered as original migration SQL; current policy catalog is not a historical source substitute. |
| `customer_signup_profile_trigger` | Candidate source found: old repo signup-trigger SQL. |
| `customer_profiles_select_own_policy` | Partial policy evidence in old repo core SQL; exact migration source not recovered. |
| `remove_redundant_customer_profile_select_policy` | Not recovered. |
| `remove_duplicate_profile_policy_and_index_foreign_keys` | Aggregate/partial candidate: old repo security-policy-indexes SQL; exact applied body/order not proven. |
| `nova_governance_tables` | Not recovered. |
| `nova_governance_rls_and_seed` | Not recovered; seed contents must not be reconstructed by guesswork. |
| `alpaca_oauth` | Candidate source found in canonical NOVA repo; exact applied body still needs comparison. |
| `secure_alpaca_secret_tables` | Not recovered as a distinct hardening migration. |
| `enable_rls_ai_strategies` | Partial evidence in old repo AI marketplace SQL; exact applied migration body not recovered. |
| `index_alpaca_oauth_states_user_id` | Not recovered. |
| `mt5_customer_connections` | Candidate source found in canonical NOVA repo; applied version differs from filename prefix. |
| `security_definer_marketplace_hardening` | Candidate source found in canonical NOVA repo; applied version differs from filename prefix. |

**Coverage count for the older Production ledger:** 7 rows have a direct candidate source file, 7 rows have only aggregate/partial source evidence, and 10 rows have no original migration source recovered. These are source-discovery counts, not migration-equivalence or replay-readiness counts.

The old repository's `source1_test_registry` and `customer_paper_trading` files are explicitly outside the named 24-row Production ledger mapping. The newer NOVA/Staging approval migration is a separate project/version mapping and must not be silently inserted into the older Production history.

### 9.5 M0.1 exit status and next evidence required

- [x] Re-inspected canonical `main` SHA and all four current migration files.
- [x] Inspected old repository `main` and three available branch trees; no additional SQL migration files were found beyond the eight-file source set.
- [x] Retrieved the eight old-repository SQL source files and recorded their blob SHAs.
- [x] Mapped all 24 older Production ledger names to source availability/disposition.
- [ ] Recover the original SQL for the 10 missing migrations from Git commit history, Supabase migration artifacts/backups or owner-controlled archives.
- [ ] Obtain authoritative applied SQL or a schema-only export with functions, triggers, policies, grants and extensions; compare candidate files to the actual applied definitions.
- [ ] Resolve the 7 aggregate/partial mappings and prove migration ordering/chronology.
- [ ] Preserve evidence for out-of-band changes and distinguish them from applied migration effects.

**M0.1 disposition: PARTIALLY COMPLETE — source discovery and mapping inventory recorded; original SQL recovery and equivalence verification remain open.** No hosted database writes, migration repair/reset, project/branch creation, secret reads or deployments were performed in this work.


## 8. M0.1 recovery result — exact applied SQL recovered (2026-10-31)

The earlier source-recovery gap is now closed at the **applied-ledger SQL** level. The Supabase migration ledger stores the SQL statement payloads in `supabase_migrations.schema_migrations.statements`; this field was present in both inspected projects and was read without changing either database.

- Production runtime project `tlyyxufuiimrbaksoitf`: **24/24** applied migration records exported, each with one recorded SQL statement.
- Staging/candidate project `rovhmjeowracayicbqij`: **2/2** applied migration records exported, each with one recorded SQL statement.
- Total: **26 exact ledger SQL files** archived under `supabase/recovered-history/{production,staging}/`.
- `supabase/recovered-history/manifest.json` records version, name, source project, path, statement count and byte length.
- The recovered ledger records have no rollback statements.

This supersedes the earlier count of ten missing original SQL sources: all eleven rows previously marked “not recovered” or only partially sourced now have their exact applied SQL payload recovered from the database ledger. The eight SQL files in the old `Voom_system` repository were compared against the ledger and none is byte/whitespace-normalized equivalent to an applied production statement; they remain historical context, not replay authority. In the canonical NOVA repository, the MT5 connection and Marketplace hardening migrations exactly match their applied ledger payloads; the NOVA approval migration exactly matches the Staging ledger payload. The Alpaca migration needs a separate content reconciliation.

**Important distinction:** a SQL payload recovered from the applied ledger is the exact statement recorded by Supabase, but is not proof of the original Git commit or of later out-of-band SQL changes. The archive is deliberately outside `supabase/migrations/` and must not be applied to either hosted project.

### 8.1 Current clean-replay validation

A new PR-only, secretless local replay workflow is being added. It starts a disposable local Supabase stack for each environment, replays the corresponding recovered SQL files in timestamp order, and runs catalog assertions. Production and Staging histories are tested separately; the Staging replay bootstraps `extensions.pgcrypto` because the approval migration calls `extensions.digest`.

Acceptance assertions:
- Production: all 19 expected public tables exist, each has RLS enabled, all 24 migration records replay, and critical Marketplace RPCs/functions exist.
- Staging: the approval, thread and MT5 tables exist with RLS; both recorded migrations replay; approval RPCs and `extensions.digest` exist.
- No hosted project, migration history, customer row or secret is changed or used by this workflow.

A passing replay validates the archived migration sequences in a clean local Supabase environment. It does **not** by itself prove the hosted schemas are equivalent.

### 8.2 Remaining environment parity facts (not to be papered over)

- Production currently has 19 public tables and 24 migration records.
- Staging currently has 8 public tables and 2 migration records. Only three of those tables (`nova_agent_threads`, `nova_approval_requests`, `broker_connections`) are produced by its two recorded migrations. Five legacy tables (`user_brokers`, `ai_strategy_state`, `video_histories`, `bot_config`, `latest_signal`) have no source in the two-row Staging ledger and must be classified as out-of-band/legacy before any parity claim.
- Production has Marketplace, customer profile, governance and broker schema but lacks `nova_agent_threads` and `nova_approval_requests`; Staging has those approval tables but does not have the Production Marketplace/customer schema.
- Therefore neither current hosted project is a complete superset of the other. Do not reset Staging, merge migration histories, or apply the Production archive to Staging as-is. A reviewed target baseline/cutover migration plan is still required after local replay and catalog comparison.
- Supabase's 2026-10-30 Data API exposure change means newly created public tables are not automatically exposed to Data/GraphQL APIs. Any future additive migration must explicitly validate API exposure/grants separately from RLS.

### 8.3 Current P0 gate

| Gate | Status |
|---|---|
| Recover missing applied SQL | **Complete — 26/26 ledger statements archived** |
| Reconcile Production and Staging migration provenance | **Complete at ledger level; Staging's five untracked legacy tables remain classified as out-of-band candidates** |
| Clean local Supabase replay | **Complete** — 24/24 Production + 2/2 Staging replayed in disposable local Supabase; run #41175375858 passed |
| Production schema-only equivalence against hosted catalog | **In progress** — full 9-category catalog fingerprint comparison is running in #41175729533; Staging's five untracked legacy tables remain excluded from replay equivalence |
| Candidate forward baseline (Production history + NOVA approval) | **Locally validated** — run #41175585645 passed 25-migration / 21-table / RLS / policy / RPC / grant assertions; hosted application still requires explicit approval |

No hosted DDL, migration repair, reset, data write, project/branch creation, deployment or broker write was performed.


### 8.4 Refreshed hosted catalog fingerprints (read-only)

The two projects were queried independently through PostgreSQL catalogs. Counts below exclude customer row values:

| Catalog object | Production | Staging |
|---|---:|---:|
| Public tables | 19 | 8 |
| Public columns | 171 | 72 |
| RLS-enabled public tables | 19 | 8 |
| FORCE RLS tables | 0 | 0 |
| Public RLS policies | 21 | 5 |
| Public indexes | 60 | 17 |
| Public constraints | 89 | 31 |
| Public non-internal triggers | 4 | 2 |
| Functions in public/private | 15 | 8 |
| SECURITY DEFINER functions in public/private | 8 | 4 |
| Applied migration rows | 24 | 2 |

Extensions also differ: Production has `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`; Staging additionally has `hypopg` and `index_advisor`.

**Grant/RLS caution:** table-level grants and row-level policies are separate controls. The catalog shows table grants to `anon` on five public tables in each environment, while RLS is enabled on every public table. In Staging, the five legacy tables have no explicit public RLS policies (default-deny under RLS), but broad table grants remain and must be reviewed before Data API exposure. In Production, the two Alpaca tables have explicit browser-deny policies; other anonymous grants are not themselves proof of readable rows. The Oct 30 Data API exposure default is a third, separate platform control and must be verified in the target project settings.

These fingerprints are now the comparison baseline; do not claim schema parity from table names or migration counts alone.


### 8.5 Forward target replay: Production baseline + NOVA approval migration

A third clean-replay lane is being added to test the proposed additive target: all 24 recovered Production migrations followed by the canonical repository migration `supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql`. That approval SQL is byte-equivalent to the Staging ledger's recorded `nova_durable_approval_lifecycle` statement. The test expects 21 public tables, RLS on all 21, 25 local migration records, three approval policies, `extensions.digest`, least-privilege RPC grants, and SECURITY INVOKER public wrappers over SECURITY DEFINER private implementations.

This is a **local forward-replay proof only**. If it passes, it supports a candidate migration path for Production; it does not authorize or perform applying the migration to Production, changing the Staging project, or claiming hosted parity. The Staging five legacy tables still require an explicit preserve/archive/retire decision and a non-destructive cutover plan.


### 8.6 Staging legacy-table usage triage

GitHub code search against the canonical NOVA repository `main` and the old `Voom_system/main` returned no code references for the five Staging-only legacy table names: `user_brokers`, `ai_strategy_state`, `video_histories`, `bot_config`, and `latest_signal`. The current NOVA repository does reference the shared `broker_connections` table and the two approval tables.

This supports classifying the five tables as **unreferenced legacy candidates**, not as proven safe to drop. Before any retirement, preserve a schema/data backup, check external integrations and historical logs, confirm row counts/ownership with the data owner, and obtain explicit approval. No table was dropped or altered.


### 8.7 Full Production catalog fingerprint replay

A schema-only Production fingerprint has been captured from PostgreSQL catalogs (no row data) and stored at `supabase/recovered-history/catalog-fingerprints/production.json`. It includes 19 table definitions/RLS flags, 171 column definitions/defaults, 89 constraints, 60 indexes, 21 policies, four triggers, 15 public/private functions with security/search-path metadata, 190 table grants, and five extension/schema assignments. The Production replay lane now computes the same fingerprint from the disposable clean-replay database and compares it structurally against the hosted snapshot. This is stricter than checking only object counts. Result is pending CI.


**Forward-replay evidence:** the separate Production 24-migration history plus canonical NOVA approval migration was replayed from empty local Supabase and passed all assertions in [run #41175585645](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41175585645). This demonstrates that the NOVA approval migration can be layered additively over the Production baseline in a clean environment. It is not a hosted deployment or a Staging rebuild.

The new exact-head full Production catalog fingerprint comparison is running in [run #41175729533](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41175729533).

### 8.9 Exact-head replay failure analysis and local-only ACL normalization

The full Production replay in run [#41175911154](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41175911154) replayed all 24 recovered migrations and passed the 19-table/RLS/function assertions. The Staging 2-migration lane and Production-plus-NOVA 25-migration lane also passed.

The Production job failed only at the full catalog comparison. Eight catalog categories matched exactly (tables, columns, constraints, indexes, policies, triggers, functions and extensions). The grant category differed by four rows: the disposable Supabase CLI bootstrap granted service_role DELETE, INSERT, SELECT and UPDATE on broker_connections, while the captured hosted Production catalog did not. The three hosted grants that do exist for this table (REFERENCES, TRIGGER and TRUNCATE) were present in both.

A narrowly scoped test-only normalization was added at tests/sql/normalize-local-replay-default-grants.sql. It revokes only those four local bootstrap extras before the Production fingerprint is generated. The file is outside supabase/migrations/, runs only inside the disposable local Production replay, and is never applied to a hosted project or used to rewrite recovered ledger SQL. This preserves the exact historical migration archive while making the comparison account for the known local-bootstrap ACL difference.

**Revalidation required:** the normalization change is not considered successful until the new exact-head Production fingerprint comparison passes. If any other catalog category differs, preserve the mismatch and investigate rather than weakening the comparator or excluding the category.

### 8.8 Execution and corrected clean-replay result (2026-10-31)

The owner approved the explicitly described Production additive migration and the non-destructive Staging alignment work.

**Production additive migration — APPLIED and verified**
- Applied the exact canonical repository SQL `202610300001_nova_durable_approval_lifecycle.sql` to Production project `tlyyxufuiimrbaksoitf` as migration `nova_durable_approval_lifecycle`.
- Read-only post-apply verification returned: 21 public tables; all 21 have RLS enabled; three policies across the two NOVA approval tables; four expected approval functions; exactly one matching migration-history row.
- Production's `broker_connections` grants were not broadened. Production has no `service_role` DELETE/INSERT/SELECT/UPDATE privileges on this table. The migration itself grants browser access only to `authenticated` for SELECT/INSERT and uses owner-scoped RLS.
- Production Security Advisor reports one warning: leaked-password protection is disabled. This is an Auth configuration action, separate from the migration and not changed here.

**Corrected clean replay — ALL THREE JOBS PASSED**
- [Run #41179163419](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41179163419), on PR head `db51655c7064fdbe9bf54c2250864ac9cd3c81d4`: Production recovered history, Staging recovered history, and Production-plus-NOVA all completed successfully.
- The Production fingerprint now matches all catalog categories, including columns, constraints, indexes, RLS policies, triggers, functions, grants and extensions.
- The earlier grant mismatch was diagnosed precisely: Supabase CLI's disposable local bootstrap adds four `service_role` DML grants on `broker_connections` that are absent in hosted Production. The CI-only normalizer revokes those four grants only inside the disposable local replay before comparison. It is not in `supabase/migrations/` and was never applied to a hosted project.
- The earlier run #41175911154 used a prior workflow revision and is superseded by the passing corrected run.

**Staging — PRESERVED; alignment still gated**
- No hosted Staging DDL, reset, migration repair, data write, table drop or schema cutover was performed.
- Five Staging-only legacy tables remain in place. Read-only row counts: `ai_strategy_state` 2, `bot_config` 1, `latest_signal` 1, `user_brokers` 0, `video_histories` 0.
- The five tables have no references found in the two inspected repositories, but that does not rule out external clients or historical consumers. Staging Security Advisor also reports five RLS-enabled tables without policies (default-deny under RLS); review grants and Data API exposure before any retirement or client use.
- Staging currently grants `service_role` broader privileges on `broker_connections` than Production. This is a real hosted difference, not something to silently normalize. Review actual backend/bridge use before changing it.
- A verified, owner-controlled database dump/export destination and external-consumer review are not available through the current connected actions. Therefore the legacy rows have not been exported to chat, GitHub, or another unapproved location, and no destructive retirement is authorized by this record. Keep all five tables unchanged until backup and consumer review are evidenced.

**Current disposition**
- Applied Production additive NOVA Approval migration: **COMPLETE**.
- Exact 26/26 applied-ledger SQL recovery: **COMPLETE**.
- Clean replay and full Production fingerprint: **PASS**.
- Staging legacy preservation: **COMPLETE — unchanged**.
- Staging schema alignment/cutover: **OPEN — requires secure backup/export and review of out-of-band legacy tables and broker service-role permissions**.
- PR #109 remains Draft/open/unmerged. No merge or production frontend deployment occurred. Exness Demo remains read-only; Order Submission OFF; Live Trading OFF.


### 8.10 Refreshed hosted state after durable approval rollout — 2026-10-31

A fresh read-only Supabase MCP inventory after the prior replay work shows the Production runtime has advanced since the original 24-migration snapshot:

- Production project `tlyyxufuiimrbaksoitf`: **25 migration rows and 21 public tables**. The additional row is version `20261031070311`, name `nova_durable_approval_lifecycle`.
- The Production ledger statement for that row was retrieved read-only and compared with `supabase/migrations/202610300001_nova_durable_approval_lifecycle.sql` from canonical `main`: **exact text match, 15,377 characters**. The current Production schema therefore contains the same approval migration content as the canonical repository file, with a different applied-ledger timestamp/version.
- Production now includes `nova_agent_threads` and `nova_approval_requests`; both are RLS-enabled. Their current row counts are zero. No row contents were read.
- Staging/candidate project `rovhmjeowracayicbqij` remains at **2 migration rows and 8 public tables**. Five tables (`user_brokers`, `ai_strategy_state`, `video_histories`, `bot_config`, `latest_signal`) remain outside the two-row migration history. All five have RLS enabled but no policies, and the Supabase Security Advisor reports them as `rls_enabled_no_policy`. Their current row counts are zero; this does not prove that no external integration or archive depends on them.
- Production and Staging remain structurally different. This update does not claim parity or authorize deleting, resetting, merging, or migrating either hosted project.

A fresh schema-only Production fingerprint was captured read-only and added as `supabase/recovered-history/catalog-fingerprints/production-after-nova-approval.json` (21 tables, 193 columns, 24 policies, 21 public/private functions, and 199 role-table grant rows). The older `production.json` remains the historical 24-migration / 19-table baseline. The `production-plus-nova` disposable replay lane now normalizes only local Supabase bootstrap ACL differences and compares the resulting fingerprint against the new current-Production snapshot. This exact-head comparison is pending CI; no hosted write was performed.

Additional advisor findings from the read-only inventory:
- Production: Auth leaked-password protection is not enabled; enablement requires an explicit provider-console decision. The `nova_approval_owner_thread_fk` has no covering index; this is an informational performance finding and should be addressed only through a reviewed additive migration after baseline approval.
- Staging: five legacy tables have RLS enabled without policies. Preserve them while external ownership and usage are investigated; do not add permissive policies merely to silence the advisor.

**Current disposition:** the durable approval migration is present in Production and Staging, and the exact Production ledger SQL matches canonical `main`. Production local replay equivalence is awaiting the new 21-table fingerprint CI. Staging legacy-table classification and cross-environment parity remain open. This is not authorization for Team Lead task persistence or runtime delegation.


### 8.11 Staging legacy-table grant exposure — read-only confirmation

A separate read-only query of `information_schema.role_table_grants` confirms **105 table privilege rows** across the five Staging-only legacy tables. Each table has the full seven table privileges (`DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, `UPDATE`) granted to each of `anon`, `authenticated`, and `service_role`.

All five tables currently report RLS enabled and zero RLS policies. Under PostgreSQL RLS this means the absence of policies is default-deny for browser roles; it does not make the broad grants harmless. The broad grants create a latent exposure if RLS is ever disabled or bypassed and are why the Security Advisor flags these tables. No row contents were queried and no grant/policy was changed.

**Required decision before Staging reuse or cutover:** preserve and classify these tables, then use a reviewed least-privilege plan to revoke unnecessary browser-role grants and/or retire them only after backup, external-integration checks and data-owner approval. Do not add permissive policies just to clear the Advisor finding, and do not delete or reset the tables as part of migration recovery.


### 8.12 Exact-head verification after current Production fingerprint capture

On PR #109 head `d716e06af990cc65180932f24c720dca9691a000`, both required repository checks completed successfully:

- [Supabase Recovered History Replay — run #41179424376](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41179424376): Production 24-migration historical replay, Staging 2-migration replay, and Production-plus-NOVA 25-migration replay with full comparison against the captured current 21-table Production catalog all passed.
- [Frontend CI — run #41179424354](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41179424354): passed on the same head.

The full current Production fingerprint comparison is therefore verified on that exact head. This proves local replay equivalence to the captured Production catalog at that point in time; it does not make Staging equivalent, approve any hosted database write, or authorize a cutover. PR #109 remains Draft/unmerged pending review of the Staging legacy grants, out-of-band table disposition and delivery-plan acceptance.


### 8.13 Staging-only legacy table schema classification — read-only

A verbose metadata-only inspection was performed for the five Staging-only tables. No row contents, API keys, encrypted secrets, or customer records were queried.

| Table | Schema signals | Current disposition |
|---|---|---|
| user_brokers | Contains user_id, broker_id/name, api_key, api_secret_encrypted, passphrase_encrypted, MT5 server/login and connection status fields | **Sensitive legacy broker-secret table.** Do not read, reuse, export or migrate its secret columns. Keep isolated; require source recovery, custody/security review, backup and data-owner approval before any remediation. |
| ai_strategy_state | Symbol, ai_bias, wave_context, active_strategy | Legacy strategy-state candidate; no current-main code-search references were found. Preserve pending owner/source classification. |
| bot_config | execution_mode, strategy_module, max_risk_per_trade and model tuning fields | Legacy runtime/risk configuration candidate. Keep execution disabled; do not reuse as NOVA risk authority. |
| latest_signal | Module/type and entry/SL/TP fields | Legacy signal snapshot candidate. Do not treat as a current broker signal or execution instruction. |
| video_histories | product_url, headline, script and video_url | Legacy content/video history candidate; preserve pending archive and ownership decision. |

All five reported zero rows in the current metadata snapshot, but zero rows do not prove that backups, external consumers, logs, or older project instances do not depend on them. GitHub code search against the current repository returned no indexed code hits for these five table names or api_secret_encrypted; this is not proof that no external consumer exists.

All five remain absent from the two-row Staging migration ledger, have RLS enabled with no policies, and retain broad anon/authenticated/service_role table grants (105 privilege rows total). The secret-bearing user_brokers table is the highest-priority legacy security classification. Do not query secret values, create permissive policies, add these tables to the NOVA schema, revoke grants or drop tables until a reviewed backup/recovery plan and owner approval exist. The correct next step is source/consumer ownership recovery, not schema mutation.

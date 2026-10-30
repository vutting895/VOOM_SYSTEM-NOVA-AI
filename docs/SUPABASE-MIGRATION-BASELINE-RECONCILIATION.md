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

The checked-in repository currently contains only four migration files. This is insufficient evidence to replay either project's full schema from an empty database. Do not combine migration histories, change migration version records, run `db reset`, or apply a new Research migration until the intended target project and its baseline are explicitly reconciled.

This review used read-only Supabase project, migration, table, extension, policy, grant and PostgreSQL catalog metadata. No DDL, migration, seed, user row, token or secret was created, changed or read.

## 2. Repository migration inventory at the reviewed main SHA

| Checked-in file | Purpose inferred from SQL | Reconciliation note |
|---|---|---|
| `202610240001_alpaca_oauth.sql` | Historical Alpaca OAuth state/connection tables and service-only RPCs | Preserve as historical migration evidence. The Alpaca implementation was retired separately; do not replay it into a new target without an explicit retirement decision. |
| `202610270001_mt5_customer_connections.sql` | Per-user Exness MT5 Demo connection request with owner-scoped SELECT/INSERT policies | Its filename timestamp differs from the applied version observed in both projects. Do not rename after application; record the mapping. |
| `202610290001_security_definer_marketplace_hardening.sql` | Moves Marketplace SECURITY DEFINER implementations into `private` and restores public SECURITY INVOKER wrappers | Depends on Marketplace functions, helper and tables from the older Voom_system schema chain. It is not independently replayable on the newer project. |
| `202610300001_nova_durable_approval_lifecycle.sql` | Owner-scoped durable review threads and expiring approval requests | Its filename timestamp differs from the applied version observed in the newer project. Record the mapping before using CLI history reconciliation. |

There is no checked-in complete bootstrap migration for all legacy tables observed in either database. The migration directory therefore must not be treated as a fresh-install baseline yet.

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

Catalog inspection in this older project confirmed the existence of the Marketplace public wrappers, private implementation functions, `private.is_active_staff()`, `public.ai_strategies` and `public.customer_profiles` referenced by `202610290001_security_definer_marketplace_hardening.sql`.

This explains why the Marketplace hardening migration's dependencies were absent in the newer project's catalog but present in the older project's catalog. It does not establish that the older project should remain the canonical target.

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

### Gate A — Declare the canonical target

Record which Supabase project is the canonical NOVA application database for the current deployment. Do not select a target solely because its display name or migration count appears more recent.

The decision record must state:
- project identity and environment (production, staging or local);
- which current frontend/Worker deployment uses it;
- whether the older `Voom_system` project is active, rollback-only or legacy;
- which data must be retained and which services still consume it;
- who owns the final migration approval.

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

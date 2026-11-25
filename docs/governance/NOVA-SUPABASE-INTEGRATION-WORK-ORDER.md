# NOVA Supabase Integration Reconciliation — Dev/Test Work Order

**Date:** 2026-11-25  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Base branch:** `main`  
**Base SHA:** `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Work branch:** `work/nova-supabase-integration-reconciliation`  
**Execution class:** Documentation / Dev-Test planning only  
**Production changes:** NOT AUTHORIZED

## 1. Objective

Resolve the mismatch between NOVA's documented Supabase target, runtime database contracts, and live project schema/migration state. Establish a reproducible, recoverable Dev/Test path before proposing any schema repair or environment change.

This work order does not authorize a production database change, migration, data copy, secret rotation, deployment, broker connection, or live execution.

## 2. Evidence baseline

### Repository and runtime

- Canonical repository main was rechecked at `821db357d70d3613b0ca61520eaae5c5307e8fd4`.
- `docs/NOVA-SUPABASE-CONNECTION.md` identifies project `rovhmjeowracayicbqij` as the user-confirmed NOVA target and sets the frontend URL to `https://rovhmjeowracayicbqij.supabase.co`.
- NOVA MT5 read-only proxy and system-hub runtime use `public.broker_connections`.
- The repository migration `supabase/migrations/202610270001_mt5_customer_connections.sql` defines the expected owner-scoped, Demo-only broker connection contract with RLS.
- The existing `docs/governance/NOVA-SUPABASE-MIGRATION-RECONCILIATION.md` records that the selected `rovhmjeowracayicbqij` project reports `MIGRATIONS_FAILED`, lacks `public.nova_agent_threads` and `public.nova_approval_requests`, and has migration ledger entries whose exact SQL provenance is unresolved.
- The same reconciliation record says backup/PITR and restore-point evidence are unavailable through the connected tools and must be verified by an operator in the Supabase Dashboard.

### Project comparison

- `rovhmjeowracayicbqij`: documented/user-confirmed NOVA target; do not switch away from it without an explicit architecture decision. Current schema/migration drift blocks any claim of readiness.
- `tlyyxufuiimrbaksoitf`: has a more complete observed schema for some NOVA runtime contracts, including `public.broker_connections`, but is not established by current repository configuration as the authorized NOVA target. Treat it as a comparison/reference project only until ownership, environment, data classification, and intended role are confirmed.
- `sblwulsqzlqmycvdolcu`: inactive project; contents remain unverified. Do not restore or activate it because the Free organization is at its two-active-project quota and doing so may require pausing another project.

No database writes or project configuration changes were performed for this work order.

## 3. Required work packages

### WP-1 — Runtime configuration inventory

1. Enumerate every Supabase consumer in the repository: frontend, Cloudflare Workers, backend services, tests, scripts, scheduled jobs, and CI.
2. Record variable names and consumer paths only. Never retrieve, print, commit, or copy secret values.
3. Identify each consumer's expected schema, tables, RPCs, Auth behavior, and required role.
4. Compare repository defaults, deployment variable names, and actual project references without changing any environment.
5. Produce a consumer-to-contract matrix with source path and evidence.

**Exit criteria:** every consumer is mapped; no unexplained Supabase URL or service-role usage remains.

### WP-2 — Migration provenance and schema drift

1. Export the exact migration ledger for the documented target.
2. Compare every ledger version/name to migration files in the canonical repository and release artifacts.
3. Recover authoritative SQL for ledger versions `20261123120144`, `20261123120159`, and `20261123172149` (and any other unmatched entries) from their original release source. Do not reconstruct SQL from migration names.
4. Resolve the durable-approval timestamp/name mismatch between the live ledger entry and repository migration.
5. Explain why the durable-approval functions exist while their expected public tables are absent.
6. Inspect grants, RLS policies, function EXECUTE permissions, SECURITY DEFINER search_path, triggers, indexes, and dependencies table-by-table.

**Exit criteria:** every live migration is traceable to exact source SQL and every expected/missing object has a documented explanation.

### WP-3 — Recoverability and backup evidence

1. In Supabase Dashboard, verify plan, backup type, latest successful backup timestamp, retention, and available restore points.
2. Verify PITR status and recovery window, if available; do not enable paid features.
3. Verify Storage object backup separately from PostgreSQL backup.
4. Obtain a logical schema-and-data export with checksum and documented scope.
5. Demonstrate restore to a separate, cost-approved test target if available. Never overwrite the selected project for a test.
6. Record who verified the restore and the exact evidence.

**Exit criteria:** a restorable pre-change snapshot and rollback route are demonstrated, not merely assumed.

### WP-4 — Isolated Dev/Test validation

Only after WP-1 through WP-3 pass and a test target is explicitly approved:

1. Apply recovered/reconciled migrations only to the isolated test target.
2. Test two-user tenant isolation and unauthorized cross-user reads/writes.
3. Test approval creation, resolution, expiry, duplicate requests, invalid state transitions, and role denial.
4. Test emergency-stop visibility and authorization semantics.
5. Test `public.broker_connections` owner scoping, pending-only insertion, Demo-only constraints, and read-only MT5 proxy behavior.
6. Verify service-role credentials remain server-side and no secret enters browser bundles or logs.
7. Run regression tests for system-hub and MT5 proxy endpoints.
8. Capture SQL catalog snapshots, test logs, migration ledger, and exact tested commit SHA.

**Exit criteria:** all tests pass on the isolated target with reproducible evidence; no production resource was modified.

## 4. Decision gates

| Gate | Required evidence | Current status |
|---|---|---|
| A — Runtime inventory | Complete consumer/config contract matrix | NOT STARTED |
| B — Migration provenance | Exact SQL for every live ledger entry | BLOCKED |
| C — Recoverability | Backup/export checksum and restore proof | BLOCKED |
| D — Test target | Isolated target, cost and ownership approved | BLOCKED |
| E — Dev/Test validation | Tenant/RLS/RPC/API regression evidence | NOT STARTED |
| F — Production change proposal | Separate explicit approval and rollback plan | NOT AUTHORIZED |

A blocked gate must not be bypassed by manually applying guessed SQL or changing the environment URL.

## 5. Canonical target decision rule

The documented target `rovhmjeowracayicbqij` remains the configuration baseline because the repository explicitly identifies it as the user-confirmed NOVA project. This is not a claim that the project is migration-healthy or production-ready.

The project `tlyyxufuiimrbaksoitf` must not be promoted to canonical solely because its observed schema appears more complete. A future change requires a written decision covering:
- project ownership and intended environment;
- all data domains and tenant boundaries;
- frontend, Worker, and backend consumer compatibility;
- Auth/JWT issuer and key compatibility;
- RLS/grants/function security parity;
- data migration and reconciliation;
- backup/restore and rollback;
- deployment cutover and verification.

## 6. Safety invariants

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No broker writes or broker account connections.
- No production database DDL/DML, migration, data copy, or RLS/grant/function changes.
- No production secrets or environment variables changed.
- No deployment and no merge to `main`.
- No paid plan, PITR add-on, or new project creation.
- Do not pause an active project to restore the inactive project without separate explicit approval.

## 7. Deliverables

1. Supabase consumer-to-contract inventory.
2. Live migration ledger-to-source provenance matrix.
3. Table/RPC/RLS/grant/security compatibility matrix.
4. Backup and restore evidence record.
5. Dev/Test execution report with exact tested commit and logs.
6. Separate production change proposal only after all prior gates pass.

## 8. Current status

**WORK ORDER CREATED:** documentation-only plan on `work/nova-supabase-integration-reconciliation`.

**IN PROGRESS:** branch contains this work order only.

**BLOCKED:** migration provenance, backup/restore evidence, isolated test target approval, and full runtime consumer inventory.

**NOT DONE:** no schema changes, SQL writes, data copy, secret changes, deployment, merge, broker action, or live-trading enablement.

**Next action:** complete WP-1 by inventorying every repository Supabase consumer and produce the contract matrix; request operator-supplied Dashboard backup/restore evidence before any database test or DDL.


## 9. WP-1 initial repository inventory — 2026-11-25

The following source-level consumers/configuration paths were confirmed on the pinned main SHA. This is a repository inventory, not proof of the currently configured Netlify or Cloudflare environment values.

| Consumer / path | Supabase configuration contract | Access pattern / purpose | Status |
|---|---|---|---|
| Root Next.js frontend, `frontend/README.md` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth/data configuration; publishable key only | Confirmed in README; implementation/env binding still needs tracing |
| Legacy/root Vite client, `src/lib/supabase.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser Supabase JS client with persisted session and refresh | Confirmed |
| NOVA Command Center, `apps/nova-command-center/src/lib/nova/config.ts`, `supabase.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser Auth client; role is display-only, Worker enforces authorization | Confirmed |
| Root env template, `.env.example` | `VITE_SUPABASE_URL` points to `rovhmjeowracayicbqij`; blank anon key | Local configuration template; safe defaults disable trading and broker writes | Confirmed |
| Command Center env template, `apps/nova-command-center/.env.example` | `VITE_SUPABASE_URL` points to `rovhmjeowracayicbqij`; placeholder publishable key | Local browser configuration | Confirmed |
| NOVA AI Worker, `integrations/nova-ai-worker/README.md` | Deployment maps `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Worker `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` | Verifies bearer token through Supabase Auth; research-only API | Confirmed in README; live Worker secret values not inspected |
| System Hub Worker, `integrations/system-hub/README.md` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from GitHub Actions deployment configuration | Authenticated owner-scoped PostgREST reads and pending Demo request creation | Confirmed in README; live Worker secret values not inspected |
| Research Worker, `workers/runtime.py` | `SUPABASE_URL` plus `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY` | Authenticated owner-scoped durable approval RPC after deterministic paper-mode risk check | Confirmed in source; deployment/runtime binding not yet confirmed |
| Approval guard, `integrations/notifications/approval_guard.py` | Constructor receives Supabase URL and publishable key | Approval API integration; caller wiring and deployment binding need tracing | Confirmed interface; end-to-end wiring not yet verified |
| Alpaca OAuth migration, `supabase/migrations/202610240001_alpaca_oauth.sql` | References server-only `SUPABASE_SERVICE_ROLE_KEY` in comments | OAuth state/token operations must remain server-side; actual consumer inventory remains open | Migration evidence only; active consumer not established |
| Local/staging integration tests | `NOVA_LOCAL_SUPABASE_*` and `NOVA_STAGING_SUPABASE_*` variables | Local Auth/RLS and staging isolation test harnesses | Confirmed in test sources; secrets and execution status not inspected |

### Initial findings

1. The repository has at least three naming conventions for the project URL: `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL`, and Worker-side `SUPABASE_URL`. These are not automatically a defect because they belong to different build/runtime boundaries, but each mapping must be traced to its deployment workflow and actual environment.
2. The documented target is consistently `rovhmjeowracayicbqij` in the root and Command Center env templates and the NOVA connection document. This confirms the repository configuration baseline, not the target project's migration health.
3. The research Worker and System Hub rely on publishable/anon credentials for Auth/PostgREST with user bearer tokens. No evidence in this inventory supports putting a service-role key in either Worker.
4. The Alpaca migration references a service-role key for server-side OAuth state/token operations. The active code consumer and current deployment status are not yet established; do not infer that the migration alone proves an active service.
5. The frontend README and actual app entrypoints must be separated by application boundary. The Next.js frontend's `NEXT_PUBLIC_*` variables must not be confused with the Vite Command Center's `VITE_*` variables.

### WP-1 remaining tasks

- Trace all workflow files that map GitHub Actions variables/secrets into Netlify and Cloudflare deployments.
- Inspect Worker source code and `wrangler` bindings for every Supabase consumer, including MT5 read-only Proxy and System Hub.
- Trace `workers/runtime.py` to its deployment target and identify whether it is active, test-only, or local-only.
- Search for other Supabase REST/RPC clients, SQLAlchemy/Postgres connections, and Storage consumers not found by the initial token search.
- Inspect deployment configuration names only; do not reveal or retrieve secret values.
- Produce a final matrix with environment (production/staging/local), target project reference, key class (publishable vs server-only), tables/RPCs, and owner.

**WP-1 status: IN PROGRESS.** Initial source paths identified; deployment mapping and complete consumer coverage remain unverified.


## 10. Deployment workflow and hosting audit — 2026-11-25

### Verified repository facts

1. **Canonical main recheck:** latest commit search still returns `821db357d70d3613b0ca61520eaae5c5307e8fd4`. All findings below are pinned to this main SHA.
2. **Actual Netlify build contract:** root `netlify.toml` sets `base = "."`, `command = "npm run build"`, and `publish = "dist"`. Root `package.json` runs `vite build`. This is consistent with the root Vite app, not with the description of a Next.js application in `frontend/README.md`.
3. **Frontend README drift:** `frontend/README.md` describes a Next.js App Router / OpenNext frontend and names `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Netlify settings. The repository's actual Netlify build is rooted at the repository root and uses Vite.
4. **Cloudflare deployment workflow mismatch:** `.github/workflows/cloudflare-deploy.yml` unconditionally runs Node setup with cache path `frontend/package-lock.json`, then runs `npm ci` with working directory `frontend`. It also uses `frontend` as the working directory for Wrangler operations and optionally runs `npm run cf:build` there. The current-main repository inventory recorded that `frontend/` has no `package.json`, `package-lock.json`, or Next.js app source; it contains README/scripts/stores/Wix export artifacts only. This makes the workflow's dependency/build assumptions inconsistent with the observed tree. No workflow was executed in this audit; do not claim a current failure run, but treat the path mismatch as a release blocker until reconciled.
5. **Frontend CI trigger:** `.github/workflows/frontend-ci.yml` is `workflow_dispatch` only. It validates the root Vite app and integration Worker contracts. Its Netlify production smoke job is conditioned on `push` to main, so a manual dispatch does not itself establish that production was deployed.
6. **Cloudflare backend deploy trigger:** `.github/workflows/cloudflare-deploy.yml` listens to successful `Frontend CI` workflow runs on main. It maps GitHub Actions secret names `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` into Worker-side `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The workflow's deploy concurrency group is production-scoped. Do not dispatch or otherwise trigger it as part of this read-only audit.
7. **AI Worker deploy trigger:** `.github/workflows/ai-worker-deploy.yml` has a direct `push` trigger on main for changes under `integrations/nova-ai-worker/**` or its workflow. It maps the same GitHub Actions secret names to Worker-side Supabase settings and deploys the Worker. No push to main was made in this task.
8. **System Hub Worker static configuration:** `integrations/system-hub/wrangler.jsonc` sets the Worker name and allowed UI origins / MT5 proxy URL; it does not declare a Supabase project URL. Supabase settings are supplied by the deployment workflow/runtime variables.
9. **MT5 read-only Proxy:** its `wrangler.jsonc` does not contain a Supabase URL; its source accepts `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`, and the deployment workflow supplies the publishable key while retaining existing variables.
10. **NOVA AI Worker:** `integrations/nova-ai-worker/wrangler.toml` declares the Worker and AI binding but no Supabase URL; runtime settings are injected by the deployment workflow.
11. **Actual configured secret values:** repository source establishes variable-name mappings only. It does not prove the current GitHub Actions secret value, the Netlify environment value, or the live Cloudflare Worker variable value. Those must be checked in their respective dashboards without printing or copying secrets.
12. **Supabase target baseline:** root `.env.example`, Command Center `.env.example`, and `docs/NOVA-SUPABASE-CONNECTION.md` point to `rovhmjeowracayicbqij`. The deployment workflow uses a shared GitHub Actions secret name for multiple Workers, so a single secret value may fan out to several Worker runtimes. Its actual value remains unverified.

### Confirmed deployment / data-plane matrix

| Surface | Source of config | Supabase URL/key mapping | Current evidence |
|---|---|---|---|
| Netlify root Vite app | Netlify site settings, root Vite env | Root app reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; repo templates name `rovhm...` | Build contract confirmed; live Netlify env not inspected |
| NOVA Command Center app | App-local Vite env | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; template names `rovhm...` | Source/template confirmed; actual deployed host/environment not proven |
| System Hub Worker | GitHub Actions → Cloudflare Worker vars | `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL`; anon key → `SUPABASE_PUBLISHABLE_KEY` | Workflow mapping confirmed; actual secret value not inspected |
| MT5 read-only Proxy | Cloudflare deploy workflow / retained Worker vars | publishable key passed; URL expected as `SUPABASE_URL` runtime var | Source/workflow contract confirmed; actual deployed vars not inspected |
| NOVA AI Worker | AI Worker deploy workflow | Same Actions secret names map to `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Workflow mapping confirmed; actual secret value not inspected |
| Remote MCP Worker | Cloudflare deploy workflow + `DATACENTER_MCP_URL` | Auth code uses `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Source/workflow behavior partly confirmed; live deployment/configuration not inspected |
| Research Worker (`workers/runtime.py`) | Deployment target not found in this pass | `SUPABASE_URL` + publishable/anon key | Runtime contract confirmed; deployment/active status unresolved |
| Video API | `NEXT_PUBLIC_SUPABASE_URL` / anon key per docs | project/job operations require a migration not yet applied to hosted project per integration doc | Readiness explicitly blocked in docs; no migration applied |

### WP-1 findings and blockers

- **BLOCKER-DEPLOY-01:** Cloudflare deploy workflow references a missing `frontend/package-lock.json` and runs `npm ci` in a directory with no package manifest according to the current-main tree inventory.
- **BLOCKER-DEPLOY-02:** `frontend/README.md` describes a Next.js/OpenNext app that does not match the actual root Netlify Vite build contract. Clarify whether this README/workflow is stale, or whether an intended frontend artifact was omitted.
- **BLOCKER-DEPLOY-03:** the Cloudflare deploy workflow is production-scoped and is chained to successful Frontend CI. No workflow was run or dispatched during this audit.
- **BLOCKER-SUPABASE-01:** shared GitHub Actions secret-name mapping is visible, but the actual URL value is not verifiable from repository source. Dashboard inspection must confirm the URL's project ref for each deployment surface without revealing key values.
- **BLOCKER-SUPABASE-02:** no evidence yet ties the Research Worker to a concrete deployed service or proves whether it is active.
- **BLOCKER-SUPABASE-03:** Video API documentation explicitly states its migration is not yet applied to the hosted project; this must remain isolated and not be folded into a generic schema repair.

### WP-1 revised status

**PARTIAL — deployment mappings inventoried; live configuration and full consumer coverage not verified.**

Do not attempt to repair the Cloudflare workflow as part of this database work order. Create a separate deployment-reconciliation work order after confirming whether the intended frontend is the root Vite app or a missing Next.js/OpenNext app. Keep Netlify production unchanged.

### Required next evidence

1. Inspect Netlify site configuration for variable names and the project ref portion of the URL only; never reveal keys.
2. Inspect GitHub Actions secret presence by name only and, if an authorized safe metadata check exists, verify the URL project ref without exposing the key.
3. Inspect Cloudflare Worker variable names and URL project refs for System Hub, MT5 Proxy, AI Worker, Remote MCP, and frontend Worker; do not read secret values.
4. Determine if the deployed Command Center is currently hosted and which environment it targets.
5. Locate the Research Worker deployment definition or record it as local/un-deployed if no deployment evidence exists.
6. Resolve the frontend workflow mismatch in a separate approved work order before any Cloudflare production workflow is triggered.

**Safety note:** this update is documentation-only on the work branch. No workflow dispatch, push to main, Worker deployment, Netlify change, secret retrieval, database mutation, broker operation, or live-trading change was performed.


## 11. Live Supabase read-only verification — 2026-11-25 12:28 ICT

### Repository pin

Canonical `main` was rechecked immediately before this database inspection. Latest commit remains:
`821db357d70d3613b0ca61520eaae5c5307e8fd4`.

### Management API project inventory

The connected Supabase organization returned three projects:

| Project ref | Name | Region | Status |
|---|---|---|---|
| `tlyyxufuiimrbaksoitf` | Voom_system | ap-southeast-1 | ACTIVE_HEALTHY |
| `rovhmjeowracayicbqij` | vutting895's Project | ap-northeast-1 | ACTIVE_HEALTHY |
| `sblwulsqzlqmycvdolcu` | Mt5 | ap-south-1 | INACTIVE |

No project was created, restored, paused, or modified.

### Live schema inventory (catalog SELECT + Management API)

**Important correction:** the earlier public-schema-only inspection was incomplete. The `rovhm...` project has four tables in schema `nova`; it is not correct to say it has only one NOVA-related table in the entire database.

| Schema | Voom_system (`tlyyx...`) | `rovhm...` |
|---|---:|---:|
| `public` | 23 tables | 1 table |
| `nova` | 1 table | 4 tables |
| `supabase_migrations` | 1 ledger table | 1 ledger table |
| Migration ledger entries | 28 | 8 |

**Voom_system public schema** includes trading_sessions, strategy_signals, risk_guard_decisions, security_events, system_heartbeats, ai_strategies, customer_ai_subscriptions, signal_delivery_log, strategy_versions, backtest_runs, quality_gate_configs/results, learning_events, mcp_tool_audit, system_controls, alpaca_oauth_states/connections, broker_connections, nova_agent_threads, nova_approval_requests, nova_analysis_jobs, and nova_analysis_audit_events, plus customer_profiles.

**Voom_system nova schema** includes `nova.mt5_broker_connections`.

**rovhm nova schema** includes `nova.approvals`, `nova.audit_events`, `nova.emergency_stops`, and `nova.mt5_broker_connections`. Its public schema contains `affiliate_state_snapshots`.

### RLS policy inspection

Read-only query of `pg_policies` confirms:

- On `Voom_system.public.broker_connections`: authenticated users may INSERT only their own pending `exness_mt5` Demo connection with `bridge_route_id IS NULL`; SELECT is owner-scoped.
- On `Voom_system.nova.mt5_broker_connections`: the same owner-scoped pending-only Demo INSERT and owner SELECT pattern is present.
- On `Voom_system.public.nova_agent_threads`: owner SELECT and owner INSERT restricted to active state / policy version.
- On `Voom_system.public.nova_approval_requests`: owner SELECT constrained through an owner-matching thread. No authenticated INSERT policy appeared in the inspected policy result.
- On `rovhm.nova.mt5_broker_connections`: the same pending-only Demo INSERT and owner SELECT pattern is present.
- On `rovhm.nova.approvals`, `audit_events`, and `emergency_stops`: policies shown are SELECT-only and role-gated through `nova.current_role()`. The approval/audit policies require admin/operator/viewer roles; emergency stop SELECT requires admin/operator.

These are policy definitions only. They do not prove effective access in every role because table grants, function privileges, SECURITY DEFINER functions, JWT claims, and cross-table paths still need separate validation.

### Supabase advisors

**rovhm project — Security**
- INFO: `public.affiliate_state_snapshots` has RLS enabled but no policies. This may intentionally deny all client access, but must be verified against the server-side access contract.
- WARN: leaked-password protection is disabled.

**Voom_system — Security**
- WARN: leaked-password protection is disabled.
- No additional security lints were returned in this advisor result.

**Voom_system — Performance**
- INFO: one unindexed foreign key on `public.nova_approval_requests` (`nova_approval_owner_thread_fk`).
- INFO: 35 unused-index findings. Do not remove indexes from this snapshot alone; the project may have low workload/short observation history.

**rovhm project — Performance**
- INFO: five unused-index findings in the `nova` schema. No index removals are authorized.

### Evidence interpretation and corrected decision

1. `tlyyx...` has the broader integrated VOOM/NOVA Trading + AI schema and matches more of the current public-schema runtime contract.
2. `rovhm...` is not an empty or wholly failed database: it contains a separate NOVA governance design under schema `nova`, the MT5 table, and an Affiliate state snapshot in `public`. Its eight migration ledger entries are therefore not equivalent to “no schema”; however, the public schema does not contain the broader VOOM/NOVA runtime tables present in `tlyyx...`.
3. Both projects contain an MT5 broker connection table in schema `nova`; `tlyyx...` additionally has `public.broker_connections`, which is the current Worker contract identified in repository source.
4. The `Mt5` project is currently INACTIVE. Its data and schema have not been inspected because database calls against a paused project are unavailable. Do not restore it merely to inspect it; restore has operational/cost implications and requires a separate decision.
5. The prior “tlyyx should be canonical” conclusion is only a **schema-fit recommendation**, not an approved cutover. The repository still documents `rovhm...` as the NOVA target, and the intended roles of the two ACTIVE_HEALTHY projects have not yet been confirmed by a complete deployment/environment inventory.

### Remaining blockers

- **BLOCKED — runtime endpoint truth:** no read-only proof yet of the actual Supabase project ref configured in Netlify, GitHub Actions secrets, and each deployed Cloudflare Worker.
- **BLOCKED — effective permissions:** table grants, RPC/function EXECUTE grants, function security/search_path, JWT claims, and two-user isolation tests not yet inspected.
- **BLOCKED — migration provenance:** live migration names/versions must be reconciled to exact SQL files and the known failed/unmatched history.
- **BLOCKED — backup/restore:** the available Supabase tools in this session expose project metadata, schema, migrations, SQL, advisors, and logs, but no backup listing/export/restore-point evidence endpoint. A Dashboard/operator evidence check is required. Do not claim backup or restore readiness.
- **BLOCKED — inactive Mt5 project:** no evidence of its current schema/data or whether it is safe to reuse.

### Next read-only steps

1. Inspect full column/constraint metadata for both projects' broker tables and NOVA governance/approval tables.
2. Inspect table grants, function signatures, function EXECUTE grants, `prosecdef`, and `proconfig` (including search_path) for relevant RPCs.
3. Compare all eight `rovhm...` migration versions and all 28 `tlyyx...` migration versions against exact repository migration files.
4. Continue to avoid dashboard secret values. Request operator verification of project refs only, plus backup timestamp/retention/PITR/restore evidence.
5. Do not create a Supabase branch or project until its exact cost is quoted and explicitly approved.

**Execution evidence:** this section is based on Supabase Management API project metadata, table/migration listings, read-only catalog SELECT queries, and advisor output. No DDL/DML, migration, secret retrieval, project restore, deployment, broker connection, or live trading action was performed.

# NOVA Central Data Platform

Status: implementation foundation in review; hosted schema activation is blocked on Supabase migration-baseline reconciliation (PR #109).

## Canonical backend

The production frontend and Cloudflare Workers currently target the Supabase project \`Voom_system\` (\`tlyyxufuiimrbaksoitf\`, \`ap-southeast-1\`). This is the canonical database target for the current NOVA runtime. The separate project \`rovhmjeowracayicbqij\` is a staging/candidate project and must not be silently substituted.

## Responsibilities

- **Supabase Postgres** is the System of Record for normalized OHLCV candles, economic/news events, ingestion run metadata, dataset manifests, model run/evaluation metadata, and tenant-owned artifact references.
- **Supabase Storage** is private object storage for compressed datasets, feature snapshots, model weights, scalers, and evaluation bundles. The proposed bucket is \`nova-data\`; paths are \`shared/...\` or \`<auth-user-uuid>/...\`.
- **Cloudflare Workers / trusted ingestion runtime** validate, normalize, deduplicate, and write through the server-only Supabase service role. The service-role key is never sent to the browser or stored in Git.
- **Netlify frontend** reads only through authenticated APIs or Supabase Auth + explicit RLS read policies. It never receives the service-role key.
- **Windows MT5 Bridge** remains read-only and submits closed candles to the trusted ingestion boundary. Tenant-bound Exness Demo candles are stored with the authenticated owner's UUID; public market feeds use the shared scope.

## Data model

The pending schema proposal defines:

| Table | Purpose | Browser access |
|---|---|---|
| \`nova_market_candles\` | Idempotent OHLCV store; shared public feed or owner-scoped broker feed | Authenticated SELECT under scope RLS |
| \`nova_market_events\` | Economic/news calendar and source provenance | Authenticated SELECT |
| \`nova_ingestion_runs\` | Ingestion audit/status ledger | Server only |
| \`nova_dataset_manifests\` | Dataset ranges, row counts, schema version and SHA-256 | Authenticated SELECT under scope RLS |
| \`nova_model_runs\` | Model family/version, code SHA, final-OOS window and evaluation metrics | Owner SELECT |
| \`nova_model_artifacts\` | Owner-scoped metadata pointing to private Storage objects | Owner SELECT |

The database stores decimal price/volume values as PostgreSQL \`numeric\`, not rounded display values. Ingestion uses text decimal representations so Python float conversion does not reduce precision before the database write.

## Security boundaries

- Every table enables RLS.
- \`anon\` receives no table grants.
- Browser \`authenticated\` receives only the minimum SELECT grants plus owner/shared read policies.
- Only server-side \`service_role\` may insert/update ingestion data and training metadata.
- Exness Demo feed rows require an owner UUID and \`environment='demo'\`.
- Storage bucket is private; authenticated users may read only \`shared/\` objects or their own UUID-prefixed objects. Writes remain server-only.
- No broker password, API secret, bearer token, raw authorization header, or credential-bearing payload is persisted.
- Model promotion is server-controlled. \`promoted\` is not writable from browser roles.
- Execution remains disabled; this data plane does not add broker order APIs.

## Current implementation slice

\`workers/data-ingestion/supabase_store.py\` adds a bounded PostgREST adapter using \`SUPABASE_URL\` and \`SUPABASE_SERVICE_ROLE_KEY\`. The adapter validates host, source, environment, owner UUID, timeframe, timestamp timezone and OHLCV relationships; it batches idempotent upserts and records sanitized ingestion-run metadata.

The public Binance prototype remains read-only. Persistence is opt-in through \`NOVA_PERSIST_TO_SUPABASE=true\`; no writes occur by default. Exness ingestion must pass the verified authenticated owner ID from the trusted MT5 proxy path, never a user-supplied ID.

## Migration activation gate

PR #109 recovered the Production runtime's 24 applied migration statements and is the prerequisite for safely adding a new active migration. Its recovered files are forensic history, not an active CLI migration directory. Do not copy them into \`supabase/migrations\`, rewrite \`supabase_migrations.schema_migrations\`, or run \`db push\` against Production.

\`supabase/pending/nova-central-data.sql\` is a reviewable schema proposal only. After PR #109 is reconciled and merged:
1. Generate a new migration with \`supabase migration new\`.
2. Move the reviewed SQL into that generated migration.
3. Replay the full recovered Production history plus this migration in disposable PostgreSQL/Supabase CI.
4. Compare catalog fingerprints, RLS, grants, Storage policies and constraints.
5. Apply only through a separately approved deployment workflow.
6. Verify test-owner read, foreign-owner denial, service-only write, idempotent candle upsert, Storage path isolation and data retention.

No hosted schema or Storage bucket has been changed by this PR.

## 2026-11-02 production baseline checkpoint

A fresh read-only Supabase check of Production project \`tlyyxufuiimrbaksoitf\` returned 25 applied migration rows. The latest row is \`20261031070311:nova_durable_approval_lifecycle\`. The six proposed central-data tables (\`nova_market_candles\`, \`nova_market_events\`, \`nova_ingestion_runs\`, \`nova_dataset_manifests\`, \`nova_model_runs\`, \`nova_model_artifacts\`) and the \`nova-data\` bucket do not exist in Production yet.

PR #109 remains Draft/open/unmerged at head \`650613fededde13fca6953a737dab6b2a5049a86\`; its recorded base is \`a2acfd8ec9b598e6593413549bef760e8f596a72\`. Compared with current main \`a9bb92c9d2642eff34be2ea68276a33b367ee793\`, its branch is 34 ahead / 82 behind. Its older exact-head CI evidence must not be treated as current-head proof. Reconcile/rebase the baseline work against current main, re-run clean replay and fingerprint tests, and verify all 25 Production migration rows before generating an active central-data migration.

This checkpoint is read-only. It does not authorize applying the pending schema or creating the Storage bucket.

## Main branch movement recheck — 2026-11-02

Current repository main is now \`4480d3bf6fa8f390b09334091f697d8359e79085\`, after commit \`chore: initialize project scaffolding\`. This commit replaces the previous \`frontend/\` Next.js tree with a root Vite/React scaffold and removes the previous frontend API routes and pages. The central-data PR remains based on \`a9bb92c9d2642eff34be2ea68276a33b367ee793\`, 20 commits ahead / 1 behind current main; reconcile it with the new main before merge. This PR does not migrate or restore the removed frontend APIs.

The Production database was rechecked read-only after this main movement: still 25 applied migration rows, latest \`20261031070311:nova_durable_approval_lifecycle\`; all six proposed central-data tables and the \`nova-data\` bucket remain absent. PR #109 is now 34 ahead / 83 behind current main. No schema migration or bucket creation is authorized by this checkpoint.

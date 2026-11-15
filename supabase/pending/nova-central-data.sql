-- PENDING SCHEMA DESIGN ONLY.
-- Do not apply or move into supabase/migrations until PR #109 migration-baseline
-- reconciliation is merged and the active Production migration history is replayed.
-- Target: Voom_system (tlyyxufuiimrbaksoitf). No hosted database has been changed.

create table if not exists public.nova_market_candles (
  id bigint generated always as identity primary key,
  scope_key text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  source text not null check (source in ('binance_public','exness_mt5_demo','exness_trader_api')),
  environment text not null check (environment in ('public','demo','paper')),
  symbol text not null check (symbol ~ '^[A-Z0-9._/-]{2,32}$'),
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H4','D1','1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M')),
  bar_time timestamptz not null,
  open numeric(28,12) not null,
  high numeric(28,12) not null,
  low numeric(28,12) not null,
  close numeric(28,12) not null,
  volume numeric(28,12) not null default 0,
  tick_volume bigint,
  spread_points numeric(20,8),
  is_closed boolean not null default true,
  ingested_at timestamptz not null default now(),
  constraint nova_market_candles_scope_owner_check
    check (scope_key = coalesce(owner_id::text, 'shared')),
  constraint nova_market_candles_source_environment_check
    check (
      (source = 'binance_public' and environment = 'public' and owner_id is null)
      or (source in ('exness_mt5_demo','exness_trader_api') and environment = 'demo' and owner_id is not null)
    ),
  constraint nova_market_candles_ohlcv_check
    check (high >= greatest(open, close) and low <= least(open, close) and high >= low and volume >= 0),
  constraint nova_market_candles_tick_volume_check
    check (tick_volume is null or tick_volume >= 0),
  constraint nova_market_candles_spread_check
    check (spread_points is null or spread_points >= 0),
  constraint nova_market_candles_unique
    unique (scope_key, symbol, timeframe, bar_time, source)
);
create index if not exists nova_market_candles_lookup_idx
  on public.nova_market_candles(scope_key, symbol, timeframe, bar_time desc);
create index if not exists nova_market_candles_ingested_idx
  on public.nova_market_candles(ingested_at desc);

create table if not exists public.nova_market_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  currency text not null,
  impact smallint not null check (impact between 1 and 3),
  event_time timestamptz not null,
  title text not null,
  actual text,
  forecast text,
  previous text,
  source_hash text check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  ingested_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists nova_market_events_time_idx
  on public.nova_market_events(currency, event_time);

create table if not exists public.nova_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  source text not null,
  environment text not null check (environment in ('public','demo','paper')),
  symbol text not null,
  timeframe text not null,
  status text not null check (status in ('running','completed','partial','failed')),
  received_count integer not null default 0 check (received_count >= 0),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_-]{2,64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists nova_ingestion_runs_owner_started_idx
  on public.nova_ingestion_runs(owner_id, started_at desc);

create table if not exists public.nova_dataset_manifests (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  dataset_type text not null check (dataset_type in ('market_ohlcv','news_calendar','features','labels','training_snapshot','backtest_input')),
  source text not null,
  symbol text,
  timeframe text,
  range_start timestamptz,
  range_end timestamptz,
  row_count bigint not null check (row_count >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  schema_version text not null,
  storage_bucket text not null default 'nova-data',
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint nova_dataset_manifests_scope_owner_check
    check (scope_key = coalesce(owner_id::text, 'shared')),
  constraint nova_dataset_manifests_range_check
    check (range_start is null or range_end is null or range_start < range_end),
  constraint nova_dataset_manifests_storage_scope_check
    check (storage_bucket = 'nova-data' and (
      (owner_id is null and storage_path like 'shared/%')
      or (owner_id is not null and storage_path like owner_id::text || '/%')
    )),
  unique (scope_key, sha256),
  unique (id, scope_key)
);
create index if not exists nova_dataset_manifests_lookup_idx
  on public.nova_dataset_manifests(scope_key, dataset_type, created_at desc);

create table if not exists public.nova_model_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_family text not null check (model_family in ('xgboost','pytorch_lstm','hybrid','smc','other')),
  model_version text not null,
  status text not null check (status in ('queued','running','completed','failed','rejected')),
  dataset_manifest_id uuid,
  dataset_scope_key text not null default 'shared',
  code_sha text check (code_sha is null or code_sha ~ '^[a-f0-9]{40,64}$'),
  final_oos_start date,
  final_oos_end date,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  started_at timestamptz,
  finished_at timestamptz,
  promoted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint nova_model_runs_dataset_scope_check
    check (dataset_scope_key = 'shared' or dataset_scope_key = owner_id::text),
  constraint nova_model_runs_dataset_scope_fk
    foreign key (dataset_manifest_id, dataset_scope_key)
    references public.nova_dataset_manifests(id, scope_key),
  check (final_oos_start is null or final_oos_end is null or final_oos_start < final_oos_end)
);
create index if not exists nova_model_runs_owner_created_idx
  on public.nova_model_runs(owner_id, created_at desc);

create table if not exists public.nova_model_artifacts (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('model','scaler','feature_importance','evaluation','training_log')),
  storage_bucket text not null default 'nova-data',
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  foreign key (model_run_id, owner_id)
    references public.nova_model_runs(id, owner_id) on delete cascade,
  constraint nova_model_artifacts_storage_scope_check
    check (storage_bucket = 'nova-data' and storage_path like owner_id::text || '/%'),
  unique (storage_bucket, storage_path),
  unique (model_run_id, artifact_type, sha256)
);

-- Explicit grants are required for newly created public tables after 2026-10-30.
alter table public.nova_market_candles enable row level security;
alter table public.nova_market_events enable row level security;
alter table public.nova_ingestion_runs enable row level security;
alter table public.nova_dataset_manifests enable row level security;
alter table public.nova_model_runs enable row level security;
alter table public.nova_model_artifacts enable row level security;

revoke all on public.nova_market_candles, public.nova_market_events,
  public.nova_ingestion_runs, public.nova_dataset_manifests,
  public.nova_model_runs, public.nova_model_artifacts
  from public, anon, authenticated;
grant select on public.nova_market_candles, public.nova_market_events,
  public.nova_dataset_manifests, public.nova_model_runs,
  public.nova_model_artifacts to authenticated;
grant select, insert, update, delete on public.nova_market_candles,
  public.nova_market_events, public.nova_ingestion_runs,
  public.nova_dataset_manifests, public.nova_model_runs,
  public.nova_model_artifacts to service_role;
grant usage, select on sequence public.nova_market_candles_id_seq to service_role;

drop policy if exists nova_market_candles_read_scope on public.nova_market_candles;
create policy nova_market_candles_read_scope on public.nova_market_candles
  for select to authenticated
  using (scope_key = 'shared' or owner_id = (select auth.uid()));

drop policy if exists nova_market_events_read_authenticated on public.nova_market_events;
create policy nova_market_events_read_authenticated on public.nova_market_events
  for select to authenticated using (true);

drop policy if exists nova_dataset_manifests_read_scope on public.nova_dataset_manifests;
create policy nova_dataset_manifests_read_scope on public.nova_dataset_manifests
  for select to authenticated
  using (scope_key = 'shared' or owner_id = (select auth.uid()));

drop policy if exists nova_model_runs_read_owner on public.nova_model_runs;
create policy nova_model_runs_read_owner on public.nova_model_runs
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists nova_model_artifacts_read_owner on public.nova_model_artifacts;
create policy nova_model_artifacts_read_owner on public.nova_model_artifacts
  for select to authenticated using (owner_id = (select auth.uid()));

-- The bucket is private. Only the trusted service role writes objects.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'nova-data',
  'nova-data',
  false,
  52428800,
  array['application/octet-stream','application/gzip','application/json','text/csv','application/x-parquet']
)
on conflict (id) do nothing;

drop policy if exists nova_data_objects_read_scope on storage.objects;
create policy nova_data_objects_read_scope on storage.objects
  for select to authenticated
  using (
    bucket_id = 'nova-data'
    and (
      (storage.foldername(name))[1] = 'shared'
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

comment on table public.nova_market_candles is
  'Canonical, idempotent NOVA OHLCV store. Shared public feeds use scope_key=shared; broker feeds are owner-scoped.';
comment on table public.nova_market_events is
  'Canonical economic/news event calendar; server-written and authenticated read-only.';
comment on table public.nova_ingestion_runs is
  'Server-only ingestion audit ledger; never contains credentials or raw broker payloads.';
comment on table public.nova_dataset_manifests is
  'Immutable dataset metadata and SHA-256 provenance; file bytes live in private Storage.';
comment on table public.nova_model_runs is
  'Owner-scoped training/evaluation metadata; model promotion remains server-controlled.';
comment on table public.nova_model_artifacts is
  'Owner-scoped references to private model and evaluation artifacts in Storage.';

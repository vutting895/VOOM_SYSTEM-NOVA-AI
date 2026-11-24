-- NOVA Dataset / Model Registry and Learning Run persistence.
-- Apply only through a reviewed Supabase migration after staging validation.
begin;

create table if not exists public.nova_dataset_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dataset_key text not null check (length(dataset_key) between 1 and 128),
  source text not null check (length(source) between 1 and 128),
  symbol text not null check (length(symbol) between 1 and 32),
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H4','D1')),
  row_count bigint not null default 0 check (row_count >= 0),
  start_at timestamptz,
  end_at timestamptz,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_uri text,
  quality_status text not null default 'pending' check (quality_status in ('pending','passed','failed','unknown')),
  validation_status text not null default 'pending' check (validation_status in ('pending','passed','failed','blocked')),
  manifest jsonb not null default '{}'::jsonb,
  coverage_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nova_dataset_range_check check (start_at is null or end_at is null or start_at < end_at),
  constraint nova_dataset_owner_key_hash unique (owner_id, dataset_key, sha256)
);

create index if not exists nova_dataset_registry_owner_created_idx
  on public.nova_dataset_registry(owner_id, created_at desc);
create index if not exists nova_dataset_registry_lookup_idx
  on public.nova_dataset_registry(owner_id, symbol, timeframe, validation_status);

create table if not exists public.nova_model_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model_key text not null check (length(model_key) between 1 and 128),
  model_version text not null check (length(model_version) between 1 and 64),
  architecture text not null check (architecture in ('xgboost','lstm','hybrid_xgboost_lstm','meta_ensemble','other')),
  dataset_id uuid references public.nova_dataset_registry(id) on delete restrict,
  dataset_sha256 text not null check (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  feature_schema_sha256 text not null check (feature_schema_sha256 ~ '^[0-9a-f]{64}$'),
  code_revision text not null check (code_revision ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  artifact_uri text,
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$'),
  lifecycle_status text not null default 'candidate' check (lifecycle_status in ('candidate','training','evaluating','approved','rejected','retired')),
  training_mode text not null default 'research' check (training_mode in ('research','paper','demo')),
  metrics jsonb not null default '{}'::jsonb,
  evaluation jsonb not null default '{}'::jsonb,
  oos_start_at timestamptz,
  oos_closed_trades integer not null default 0 check (oos_closed_trades >= 0),
  walk_forward_status text not null default 'not_run' check (walk_forward_status in ('not_run','passed','failed','blocked')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  rollback_model_id uuid references public.nova_model_registry(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nova_model_owner_key_version unique (owner_id, model_key, model_version)
);

create index if not exists nova_model_registry_owner_created_idx
  on public.nova_model_registry(owner_id, created_at desc);
create index if not exists nova_model_registry_status_idx
  on public.nova_model_registry(owner_id, lifecycle_status, architecture);

create table if not exists public.nova_learning_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  run_key text not null unique,
  run_type text not null check (run_type in ('analysis','training','evaluation','walk_forward','promotion_review')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','blocked','cancelled')),
  dataset_id uuid references public.nova_dataset_registry(id) on delete restrict,
  model_id uuid references public.nova_model_registry(id) on delete restrict,
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nova_learning_run_time_check check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index if not exists nova_learning_runs_owner_created_idx
  on public.nova_learning_runs(owner_id, created_at desc);
create index if not exists nova_learning_runs_status_idx
  on public.nova_learning_runs(owner_id, status, run_type);

alter table public.nova_dataset_registry enable row level security;
alter table public.nova_model_registry enable row level security;
alter table public.nova_learning_runs enable row level security;

drop policy if exists nova_dataset_registry_owner_select on public.nova_dataset_registry;
create policy nova_dataset_registry_owner_select on public.nova_dataset_registry
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists nova_dataset_registry_owner_insert on public.nova_dataset_registry;
create policy nova_dataset_registry_owner_insert on public.nova_dataset_registry
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists nova_model_registry_owner_select on public.nova_model_registry;
create policy nova_model_registry_owner_select on public.nova_model_registry
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists nova_model_registry_owner_insert on public.nova_model_registry;
create policy nova_model_registry_owner_insert on public.nova_model_registry
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists nova_learning_runs_owner_select on public.nova_learning_runs;
create policy nova_learning_runs_owner_select on public.nova_learning_runs
  for select to authenticated using (owner_id = auth.uid());

grant select, insert on public.nova_dataset_registry to authenticated;
grant select, insert on public.nova_model_registry to authenticated;
grant select on public.nova_learning_runs to authenticated;

commit;

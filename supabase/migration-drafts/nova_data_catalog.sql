-- DRAFT ONLY — not applied to Supabase.
-- To turn this into a tracked migration, run:
--   supabase migration new nova_data_catalog
-- Then move this SQL into the generated file after reviewing the backup/rollback plan.
--
-- Target: Supabase project "Voom_system" (tlyyxufuiimrbaksoitf)
-- Additive only: no existing tables or data are altered or dropped.
-- All catalog tables are backend-only: no anon/authenticated grants; service_role only.
-- Apply only after a verified database backup and preview/staging validation.

create table if not exists public.nova_data_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (char_length(btrim(source)) between 1 and 80),
  provider_symbol text not null check (char_length(btrim(provider_symbol)) between 1 and 40),
  instrument text not null check (char_length(btrim(instrument)) between 1 and 40),
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H4','D1')),
  requested_start timestamptz,
  requested_end timestamptz,
  status text not null default 'queued' check (status in ('queued','ingesting','validating','stored','failed','cancelled')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{12,128}$'),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata) = 'object'),
  raw_object_key text,
  dataset_id text,
  error_code text,
  error_summary text check (error_summary is null or char_length(error_summary) <= 500),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint nova_data_ingestion_range_check check (requested_start is null or requested_end is null or requested_start < requested_end),
  constraint nova_data_ingestion_idempotency_unique unique (source, idempotency_key)
);

create index if not exists nova_data_ingestion_status_created_idx on public.nova_data_ingestion_jobs(status, created_at);
create index if not exists nova_data_ingestion_instrument_time_idx on public.nova_data_ingestion_jobs(instrument, timeframe, created_at desc);

create table if not exists public.nova_datasets (
  dataset_id text primary key check (dataset_id ~ '^ds_[A-Za-z0-9_-]{8,80}$'),
  status text not null default 'quarantined' check (status in ('quarantined','pending_review','approved','rejected','deprecated')),
  source text not null,
  source_license text,
  instrument text not null,
  provider_symbol text not null,
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H4','D1')),
  timezone text not null default 'UTC' check (timezone = 'UTC'),
  timestamp_type text not null check (timestamp_type in ('bar_open','bar_close')),
  volume_type text not null default 'unknown' check (volume_type in ('tick','real','unknown')),
  format text not null check (format in ('parquet','jsonl','csv')),
  object_key text not null check (
    object_key ~ '^(raw|processed|features|datasets|quarantine|checkpoints|models|manifests|quality-reports)/'
    and object_key !~ '(^/|(^|/)\.\.(/|$))'
  ),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  row_count bigint not null check (row_count > 0),
  start_timestamp timestamptz not null,
  end_timestamp timestamptz not null,
  adapter_version text not null,
  normalization_version text,
  feature_set_version text,
  label_version text,
  quality_status text not null default 'FAIL' check (quality_status in ('PASS','WARN','FAIL')),
  quality_report jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_report) = 'object'),
  ingestion_job_id uuid references public.nova_data_ingestion_jobs(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint nova_dataset_time_range_check check (start_timestamp <= end_timestamp),
  constraint nova_dataset_approval_state_check check (
    status <> 'approved' or (quality_status = 'PASS' and approved_at is not null and approved_by is not null)
  ),
  constraint nova_dataset_object_sha_unique unique (object_key, sha256)
);

create index if not exists nova_datasets_status_created_idx on public.nova_datasets(status, created_at desc);
create index if not exists nova_datasets_instrument_time_idx on public.nova_datasets(instrument, timeframe, start_timestamp, end_timestamp);
create index if not exists nova_datasets_ingestion_job_idx on public.nova_datasets(ingestion_job_id);

create table if not exists public.nova_data_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  dataset_id text references public.nova_datasets(dataset_id) on delete restrict,
  artifact_kind text not null check (artifact_kind in ('raw','normalized','features','labels','split','manifest','quality_report')),
  object_key text not null check (
    object_key ~ '^(raw|processed|features|datasets|quarantine|checkpoints|models|manifests|quality-reports)/'
    and object_key !~ '(^/|(^|/)\.\.(/|$))'
  ),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  content_type text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint nova_data_artifact_object_sha_unique unique (object_key, sha256)
);

create index if not exists nova_data_artifacts_dataset_idx on public.nova_data_artifacts(dataset_id, created_at);

alter table public.nova_data_ingestion_jobs enable row level security;
alter table public.nova_datasets enable row level security;
alter table public.nova_data_artifacts enable row level security;

revoke all on table public.nova_data_ingestion_jobs from public, anon, authenticated;
revoke all on table public.nova_datasets from public, anon, authenticated;
revoke all on table public.nova_data_artifacts from public, anon, authenticated;
grant select, insert, update on table public.nova_data_ingestion_jobs to service_role;
grant select, insert, update on table public.nova_datasets to service_role;
grant select, insert, update on table public.nova_data_artifacts to service_role;

comment on table public.nova_data_ingestion_jobs is 'Backend-only ingestion job ledger. No broker credentials.';
comment on table public.nova_datasets is 'Backend-only immutable dataset catalog. Approval requires passing quality evidence and a trusted reviewer.';
comment on table public.nova_data_artifacts is 'Backend-only R2 artifact index with immutable object keys and SHA-256 checksums.';

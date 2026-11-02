-- Immutable, owner-scoped NOVA market dataset snapshots for QR references.
-- This migration is additive and is NOT applied to any hosted Supabase project by this PR.

create table if not exists public.nova_market_datasets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  symbol text not null check (symbol ~ '^[A-Za-z0-9._-]{1,40}$'),
  timeframe text not null check (timeframe in ('M1','M5','M15','M30','H1','H4','D1')),
  provider text not null check (provider in ('exness_mt5_demo')),
  range_start timestamptz not null,
  range_end timestamptz not null,
  row_count integer not null check (row_count between 3 and 10000),
  numeric_encoding text not null default 'decimal-string' check (numeric_encoding = 'decimal-string'),
  compression text not null default 'gzip' check (compression = 'gzip'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint nova_market_datasets_range_check check (range_end >= range_start),
  constraint nova_market_datasets_id_owner_unique unique (id, owner_id)
);

create index if not exists nova_market_datasets_owner_created_idx
  on public.nova_market_datasets(owner_id, created_at desc);
create index if not exists nova_market_datasets_owner_symbol_idx
  on public.nova_market_datasets(owner_id, symbol, timeframe, created_at desc);

alter table public.nova_market_datasets enable row level security;
revoke all on table public.nova_market_datasets from public, anon;
grant select, insert, update on table public.nova_market_datasets to authenticated;

drop policy if exists nova_market_datasets_select_own on public.nova_market_datasets;
create policy nova_market_datasets_select_own on public.nova_market_datasets
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists nova_market_datasets_insert_own on public.nova_market_datasets;
create policy nova_market_datasets_insert_own on public.nova_market_datasets
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and storage_path like (select auth.uid()::text) || '/%'
    and revoked_at is null
  );

drop policy if exists nova_market_datasets_revoke_own on public.nova_market_datasets;
create policy nova_market_datasets_revoke_own on public.nova_market_datasets
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and storage_path like (select auth.uid()::text) || '/%'
    and revoked_at is not null
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nova-datasets', 'nova-datasets', false, 52428800, array['application/gzip'])
on conflict (id) do nothing;

drop policy if exists nova_dataset_objects_select_own on storage.objects;
create policy nova_dataset_objects_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'nova-datasets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists nova_dataset_objects_insert_own on storage.objects;
create policy nova_dataset_objects_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'nova-datasets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists nova_dataset_objects_delete_own on storage.objects;
create policy nova_dataset_objects_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'nova-datasets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

comment on table public.nova_market_datasets is
  'Private immutable market-data snapshots. QR codes contain only a resolver URL with opaque dataset UUID; exact decimal strings are preserved in compressed object bytes.';

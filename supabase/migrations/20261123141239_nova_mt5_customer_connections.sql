-- NOVA MT5 customer connections isolated from VOOM Studio Affiliate state.
begin;
create table if not exists nova.mt5_broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null default 'exness_mt5' check (provider = 'exness_mt5'),
  environment text not null default 'demo' check (environment = 'demo'),
  status text not null default 'pending' check (status in ('pending', 'connected', 'disabled')),
  account_label text not null default 'Exness MT5 Demo' check (char_length(account_label) between 1 and 80),
  bridge_route_id text unique check (bridge_route_id is null or bridge_route_id ~ '^[A-Za-z0-9_-]{8,100}$'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mt5_broker_connections_user_provider_environment_unique unique (user_id, provider, environment),
  constraint mt5_broker_connections_connected_requires_route check ((status = 'connected' and bridge_route_id is not null) or (status <> 'connected' and bridge_route_id is null))
);
create index if not exists mt5_broker_connections_status_provider_idx on nova.mt5_broker_connections (provider, environment, status);
alter table nova.mt5_broker_connections enable row level security;
revoke all on table nova.mt5_broker_connections from public, anon, authenticated;
grant select, insert on table nova.mt5_broker_connections to authenticated;
grant all on table nova.mt5_broker_connections to service_role;
drop policy if exists mt5_broker_connections_select_own on nova.mt5_broker_connections;
create policy mt5_broker_connections_select_own on nova.mt5_broker_connections for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists mt5_broker_connections_insert_own_pending on nova.mt5_broker_connections;
create policy mt5_broker_connections_insert_own_pending on nova.mt5_broker_connections for insert to authenticated with check (user_id = (select auth.uid()) and provider = 'exness_mt5' and environment = 'demo' and status = 'pending' and bridge_route_id is null);
create or replace function nova.set_mt5_broker_connections_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists mt5_broker_connections_updated_at on nova.mt5_broker_connections;
create trigger mt5_broker_connections_updated_at before update on nova.mt5_broker_connections for each row execute function nova.set_mt5_broker_connections_updated_at();
create or replace view public.nova_broker_connections with (security_invoker = true) as select id, user_id, provider, environment, status, bridge_route_id from nova.mt5_broker_connections;
revoke all on public.nova_broker_connections from public, anon, authenticated;
grant select on public.nova_broker_connections to authenticated;
comment on table nova.mt5_broker_connections is 'NOVA-only Exness MT5 Demo customer connections. Separate from VOOM Studio Affiliate tables.';
comment on view public.nova_broker_connections is 'Narrow security-invoker REST view for NOVA MT5 read-only proxy; owner-scoped by nova.mt5_broker_connections RLS.';
notify pgrst, 'reload schema';
commit;

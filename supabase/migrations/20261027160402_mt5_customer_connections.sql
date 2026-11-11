-- Exness MT5 Demo connection requests with strict per-customer isolation.
create table if not exists public.broker_connections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 provider text not null default 'exness_mt5' check(provider='exness_mt5'),
 environment text not null default 'demo' check(environment='demo'),
 status text not null default 'pending' check(status in ('pending','connected','disabled')),
 account_label text not null default 'Exness MT5 Demo' check(char_length(account_label) between 1 and 80),
 bridge_route_id text unique check(bridge_route_id is null or bridge_route_id ~ '^[A-Za-z0-9_-]{8,100}$'),
 last_verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint broker_connections_user_provider_environment_unique unique(user_id,provider,environment),
 constraint broker_connections_connected_requires_route check((status='connected' and bridge_route_id is not null) or (status<>'connected' and bridge_route_id is null))
);
create index if not exists broker_connections_status_provider_idx on public.broker_connections(provider,environment,status);
alter table public.broker_connections enable row level security;
revoke all on table public.broker_connections from public,anon,authenticated;
grant select,insert on table public.broker_connections to authenticated;
drop policy if exists broker_connections_select_own on public.broker_connections;
create policy broker_connections_select_own on public.broker_connections for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists broker_connections_insert_own_pending on public.broker_connections;
create policy broker_connections_insert_own_pending on public.broker_connections for insert to authenticated with check(user_id=(select auth.uid()) and provider='exness_mt5' and environment='demo' and status='pending' and bridge_route_id is null);
create or replace function public.set_broker_connections_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end;
$$;
drop trigger if exists broker_connections_updated_at on public.broker_connections;
create trigger broker_connections_updated_at before update on public.broker_connections for each row execute function public.set_broker_connections_updated_at();
comment on table public.broker_connections is 'Per-customer Exness MT5 Demo requests. Clients can create pending requests only; trusted admins assign dedicated routes.';
comment on column public.broker_connections.bridge_route_id is 'Unique opaque route key, never a URL or secret; trusted administrators only.';

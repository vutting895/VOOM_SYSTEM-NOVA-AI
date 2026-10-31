-- Add a separate Exness MT5 Live connection environment without changing existing Demo rows.
-- Live connections remain pending until an administrator assigns a unique tenant Bridge route.
-- Client roles still cannot update status, identity, or bridge_route_id.

alter table public.broker_connections
  drop constraint if exists broker_connections_environment_check;

alter table public.broker_connections
  add constraint broker_connections_environment_check
  check (environment in ('demo', 'live'));

drop policy if exists broker_connections_insert_own_pending on public.broker_connections;

create policy broker_connections_insert_own_pending
  on public.broker_connections
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and provider = 'exness_mt5'
    and environment in ('demo', 'live')
    and status = 'pending'
    and bridge_route_id is null
  );

comment on table public.broker_connections is
  'Owner-scoped Exness MT5 Demo and Live connection requests. Clients can create pending requests only; trusted administrators assign unique dedicated Bridge routes.';

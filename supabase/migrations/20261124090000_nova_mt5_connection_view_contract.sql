-- Reconcile the already-applied NOVA MT5 view with the System Hub REST contract.
-- Additive only: no customer rows or base-table data are changed.
begin;

create or replace view public.nova_broker_connections
with (security_invoker = true) as
select
  id,
  user_id,
  provider,
  environment,
  status,
  bridge_route_id,
  account_label,
  last_verified_at,
  created_at
from nova.mt5_broker_connections;

revoke all on public.nova_broker_connections from public, anon, authenticated;
grant select, insert on public.nova_broker_connections to authenticated;

notify pgrst, 'reload schema';
commit;

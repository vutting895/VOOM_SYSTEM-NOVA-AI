-- These tables contain OAuth state and encrypted broker credentials.
-- Keep browser roles explicitly denied; trusted server-side service_role bypasses RLS.
drop policy if exists "deny browser access to alpaca_connections" on public.alpaca_connections;
create policy "deny browser access to alpaca_connections"
on public.alpaca_connections as restrictive
for all to anon, authenticated
using (false) with check (false);

drop policy if exists "deny browser access to alpaca_oauth_states" on public.alpaca_oauth_states;
create policy "deny browser access to alpaca_oauth_states"
on public.alpaca_oauth_states as restrictive
for all to anon, authenticated
using (false) with check (false);

-- Ensure RLS remains enabled on both sensitive tables.
alter table public.alpaca_connections enable row level security;
alter table public.alpaca_oauth_states enable row level security;
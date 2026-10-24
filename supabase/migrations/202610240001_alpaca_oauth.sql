-- Alpaca OAuth integration for Paper Trading only.
-- Tokens are AES-256-GCM encrypted in the Worker before reaching this database.
create table if not exists public.alpaca_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create index if not exists alpaca_oauth_states_expires_at_idx
  on public.alpaca_oauth_states (expires_at);

create table if not exists public.alpaca_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_ciphertext text not null,
  scopes text[] not null default '{}',
  environment text not null default 'paper' check (environment = 'paper'),
  connected_at timestamptz not null default now()
);

alter table public.alpaca_oauth_states enable row level security;
alter table public.alpaca_connections enable row level security;

-- No client-facing RLS policies: browser clients must not read or mutate OAuth state/tokens.
-- The Worker accesses these tables using SUPABASE_SERVICE_ROLE_KEY, held only as a Cloudflare secret.

create or replace function public.consume_alpaca_oauth_state(p_state_hash text)
returns table(user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    delete from public.alpaca_oauth_states s
    where s.state_hash = p_state_hash
      and s.expires_at > now()
    returning s.user_id;
end;
$$;

revoke all on function public.consume_alpaca_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_alpaca_oauth_state(text) to service_role;

-- Periodically remove expired OAuth state records.
create or replace function public.cleanup_expired_alpaca_oauth_states()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.alpaca_oauth_states where expires_at <= now();
$$;
revoke all on function public.cleanup_expired_alpaca_oauth_states() from public, anon, authenticated;
grant execute on function public.cleanup_expired_alpaca_oauth_states() to service_role;

begin;
create extension if not exists pgcrypto;

create table if not exists public.customer_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 account_status text not null default 'active' check(account_status in ('active','suspended','pending','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.trading_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 terminal_id text, broker text, account_label text,
 environment text not null default 'demo' check(environment in ('demo','paper','live')),
 connection_status text not null default 'offline' check(connection_status in ('online','offline','degraded','blocked')),
 last_seen_at timestamptz, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists trading_sessions_user_seen_idx on public.trading_sessions(user_id,last_seen_at desc);

create table if not exists public.strategy_signals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid references public.trading_sessions(id) on delete set null,
 symbol text not null, timeframe text,
 direction text not null check(direction in ('BUY','SELL','HOLD')),
 entry_price numeric, stop_loss numeric, take_profit_1 numeric, take_profit_2 numeric, score numeric,
 source text not null default 'source1', paper_only boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists strategy_signals_user_created_idx on public.strategy_signals(user_id,created_at desc);
create index if not exists strategy_signals_symbol_created_idx on public.strategy_signals(symbol,created_at desc);

create table if not exists public.risk_guard_decisions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 signal_id uuid references public.strategy_signals(id) on delete set null,
 decision text not null check(decision in ('approved','rejected','review','paper_only')),
 reason_code text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists risk_guard_created_idx on public.risk_guard_decisions(created_at desc);

create table if not exists public.security_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 severity text not null check(severity in ('info','low','medium','high','critical')),
 event_type text not null, source text not null default 'backend', ip_hash text, request_id text,
 summary text not null, details jsonb not null default '{}'::jsonb,
 acknowledged_at timestamptz, acknowledged_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists security_events_created_idx on public.security_events(created_at desc);
create index if not exists security_events_severity_created_idx on public.security_events(severity,created_at desc);
create index if not exists security_events_user_created_idx on public.security_events(user_id,created_at desc);

create table if not exists public.system_heartbeats (
 component text primary key,
 status text not null default 'unknown' check(status in ('healthy','degraded','offline','unknown')),
 last_seen_at timestamptz not null default now(), details jsonb not null default '{}'::jsonb
);

create or replace function public.voom_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists customer_profiles_updated_at on public.customer_profiles;
create trigger customer_profiles_updated_at before update on public.customer_profiles
for each row execute function public.voom_set_updated_at();
drop trigger if exists trading_sessions_updated_at on public.trading_sessions;
create trigger trading_sessions_updated_at before update on public.trading_sessions
for each row execute function public.voom_set_updated_at();

-- Create a minimal profile when a new Supabase Auth user is created.
create or replace function public.voom_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.customer_profiles(user_id, display_name)
 values (new.id, nullif(new.raw_user_meta_data ->> 'display_name',''))
 on conflict (user_id) do nothing;
 return new;
end;
$$;
drop trigger if exists voom_auth_user_created on auth.users;
create trigger voom_auth_user_created after insert on auth.users
for each row execute function public.voom_handle_new_auth_user();

alter table public.customer_profiles enable row level security;
alter table public.trading_sessions enable row level security;
alter table public.strategy_signals enable row level security;
alter table public.risk_guard_decisions enable row level security;
alter table public.security_events enable row level security;
alter table public.system_heartbeats enable row level security;

drop policy if exists "profile owner can read own profile" on public.customer_profiles;
create policy "profile owner can read own profile" on public.customer_profiles
for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "profile owner can update own profile" on public.customer_profiles;
create policy "profile owner can update own profile" on public.customer_profiles
for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists "session owner can read own sessions" on public.trading_sessions;
create policy "session owner can read own sessions" on public.trading_sessions
for select to authenticated using((select auth.uid())=user_id);
drop policy if exists "signal owner can read own signals" on public.strategy_signals;
create policy "signal owner can read own signals" on public.strategy_signals
for select to authenticated using((select auth.uid())=user_id);

-- Private backend-only tables: no direct browser-role access.
revoke all on public.risk_guard_decisions from anon,authenticated;
revoke all on public.security_events from anon,authenticated;
revoke all on public.system_heartbeats from anon,authenticated;
revoke insert,update,delete on public.customer_profiles from anon,authenticated;
revoke insert,update,delete on public.trading_sessions from anon,authenticated;
revoke insert,update,delete on public.strategy_signals from anon,authenticated;
grant select on public.customer_profiles to authenticated;
grant update(display_name) on public.customer_profiles to authenticated;
grant select on public.trading_sessions to authenticated;
grant select on public.strategy_signals to authenticated;
commit;

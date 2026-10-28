-- AI Marketplace foundation. Apply manually after reviewing in Supabase SQL Editor.
-- No client writes, no order execution, and no automatic approval of new strategies.
begin;

create table if not exists public.ai_strategies (
  id uuid primary key default gen_random_uuid(),
  strategy_key text not null unique,
  display_name text not null,
  version text not null,
  description text not null default '',
  supported_symbols text[] not null default '{}',
  supported_timeframes text[] not null default '{}',
  risk_profile text not null default 'moderate'
    check (risk_profile in ('conservative','moderate','aggressive')),
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in ('draft','testing','paper_ready','approved','suspended','retired')),
  trading_mode text not null default 'paper'
    check (trading_mode in ('paper','demo','live')),
  backtest_passed boolean not null default false,
  out_of_sample_passed boolean not null default false,
  demo_passed boolean not null default false,
  risk_review_passed boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lifecycle_status <> 'approved' or
    (backtest_passed and out_of_sample_passed and demo_passed and risk_review_passed
      and approved_by is not null and approved_at is not null)),
  check (trading_mode <> 'live' or lifecycle_status = 'approved')
);
create index if not exists ai_strategies_status_idx
  on public.ai_strategies(lifecycle_status, updated_at desc);

create table if not exists public.customer_ai_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.ai_strategies(id) on delete restrict,
  strategy_version text not null,
  account_session_id uuid references public.trading_sessions(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','paper_active','demo_active','paused','revoked')),
  risk_profile text not null default 'moderate'
    check (risk_profile in ('conservative','moderate','aggressive')),
  approved_for_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, strategy_id, account_session_id)
);
create index if not exists customer_ai_subscriptions_user_status_idx
  on public.customer_ai_subscriptions(user_id, status);

create table if not exists public.signal_delivery_log (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.strategy_signals(id) on delete cascade,
  subscription_id uuid not null references public.customer_ai_subscriptions(id) on delete cascade,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued','sent_to_ea','acknowledged','rejected','failed','duplicate_blocked')),
  idempotency_key text not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists signal_delivery_status_idx
  on public.signal_delivery_log(delivery_status, created_at desc);

-- Explicitly private: browser roles cannot read/write marketplace, subscription, or delivery rows directly.
alter table public.ai_strategies enable row level security;
alter table public.customer_ai_subscriptions enable row level security;
alter table public.signal_delivery_log enable row level security;
revoke all on public.ai_strategies from anon, authenticated;
revoke all on public.customer_ai_subscriptions from anon, authenticated;
revoke all on public.signal_delivery_log from anon, authenticated;

commit;

create table if not exists public.customer_ai_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 strategy_id uuid not null references public.ai_strategies(id) on delete restrict,
 strategy_version text not null,
 account_session_id uuid references public.trading_sessions(id) on delete set null,
 status text not null default 'pending' check (status in ('pending','paper_active','demo_active','paused','revoked')),
 risk_profile text not null default 'moderate' check (risk_profile in ('conservative','moderate','aggressive')),
 approved_for_live boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, strategy_id, account_session_id)
);
create index if not exists customer_ai_subscriptions_user_status_idx on public.customer_ai_subscriptions(user_id, status);
alter table public.customer_ai_subscriptions enable row level security;
revoke all on public.customer_ai_subscriptions from anon, authenticated;

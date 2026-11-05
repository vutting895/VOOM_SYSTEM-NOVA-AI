create table if not exists public.ai_strategies (
 id uuid primary key default gen_random_uuid(),
 strategy_key text not null unique,
 display_name text not null,
 version text not null,
 description text not null default '',
 supported_symbols text[] not null default '{}',
 supported_timeframes text[] not null default '{}',
 risk_profile text not null default 'moderate' check (risk_profile in ('conservative','moderate','aggressive')),
 lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft','testing','paper_ready','approved','suspended','retired')),
 trading_mode text not null default 'paper' check (trading_mode in ('paper','demo','live')),
 backtest_passed boolean not null default false,
 out_of_sample_passed boolean not null default false,
 demo_passed boolean not null default false,
 risk_review_passed boolean not null default false,
 approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (lifecycle_status <> 'approved' or (backtest_passed and out_of_sample_passed and demo_passed and risk_review_passed and approved_by is not null and approved_at is not null)),
 check (trading_mode <> 'live' or lifecycle_status = 'approved')
);
create index if not exists ai_strategies_status_idx on public.ai_strategies(lifecycle_status, updated_at desc);
alter table public.ai_strategies enable row level security;
revoke all on public.ai_strategies from anon, authenticated;
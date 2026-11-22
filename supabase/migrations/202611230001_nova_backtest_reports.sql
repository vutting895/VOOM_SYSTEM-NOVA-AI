-- Owner-scoped storage for NOVA backtest simulation reports.
-- Apply only to a reviewed Supabase preview first; this file does not modify any database by itself.
create table if not exists public.nova_backtest_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  strategy_id text not null check (char_length(strategy_id) between 1 and 64),
  symbol text not null check (char_length(symbol) between 1 and 32),
  timeframe text not null check (char_length(timeframe) between 1 and 16),
  historical_period text not null check (historical_period in ('3M', '6M', '1Y', '2Y', 'All')),
  initial_balance numeric not null check (initial_balance >= 0),
  final_balance numeric not null,
  net_profit numeric not null,
  profit_factor numeric,
  win_rate_pct numeric,
  max_drawdown_pct numeric,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists nova_backtest_reports_owner_created_idx
  on public.nova_backtest_reports (user_id, created_at desc);

alter table public.nova_backtest_reports enable row level security;
revoke all on table public.nova_backtest_reports from public, anon, authenticated;
grant select, insert on table public.nova_backtest_reports to authenticated;

drop policy if exists nova_backtest_reports_select_own on public.nova_backtest_reports;
create policy nova_backtest_reports_select_own
  on public.nova_backtest_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists nova_backtest_reports_insert_own on public.nova_backtest_reports;
create policy nova_backtest_reports_insert_own
  on public.nova_backtest_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));

comment on table public.nova_backtest_reports is
  'Owner-scoped read-only research reports. Stored result payloads must retain their simulation/data provenance notice.';

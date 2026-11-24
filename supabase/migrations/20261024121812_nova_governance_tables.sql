
-- Strategy versions: immutable spec + lineage (LLM / auto-learning / human)
create table public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.ai_strategies(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  spec jsonb not null,
  spec_hash text not null,
  origin text not null check (origin in ('human','llm_generate','auto_learn')),
  parent_version_id uuid references public.strategy_versions(id) on delete set null,
  llm_model text,
  generation_prompt text,
  status text not null default 'candidate'
    check (status in ('candidate','testing','passed','failed','active','retired')),
  created_at timestamptz not null default now(),
  unique (strategy_id, version_no),
  unique (strategy_id, spec_hash)
);
create index strategy_versions_parent_idx on public.strategy_versions (parent_version_id);

create or replace function private.strategy_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.spec is distinct from old.spec
     or new.spec_hash is distinct from old.spec_hash
     or new.version_no is distinct from old.version_no
     or new.strategy_id is distinct from old.strategy_id
     or new.origin is distinct from old.origin then
    raise exception 'strategy_versions: spec and lineage are immutable';
  end if;
  return new;
end;
$$;

create trigger strategy_versions_immutable
before update on public.strategy_versions
for each row execute function private.strategy_versions_immutable();

-- Backtest runs (real engine output; in-sample / out-of-sample / walk-forward)
create table public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  strategy_version_id uuid not null references public.strategy_versions(id) on delete cascade,
  kind text not null check (kind in ('in_sample','out_of_sample','walk_forward')),
  symbol text not null,
  timeframe text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  trades_count integer not null check (trades_count >= 0),
  win_rate numeric(6,4) check (win_rate between 0 and 1),
  profit_factor numeric(10,4),
  sharpe numeric(10,4),
  max_drawdown_pct numeric(8,4) check (max_drawdown_pct >= 0),
  net_return_pct numeric(12,4),
  expectancy_r numeric(10,4),
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index backtest_runs_version_idx on public.backtest_runs (strategy_version_id, kind);

-- Quality gate: configurable thresholds per stage + audited results
create table public.quality_gate_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  stage text not null check (stage in ('backtest_to_paper','paper_to_demo','demo_to_live')),
  thresholds jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index quality_gate_configs_one_active_per_stage
  on public.quality_gate_configs (stage) where active;

create table public.quality_gate_results (
  id uuid primary key default gen_random_uuid(),
  strategy_version_id uuid not null references public.strategy_versions(id) on delete cascade,
  config_id uuid not null references public.quality_gate_configs(id) on delete restrict,
  stage text not null check (stage in ('backtest_to_paper','paper_to_demo','demo_to_live')),
  passed boolean not null,
  score numeric(6,2),
  checks jsonb not null,
  evaluated_by text not null default 'gate_worker',
  created_at timestamptz not null default now()
);
create index quality_gate_results_version_idx on public.quality_gate_results (strategy_version_id, stage);
create index quality_gate_results_config_idx on public.quality_gate_results (config_id);

-- Auto-learning loop events
create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.ai_strategies(id) on delete cascade,
  strategy_version_id uuid references public.strategy_versions(id) on delete set null,
  event_type text not null check (event_type in (
    'drift_detected','refinement_proposed','refinement_rejected',
    'version_promoted','version_demoted','strategy_suspended','strategy_retired')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index learning_events_strategy_idx on public.learning_events (strategy_id, created_at desc);
create index learning_events_version_idx on public.learning_events (strategy_version_id);

-- MCP tool call audit trail
create table public.mcp_tool_audit (
  id uuid primary key default gen_random_uuid(),
  tool_name text not null,
  caller text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  ok boolean not null,
  error_code text,
  duration_ms integer check (duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index mcp_tool_audit_created_idx on public.mcp_tool_audit (created_at desc);
create index mcp_tool_audit_tool_idx on public.mcp_tool_audit (tool_name, created_at desc);
create index mcp_tool_audit_actor_idx on public.mcp_tool_audit (actor_user_id);

-- Global switches (kill switch, live trading gate)
create table public.system_controls (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index system_controls_updated_by_idx on public.system_controls (updated_by);

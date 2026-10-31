
alter table public.strategy_versions enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.quality_gate_configs enable row level security;
alter table public.quality_gate_results enable row level security;
alter table public.learning_events enable row level security;
alter table public.mcp_tool_audit enable row level security;
alter table public.system_controls enable row level security;

create policy strategy_versions_read_staff_only on public.strategy_versions
  for select to authenticated using ((select private.is_active_staff()));
create policy backtest_runs_read_staff_only on public.backtest_runs
  for select to authenticated using ((select private.is_active_staff()));
create policy quality_gate_configs_read_staff_only on public.quality_gate_configs
  for select to authenticated using ((select private.is_active_staff()));
create policy quality_gate_results_read_staff_only on public.quality_gate_results
  for select to authenticated using ((select private.is_active_staff()));
create policy learning_events_read_staff_only on public.learning_events
  for select to authenticated using ((select private.is_active_staff()));
create policy mcp_tool_audit_read_staff_only on public.mcp_tool_audit
  for select to authenticated using ((select private.is_active_staff()));
create policy system_controls_read_staff_only on public.system_controls
  for select to authenticated using ((select private.is_active_staff()));

revoke all on public.strategy_versions, public.backtest_runs, public.quality_gate_configs,
  public.quality_gate_results, public.learning_events, public.mcp_tool_audit,
  public.system_controls from anon;
revoke insert, update, delete, truncate, references, trigger on public.strategy_versions,
  public.backtest_runs, public.quality_gate_configs, public.quality_gate_results,
  public.learning_events, public.mcp_tool_audit, public.system_controls from authenticated;

-- Safe defaults: nothing live, kill switch disengaged
insert into public.system_controls (key, value) values
  ('global_kill_switch', 'false'::jsonb),
  ('live_trading_enabled', 'false'::jsonb),
  ('llm_strategy_generation_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Default gate thresholds (starting point; tune before relying on them)
insert into public.quality_gate_configs (name, stage, thresholds, active) values
  ('default_backtest_to_paper_v1', 'backtest_to_paper', '{
    "min_oos_trades": 100,
    "min_oos_profit_factor": 1.3,
    "min_oos_sharpe": 1.0,
    "max_drawdown_pct": 15,
    "min_oos_to_is_sharpe_ratio": 0.6,
    "require_walk_forward": true,
    "require_costs_modelled": true
  }'::jsonb, true),
  ('default_paper_to_demo_v1', 'paper_to_demo', '{
    "min_days": 14,
    "min_trades": 30,
    "max_drawdown_pct": 10,
    "min_profit_factor": 1.2
  }'::jsonb, true),
  ('default_demo_to_live_v1', 'demo_to_live', '{
    "min_days": 30,
    "min_trades": 50,
    "max_drawdown_pct": 10,
    "min_profit_factor": 1.2,
    "require_human_approval": true,
    "require_risk_review": true
  }'::jsonb, true)
on conflict (name) do nothing;

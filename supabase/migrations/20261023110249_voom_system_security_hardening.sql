begin;
-- Trigger functions are not RPC endpoints; only PostgreSQL's trigger machinery should invoke this function.
revoke all on function public.voom_handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.voom_set_updated_at() from public, anon, authenticated;

-- Cover foreign-key lookups used when referenced rows are deleted/updated.
create index if not exists risk_guard_decisions_signal_id_idx on public.risk_guard_decisions(signal_id);
create index if not exists risk_guard_decisions_user_id_idx on public.risk_guard_decisions(user_id);
create index if not exists security_events_acknowledged_by_idx on public.security_events(acknowledged_by);
create index if not exists strategy_signals_session_id_idx on public.strategy_signals(session_id);
commit;
-- Security/performance follow-up applied to Supabase project Voom_system.
-- Keeps the combined owner-or-active-staff SELECT policy and removes the redundant owner-only policy.
begin;

drop policy if exists "profile owner can read own profile" on public.customer_profiles;

-- Cover foreign keys flagged by the Supabase performance advisor.
create index if not exists ai_strategies_approved_by_idx
  on public.ai_strategies (approved_by);
create index if not exists customer_ai_subscriptions_account_session_id_idx
  on public.customer_ai_subscriptions (account_session_id);
create index if not exists customer_ai_subscriptions_strategy_id_idx
  on public.customer_ai_subscriptions (strategy_id);
create index if not exists signal_delivery_log_signal_id_idx
  on public.signal_delivery_log (signal_id);
create index if not exists signal_delivery_log_subscription_id_idx
  on public.signal_delivery_log (subscription_id);

-- Customer clients may edit display_name only, never role or account_status.
revoke update on public.customer_profiles from anon, authenticated;
grant update (display_name) on public.customer_profiles to authenticated;

commit;

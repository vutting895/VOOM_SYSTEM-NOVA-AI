create or replace function public.voom_marketplace_list_strategies()
returns table (
 id uuid, strategy_key text, display_name text, version text, description text,
 supported_symbols text[], supported_timeframes text[], risk_profile text,
 lifecycle_status text, trading_mode text, backtest_passed boolean,
 out_of_sample_passed boolean, demo_passed boolean, risk_review_passed boolean,
 approved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.customer_profiles p
    where p.user_id = v_user_id and p.account_status = 'active' and p.role = 'customer'
  ) then
    raise exception 'active_customer_required' using errcode = '42501';
  end if;
  return query
  select s.id, s.strategy_key, s.display_name, s.version, s.description,
         s.supported_symbols, s.supported_timeframes, s.risk_profile,
         s.lifecycle_status, s.trading_mode, s.backtest_passed,
         s.out_of_sample_passed, s.demo_passed, s.risk_review_passed, s.approved_at
  from public.ai_strategies s
  where s.lifecycle_status = 'approved'
    and s.trading_mode in ('paper','demo')
    and s.backtest_passed and s.out_of_sample_passed
    and s.demo_passed and s.risk_review_passed
  order by s.updated_at desc
  limit 100;
end;
$$;
revoke all on function public.voom_marketplace_list_strategies() from public, anon;
grant execute on function public.voom_marketplace_list_strategies() to authenticated;

create or replace function public.voom_marketplace_my_subscriptions()
returns table (
 id uuid, strategy_id uuid, strategy_version text, account_session_id uuid,
 status text, risk_profile text, approved_for_live boolean,
 created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.customer_profiles p
    where p.user_id = v_user_id and p.account_status = 'active' and p.role = 'customer'
  ) then
    raise exception 'active_customer_required' using errcode = '42501';
  end if;
  return query
  select sub.id, sub.strategy_id, sub.strategy_version, sub.account_session_id,
         sub.status, sub.risk_profile, sub.approved_for_live, sub.created_at, sub.updated_at
  from public.customer_ai_subscriptions sub
  where sub.user_id = v_user_id
  order by sub.created_at desc
  limit 100;
end;
$$;
revoke all on function public.voom_marketplace_my_subscriptions() from public, anon;
grant execute on function public.voom_marketplace_my_subscriptions() to authenticated;

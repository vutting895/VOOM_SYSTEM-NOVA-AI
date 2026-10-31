create or replace function public.voom_marketplace_subscribe(
 p_strategy_id uuid,
 p_account_session_id uuid default null,
 p_risk_profile text default 'moderate'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_user_id uuid := auth.uid();
 v_strategy public.ai_strategies%rowtype;
 v_session public.trading_sessions%rowtype;
 v_existing public.customer_ai_subscriptions%rowtype;
 v_new public.customer_ai_subscriptions%rowtype;
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
 if p_risk_profile not in ('conservative','moderate','aggressive') then
   raise exception 'invalid_risk_profile' using errcode = '22023';
 end if;
 select * into v_strategy from public.ai_strategies s
 where s.id = p_strategy_id and s.lifecycle_status = 'approved'
   and s.trading_mode in ('paper','demo')
   and s.backtest_passed and s.out_of_sample_passed
   and s.demo_passed and s.risk_review_passed;
 if not found then
   raise exception 'strategy_not_approved_for_paper_or_demo' using errcode = '42501';
 end if;
 if p_account_session_id is not null then
   select * into v_session from public.trading_sessions t
   where t.id = p_account_session_id and t.user_id = v_user_id;
   if not found then
     raise exception 'session_not_owned_by_customer' using errcode = '42501';
   end if;
   if v_session.environment = 'live' then
     raise exception 'live_sessions_not_supported' using errcode = '42501';
   end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_strategy_id::text || ':' || coalesce(p_account_session_id::text,'no-session'), 0));
 select * into v_existing from public.customer_ai_subscriptions sub
 where sub.user_id = v_user_id and sub.strategy_id = p_strategy_id
   and sub.account_session_id is not distinct from p_account_session_id
   and sub.status in ('pending','paper_active','demo_active')
 limit 1;
 if found then
   raise exception 'subscription_already_active' using errcode = '23505';
 end if;
 insert into public.customer_ai_subscriptions(
   user_id,strategy_id,strategy_version,account_session_id,status,risk_profile,approved_for_live
 ) values (
   v_user_id,v_strategy.id,v_strategy.version,p_account_session_id,'paper_active',p_risk_profile,false
 ) returning * into v_new;
 return jsonb_build_object(
   'id',v_new.id,'strategy_id',v_new.strategy_id,'strategy_version',v_new.strategy_version,
   'account_session_id',v_new.account_session_id,'status',v_new.status,
   'risk_profile',v_new.risk_profile,'approved_for_live',false,
   'mode','paper_only','order_execution','disabled'
 );
end;
$$;
revoke all on function public.voom_marketplace_subscribe(uuid,uuid,text) from public, anon;
grant execute on function public.voom_marketplace_subscribe(uuid,uuid,text) to authenticated;

create or replace function public.voom_marketplace_pause(p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_user_id uuid := auth.uid();
 v_updated public.customer_ai_subscriptions%rowtype;
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
 update public.customer_ai_subscriptions sub
 set status = 'paused', updated_at = now()
 where sub.id = p_subscription_id and sub.user_id = v_user_id
   and sub.status in ('pending','paper_active','demo_active')
 returning * into v_updated;
 if not found then
   raise exception 'active_subscription_not_found' using errcode = 'P0002';
 end if;
 return jsonb_build_object('id',v_updated.id,'status',v_updated.status,
   'mode','paper_only','order_execution','disabled');
end;
$$;
revoke all on function public.voom_marketplace_pause(uuid) from public, anon;
grant execute on function public.voom_marketplace_pause(uuid) to authenticated;

-- Register Source 1 in the marketplace as a non-customer-visible test candidate.
-- This intentionally sets no validation flags and grants no customer/live entitlement.
insert into public.ai_strategies (
  strategy_key, display_name, version, description,
  supported_symbols, supported_timeframes, risk_profile,
  lifecycle_status, trading_mode,
  backtest_passed, out_of_sample_passed, demo_passed, risk_review_passed
)
values (
  'source1-mean-rejection-smc-wave-v6-2',
  'Source 1 Mean Rejection SMC Wave',
  '6.2-test.1',
  'Source 1 authoritative entry/exit strategy. Research registration only; not validated for customer use. The local strategy API returns candidate/HOLD only and does not execute orders.',
  array['GOLD','XAUUSD','EURUSD'],
  array['M15'],
  'moderate',
  'testing',
  'paper',
  false, false, false, false
)
on conflict (strategy_key) do nothing;

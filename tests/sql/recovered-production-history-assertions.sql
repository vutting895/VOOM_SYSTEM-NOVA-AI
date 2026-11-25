DO $$
DECLARE
  expected text[] := ARRAY[
    'customer_profiles','trading_sessions','strategy_signals','risk_guard_decisions',
    'security_events','system_heartbeats','ai_strategies','customer_ai_subscriptions',
    'signal_delivery_log','strategy_versions','backtest_runs','quality_gate_configs',
    'quality_gate_results','learning_events','mcp_tool_audit','system_controls',
    'alpaca_oauth_states','alpaca_connections','broker_connections'
  ];
  missing text[];
  rls_count integer;
  migration_count integer;
BEGIN
  SELECT array_agg(t.name ORDER BY t.name) INTO missing
  FROM unnest(expected) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'production replay missing public tables: %', missing;
  END IF;

  SELECT count(*) INTO rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND c.relname = ANY(expected) AND c.relrowsecurity;
  IF rls_count <> cardinality(expected) THEN
    RAISE EXCEPTION 'production replay RLS mismatch: expected %, got %', cardinality(expected), rls_count;
  END IF;

  SELECT count(*) INTO migration_count FROM supabase_migrations.schema_migrations;
  IF migration_count <> 24 THEN
    RAISE EXCEPTION 'production replay migration count mismatch: expected 24, got %', migration_count;
  END IF;

  IF to_regprocedure('private.is_active_staff()') IS NULL
     OR to_regprocedure('public.voom_marketplace_list_strategies()') IS NULL
     OR to_regprocedure('public.voom_marketplace_subscribe(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.voom_marketplace_pause(uuid)') IS NULL
     OR to_regprocedure('public.consume_alpaca_oauth_state(text)') IS NULL THEN
    RAISE EXCEPTION 'production replay missing critical functions';
  END IF;
END $$;

SELECT 'production recovered migration replay assertions passed' AS result;

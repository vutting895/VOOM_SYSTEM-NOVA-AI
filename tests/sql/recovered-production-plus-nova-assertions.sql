DO $$
DECLARE
  expected text[] := ARRAY[
    'customer_profiles','trading_sessions','strategy_signals','risk_guard_decisions',
    'security_events','system_heartbeats','ai_strategies','customer_ai_subscriptions',
    'signal_delivery_log','strategy_versions','backtest_runs','quality_gate_configs',
    'quality_gate_results','learning_events','mcp_tool_audit','system_controls',
    'alpaca_oauth_states','alpaca_connections','broker_connections',
    'nova_agent_threads','nova_approval_requests'
  ];
  missing text[];
  rls_count integer;
  table_count integer;
  migration_count integer;
  approval_policies integer;
BEGIN
  SELECT array_agg(t.name ORDER BY t.name) INTO missing
  FROM unnest(expected) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'production-plus-NOVA replay missing tables: %', missing;
  END IF;

  SELECT count(*) INTO table_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY(expected);
  IF table_count <> cardinality(expected) THEN
    RAISE EXCEPTION 'production-plus-NOVA table count mismatch: expected %, got %', cardinality(expected), table_count;
  END IF;

  SELECT count(*) INTO rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND c.relname = ANY(expected) AND c.relrowsecurity;
  IF rls_count <> cardinality(expected) THEN
    RAISE EXCEPTION 'production-plus-NOVA RLS mismatch: expected %, got %', cardinality(expected), rls_count;
  END IF;

  SELECT count(*) INTO migration_count FROM supabase_migrations.schema_migrations;
  IF migration_count <> 25 THEN
    RAISE EXCEPTION 'production-plus-NOVA migration count mismatch: expected 25, got %', migration_count;
  END IF;

  SELECT count(*) INTO approval_policies
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('nova_agent_threads','nova_approval_requests');
  IF approval_policies <> 3 THEN
    RAISE EXCEPTION 'approval policy count mismatch: expected 3, got %', approval_policies;
  END IF;

  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL
     OR to_regprocedure('public.nova_create_approval(uuid,text,jsonb,text,text,timestamp with time zone)') IS NULL
     OR to_regprocedure('public.nova_resolve_approval(uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('private.nova_create_approval_impl(uuid,text,jsonb,text,text,timestamp with time zone)') IS NULL
     OR to_regprocedure('private.nova_resolve_approval_impl(uuid,text,text,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'production-plus-NOVA replay missing digest or approval RPCs';
  END IF;

  IF has_function_privilege('anon','public.nova_create_approval(uuid,text,jsonb,text,text,timestamp with time zone)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.nova_create_approval(uuid,text,jsonb,text,text,timestamp with time zone)','EXECUTE') THEN
    RAISE EXCEPTION 'approval RPC grants are not least-privilege';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.nova_create_approval(uuid,text,jsonb,text,text,timestamp with time zone)'))
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('private.nova_create_approval_impl(uuid,text,jsonb,text,text,timestamp with time zone)')) THEN
    RAISE EXCEPTION 'approval wrapper/implementation security mode mismatch';
  END IF;
END $$;

SELECT 'production plus NOVA approval forward migration replay assertions passed' AS result;

-- Keep the public PostgREST RPCs as SECURITY INVOKER wrappers.
-- The actual privileged implementations stay in the non-exposed private schema.
-- This preserves the existing authenticated marketplace behavior without exposing
-- SECURITY DEFINER implementation functions through /rest/v1/rpc.

CREATE SCHEMA IF NOT EXISTS private;

ALTER FUNCTION public.voom_marketplace_list_strategies()
  SET SCHEMA private;
ALTER FUNCTION private.voom_marketplace_list_strategies()
  RENAME TO voom_marketplace_list_strategies_impl;

ALTER FUNCTION public.voom_marketplace_my_subscriptions()
  SET SCHEMA private;
ALTER FUNCTION private.voom_marketplace_my_subscriptions()
  RENAME TO voom_marketplace_my_subscriptions_impl;

ALTER FUNCTION public.voom_marketplace_pause(uuid)
  SET SCHEMA private;
ALTER FUNCTION private.voom_marketplace_pause(uuid)
  RENAME TO voom_marketplace_pause_impl;

ALTER FUNCTION public.voom_marketplace_subscribe(uuid, uuid, text)
  SET SCHEMA private;
ALTER FUNCTION private.voom_marketplace_subscribe(uuid, uuid, text)
  RENAME TO voom_marketplace_subscribe_impl;

-- Tighten the staff helper's search_path. All objects in its body are
-- already schema-qualified (auth.uid(), public.customer_profiles).
ALTER FUNCTION private.is_active_staff()
  SET search_path TO pg_catalog;

-- Preserve the existing server-side privilege model while preventing anonymous
-- invocation. private is intentionally not part of the PostgREST exposed schemas.
REVOKE USAGE ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.voom_marketplace_list_strategies_impl()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.voom_marketplace_my_subscriptions_impl()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.voom_marketplace_pause_impl(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.voom_marketplace_subscribe_impl(uuid, uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_active_staff()
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.voom_marketplace_list_strategies_impl()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.voom_marketplace_my_subscriptions_impl()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.voom_marketplace_pause_impl(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.voom_marketplace_subscribe_impl(uuid, uuid, text)
  TO authenticated, service_role;

-- Read-only catalog wrapper. The private implementation still verifies that the
-- caller is an active customer and returns only approved paper/demo strategies.
CREATE FUNCTION public.voom_marketplace_list_strategies()
RETURNS TABLE(
  id uuid,
  strategy_key text,
  display_name text,
  version text,
  description text,
  supported_symbols text[],
  supported_timeframes text[],
  risk_profile text,
  lifecycle_status text,
  trading_mode text,
  backtest_passed boolean,
  out_of_sample_passed boolean,
  demo_passed boolean,
  risk_review_passed boolean,
  approved_at timestamp with time zone
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.voom_marketplace_list_strategies_impl();
$function$;

-- Read-only subscription wrapper. The implementation scopes rows to auth.uid().
CREATE FUNCTION public.voom_marketplace_my_subscriptions()
RETURNS TABLE(
  id uuid,
  strategy_id uuid,
  strategy_version text,
  account_session_id uuid,
  status text,
  risk_profile text,
  approved_for_live boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.voom_marketplace_my_subscriptions_impl();
$function$;

-- Mutation RPCs retain their existing database-side ownership and state checks.
-- These wrappers do not add any trading or broker-order functionality.
CREATE FUNCTION public.voom_marketplace_pause(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.voom_marketplace_pause_impl(p_subscription_id);
$function$;

CREATE FUNCTION public.voom_marketplace_subscribe(
  p_strategy_id uuid,
  p_account_session_id uuid DEFAULT NULL::uuid,
  p_risk_profile text DEFAULT 'moderate'::text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.voom_marketplace_subscribe_impl(
    p_strategy_id,
    p_account_session_id,
    p_risk_profile
  );
$function$;

-- Functions created in public inherit EXECUTE for PUBLIC by default in PostgreSQL;
-- explicitly remove that default exposure and grant the intended API roles only.
REVOKE ALL ON FUNCTION public.voom_marketplace_list_strategies()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voom_marketplace_my_subscriptions()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voom_marketplace_pause(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voom_marketplace_subscribe(uuid, uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.voom_marketplace_list_strategies()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voom_marketplace_my_subscriptions()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voom_marketplace_pause(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voom_marketplace_subscribe(uuid, uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.voom_marketplace_list_strategies() IS
  'SECURITY INVOKER API wrapper; privileged implementation is isolated in the non-exposed private schema.';
COMMENT ON FUNCTION public.voom_marketplace_my_subscriptions() IS
  'SECURITY INVOKER API wrapper; privileged implementation is isolated in the non-exposed private schema.';
COMMENT ON FUNCTION public.voom_marketplace_pause(uuid) IS
  'SECURITY INVOKER API wrapper; privileged implementation enforces owner and state checks in the non-exposed private schema.';
COMMENT ON FUNCTION public.voom_marketplace_subscribe(uuid, uuid, text) IS
  'SECURITY INVOKER API wrapper; privileged implementation enforces owner and paper/demo approval checks in the non-exposed private schema.';

NOTIFY pgrst, 'reload schema';

-- Durable owner-scoped aggregate profit target settings and audit.
-- This migration stores configuration only. It does not grant broker execution capability.

CREATE TABLE IF NOT EXISTS public.nova_aggregate_profit_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_connection_id uuid NOT NULL REFERENCES public.broker_connections(id) ON DELETE CASCADE,
  target_usd numeric(12,2) NOT NULL DEFAULT 100.00
    CHECK (target_usd > 0 AND target_usd <= 1000000.00),
  pending_target_usd numeric(12,2)
    CHECK (pending_target_usd IS NULL OR (pending_target_usd > 0 AND pending_target_usd <= 1000000.00)),
  config_version bigint NOT NULL DEFAULT 1 CHECK (config_version > 0),
  pending_config_version bigint
    CHECK (pending_config_version IS NULL OR pending_config_version > config_version),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nova_aggregate_profit_settings_owner_connection_unique
    UNIQUE (user_id, broker_connection_id),
  CONSTRAINT nova_aggregate_profit_pending_version_pair
    CHECK ((pending_target_usd IS NULL) = (pending_config_version IS NULL))
);

CREATE TABLE IF NOT EXISTS public.nova_aggregate_profit_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_connection_id uuid NOT NULL REFERENCES public.broker_connections(id) ON DELETE CASCADE,
  config_version bigint NOT NULL CHECK (config_version > 0),
  target_usd numeric(12,2) NOT NULL CHECK (target_usd > 0 AND target_usd <= 1000000.00),
  state text NOT NULL CHECK (state IN (
    'TRIGGERED', 'CLOSING', 'RECONCILING', 'COMPLETED', 'PARTIAL_OR_BLOCKED'
  )),
  position_ids_snapshot jsonb NOT NULL CHECK (jsonb_typeof(position_ids_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT nova_aggregate_profit_cycle_owner_connection_fk
    FOREIGN KEY (user_id, broker_connection_id)
    REFERENCES public.nova_aggregate_profit_settings(user_id, broker_connection_id)
    ON DELETE CASCADE,
  CONSTRAINT nova_aggregate_profit_cycle_completion_consistent
    CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS nova_aggregate_profit_one_active_cycle
  ON public.nova_aggregate_profit_cycles(user_id, broker_connection_id)
  WHERE state IN ('TRIGGERED', 'CLOSING', 'RECONCILING', 'PARTIAL_OR_BLOCKED');

CREATE INDEX IF NOT EXISTS nova_aggregate_profit_cycles_owner_created_idx
  ON public.nova_aggregate_profit_cycles(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.nova_aggregate_profit_target_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_connection_id uuid NOT NULL REFERENCES public.broker_connections(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  old_target_usd numeric(12,2) NOT NULL CHECK (old_target_usd > 0 AND old_target_usd <= 1000000.00),
  requested_target_usd numeric(12,2) NOT NULL CHECK (requested_target_usd > 0 AND requested_target_usd <= 1000000.00),
  applied_immediately boolean NOT NULL,
  config_version bigint NOT NULL CHECK (config_version > 0),
  reason text NOT NULL DEFAULT 'owner_update' CHECK (char_length(reason) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nova_aggregate_profit_audit_owner_created_idx
  ON public.nova_aggregate_profit_target_audit(user_id, created_at DESC);

ALTER TABLE public.nova_aggregate_profit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nova_aggregate_profit_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nova_aggregate_profit_target_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.nova_aggregate_profit_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.nova_aggregate_profit_cycles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.nova_aggregate_profit_target_audit FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.nova_aggregate_profit_settings TO authenticated;
GRANT SELECT ON TABLE public.nova_aggregate_profit_cycles TO authenticated;
GRANT SELECT ON TABLE public.nova_aggregate_profit_target_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nova_aggregate_profit_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nova_aggregate_profit_cycles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nova_aggregate_profit_target_audit TO service_role;

DROP POLICY IF EXISTS nova_aggregate_profit_settings_select_own ON public.nova_aggregate_profit_settings;
CREATE POLICY nova_aggregate_profit_settings_select_own ON public.nova_aggregate_profit_settings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS nova_aggregate_profit_cycles_select_own ON public.nova_aggregate_profit_cycles;
CREATE POLICY nova_aggregate_profit_cycles_select_own ON public.nova_aggregate_profit_cycles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS nova_aggregate_profit_audit_select_own ON public.nova_aggregate_profit_target_audit;
CREATE POLICY nova_aggregate_profit_audit_select_own ON public.nova_aggregate_profit_target_audit
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.nova_set_aggregate_profit_target_impl(
  p_broker_connection_id uuid,
  p_target_usd numeric,
  p_reason text DEFAULT 'owner_update'
)
RETURNS TABLE (
  target_usd numeric,
  pending_target_usd numeric,
  config_version bigint,
  pending_config_version bigint,
  applied_immediately boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_old_target numeric(12,2);
  v_version bigint;
  v_deferred boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_broker_connection_id IS NULL
     OR p_target_usd IS NULL
     OR p_target_usd::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_target_usd <= 0
     OR p_target_usd > 1000000.00
     OR scale(p_target_usd) > 2
     OR p_reason IS NULL
     OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'nova_aggregate_profit_target_invalid' USING ERRCODE = '22023';
  END IF;

  -- Serialize setting changes against trusted cycle creation by locking the same
  -- broker connection row. Any future cycle-creation RPC must take this lock too.
  PERFORM 1 FROM public.broker_connections bc
   WHERE bc.id = p_broker_connection_id
     AND bc.user_id = v_user
     AND bc.provider = 'exness_mt5'
     AND bc.environment = 'demo'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nova_demo_connection_not_found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.nova_aggregate_profit_settings(user_id, broker_connection_id)
  VALUES (v_user, p_broker_connection_id)
  ON CONFLICT (user_id, broker_connection_id) DO NOTHING;

  SELECT s.target_usd, s.config_version
    INTO v_old_target, v_version
    FROM public.nova_aggregate_profit_settings s
   WHERE s.user_id = v_user AND s.broker_connection_id = p_broker_connection_id
   FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.nova_aggregate_profit_cycles c
     WHERE c.user_id = v_user
       AND c.broker_connection_id = p_broker_connection_id
       AND c.state IN ('TRIGGERED', 'CLOSING', 'RECONCILING', 'PARTIAL_OR_BLOCKED')
  ) INTO v_deferred;

  IF v_deferred THEN
    UPDATE public.nova_aggregate_profit_settings s
       SET pending_target_usd = p_target_usd,
           pending_config_version = v_version + 1,
           updated_at = now()
     WHERE s.user_id = v_user AND s.broker_connection_id = p_broker_connection_id;
  ELSE
    UPDATE public.nova_aggregate_profit_settings s
       SET target_usd = p_target_usd,
           config_version = v_version + 1,
           pending_target_usd = NULL,
           pending_config_version = NULL,
           updated_at = now()
     WHERE s.user_id = v_user AND s.broker_connection_id = p_broker_connection_id;
  END IF;

  INSERT INTO public.nova_aggregate_profit_target_audit(
    user_id, broker_connection_id, actor_user_id, old_target_usd,
    requested_target_usd, applied_immediately, config_version, reason
  ) VALUES (
    v_user, p_broker_connection_id, v_user, v_old_target,
    p_target_usd, NOT v_deferred,
    CASE WHEN v_deferred THEN v_version + 1 ELSE v_version + 1 END,
    btrim(p_reason)
  );

  RETURN QUERY
    SELECT s.target_usd, s.pending_target_usd, s.config_version,
           s.pending_config_version, NOT v_deferred
      FROM public.nova_aggregate_profit_settings s
     WHERE s.user_id = v_user AND s.broker_connection_id = p_broker_connection_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.nova_set_aggregate_profit_target_impl(uuid, numeric, text)
  FROM PUBLIC, anon;
-- The private SECURITY DEFINER implementation re-checks auth.uid() and the
-- owner-scoped Demo connection on every call; authenticated execution is needed
-- because the public PostgREST wrapper is deliberately SECURITY INVOKER.
GRANT EXECUTE ON FUNCTION private.nova_set_aggregate_profit_target_impl(uuid, numeric, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.nova_set_aggregate_profit_target(
  p_broker_connection_id uuid,
  p_target_usd numeric,
  p_reason text DEFAULT 'owner_update'
)
RETURNS TABLE (
  target_usd numeric,
  pending_target_usd numeric,
  config_version bigint,
  pending_config_version bigint,
  applied_immediately boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY SELECT *
    FROM private.nova_set_aggregate_profit_target_impl(
      p_broker_connection_id, p_target_usd, p_reason
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.nova_set_aggregate_profit_target(uuid, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nova_set_aggregate_profit_target(uuid, numeric, text)
  TO authenticated;

COMMENT ON TABLE public.nova_aggregate_profit_settings IS
  'Durable owner-scoped aggregate profit target configuration. Disabled by default; configuration only, no broker execution authority.';
COMMENT ON TABLE public.nova_aggregate_profit_cycles IS
  'Durable basket-cycle snapshots and reconciliation state. Trusted backend only; no client mutation grants.';
COMMENT ON TABLE public.nova_aggregate_profit_target_audit IS
  'Owner target-change audit history; authenticated users can read only their own rows.';
COMMENT ON FUNCTION public.nova_set_aggregate_profit_target(uuid, numeric, text) IS
  'Owner-authenticated Demo-only target configuration RPC. Changes are staged while a basket cycle is active; never closes positions.';

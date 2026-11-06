-- Voom_system staff authorization helper and dashboard read policies v2
-- Additive, read-only changes. No trade/order APIs are changed.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_profiles cp
    WHERE cp.user_id = auth.uid()
      AND cp.role IN ('staff', 'admin')
      AND cp.account_status = 'active'
  );
$function$;

REVOKE ALL ON FUNCTION private.is_active_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_active_staff() TO authenticated;

DROP POLICY IF EXISTS customer_profiles_read_self ON public.customer_profiles;
CREATE POLICY customer_profiles_read_self_or_staff
ON public.customer_profiles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_active_staff()));

DROP POLICY IF EXISTS ai_strategies_read_catalog ON public.ai_strategies;
CREATE POLICY ai_strategies_read_catalog_or_staff
ON public.ai_strategies
FOR SELECT TO authenticated
USING (
  lifecycle_status IN ('paper_ready', 'approved')
  OR (SELECT private.is_active_staff())
);

DROP POLICY IF EXISTS customer_ai_subscriptions_read_owner ON public.customer_ai_subscriptions;
CREATE POLICY customer_ai_subscriptions_read_owner_or_staff
ON public.customer_ai_subscriptions
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_active_staff()));

DROP POLICY IF EXISTS risk_guard_decisions_read_owner_or_staff ON public.risk_guard_decisions;
CREATE POLICY risk_guard_decisions_read_owner_or_staff
ON public.risk_guard_decisions
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_active_staff()));

DROP POLICY IF EXISTS security_events_read_staff_only ON public.security_events;
CREATE POLICY security_events_read_staff_only
ON public.security_events
FOR SELECT TO authenticated
USING ((SELECT private.is_active_staff()));

DROP POLICY IF EXISTS system_heartbeats_read_staff_only ON public.system_heartbeats;
CREATE POLICY system_heartbeats_read_staff_only
ON public.system_heartbeats
FOR SELECT TO authenticated
USING ((SELECT private.is_active_staff()));
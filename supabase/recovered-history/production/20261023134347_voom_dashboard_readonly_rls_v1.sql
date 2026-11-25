-- Voom_system least-privilege dashboard policies v1
-- Read-only policies only. No customer write policies and no order-execution permissions.
CREATE POLICY customer_profiles_read_self
ON public.customer_profiles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY ai_strategies_read_catalog
ON public.ai_strategies
FOR SELECT TO authenticated
USING (lifecycle_status IN ('paper_ready', 'approved'));

CREATE POLICY customer_ai_subscriptions_read_owner
ON public.customer_ai_subscriptions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.customer_profiles cp
    WHERE cp.user_id = (SELECT auth.uid())
      AND cp.role IN ('staff', 'admin')
  )
);

CREATE POLICY risk_guard_decisions_read_owner_or_staff
ON public.risk_guard_decisions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.customer_profiles cp
    WHERE cp.user_id = (SELECT auth.uid())
      AND cp.role IN ('staff', 'admin')
  )
);

CREATE POLICY security_events_read_staff_only
ON public.security_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customer_profiles cp
    WHERE cp.user_id = (SELECT auth.uid())
      AND cp.role IN ('staff', 'admin')
  )
);

CREATE POLICY system_heartbeats_read_staff_only
ON public.system_heartbeats
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customer_profiles cp
    WHERE cp.user_id = (SELECT auth.uid())
      AND cp.role IN ('staff', 'admin')
  )
);

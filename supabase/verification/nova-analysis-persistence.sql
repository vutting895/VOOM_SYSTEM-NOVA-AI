-- NOVA durable analysis persistence: read-only production verification.
-- Returns schema, RLS, policy, function privilege and index metadata only.
-- Does not read analysis results or modify application data.

SELECT jsonb_build_object(
  'jobs_table_exists', to_regclass('public.nova_analysis_jobs') IS NOT NULL,
  'audit_table_exists', to_regclass('public.nova_analysis_audit_events') IS NOT NULL,
  'jobs_rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid='public.nova_analysis_jobs'::regclass),
  'audit_rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid='public.nova_analysis_audit_events'::regclass),
  'jobs_owner_select_policy', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='nova_analysis_jobs' AND policyname='nova_analysis_jobs_select_own'
  ),
  'audit_owner_select_policy', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='nova_analysis_audit_events' AND policyname='nova_analysis_audit_select_own'
  )
) AS schema_security_status;

SELECT p.proname,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('nova_create_analysis_job','nova_update_analysis_job')
ORDER BY p.proname;

SELECT indexname
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('nova_analysis_jobs','nova_analysis_audit_events')
ORDER BY indexname;

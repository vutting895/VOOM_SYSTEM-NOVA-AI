-- Local-only normalization for Supabase CLI's disposable replay bootstrap.
-- The hosted Production catalog grants service_role only REFERENCES/TRIGGER/TRUNCATE
-- on these owner-scoped tables, not DELETE/INSERT/SELECT/UPDATE. The local Supabase
-- bootstrap adds those four privileges by default. Remove only those extras so
-- replay fingerprints can be compared to the captured hosted catalog.
-- This file is never placed in supabase/migrations and never applied to a hosted project.
DO $normalization$
BEGIN
  IF to_regclass('public.broker_connections') IS NOT NULL THEN
    EXECUTE 'REVOKE DELETE, INSERT, SELECT, UPDATE ON TABLE public.broker_connections FROM service_role';
  END IF;
  IF to_regclass('public.nova_agent_threads') IS NOT NULL THEN
    EXECUTE 'REVOKE DELETE, INSERT, SELECT, UPDATE ON TABLE public.nova_agent_threads FROM service_role';
  END IF;
  IF to_regclass('public.nova_approval_requests') IS NOT NULL THEN
    EXECUTE 'REVOKE DELETE, INSERT, SELECT, UPDATE ON TABLE public.nova_approval_requests FROM service_role';
  END IF;
END;
$normalization$;

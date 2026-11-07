-- Durable owner-scoped SMC/Elliott analysis jobs and append-only audit events.
-- Runtime writes use the server-only Supabase service role; clients receive no table grants.

CREATE TABLE IF NOT EXISTS public.nova_analysis_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9._/-]{2,32}$'),
  timeframe text NOT NULL CHECK (timeframe IN ('1m','5m','15m','30m','1h','4h','1d','1w')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','started','completed','failed')),
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(request_metadata) = 'object'),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nova_analysis_job_owner_id_unique UNIQUE (id, user_id),
  CONSTRAINT nova_analysis_job_terminal_payload CHECK (
    (status = 'completed' AND result IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND result IS NULL AND finished_at IS NOT NULL AND error_code IS NOT NULL)
    OR (status IN ('queued','started') AND result IS NULL AND finished_at IS NULL AND error_code IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS nova_analysis_jobs_owner_created_idx
  ON public.nova_analysis_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nova_analysis_jobs_connection_created_idx
  ON public.nova_analysis_jobs (user_id, connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.nova_analysis_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('queued','started','completed','failed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nova_analysis_audit_job_owner_fk
    FOREIGN KEY (job_id, user_id)
    REFERENCES public.nova_analysis_jobs(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS nova_analysis_audit_job_created_idx
  ON public.nova_analysis_audit_events (job_id, created_at);

ALTER TABLE public.nova_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nova_analysis_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nova_analysis_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.nova_analysis_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.nova_analysis_jobs TO authenticated;
GRANT SELECT ON TABLE public.nova_analysis_audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.nova_analysis_jobs TO service_role;
GRANT SELECT, INSERT ON TABLE public.nova_analysis_audit_events TO service_role;

DROP POLICY IF EXISTS nova_analysis_jobs_select_own ON public.nova_analysis_jobs;
CREATE POLICY nova_analysis_jobs_select_own ON public.nova_analysis_jobs
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS nova_analysis_audit_select_own ON public.nova_analysis_audit_events;
CREATE POLICY nova_analysis_audit_select_own ON public.nova_analysis_audit_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.nova_analysis_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION 'nova_analysis_audit_is_append_only';
END;
$function$;
DROP TRIGGER IF EXISTS nova_analysis_audit_no_update ON public.nova_analysis_audit_events;
CREATE TRIGGER nova_analysis_audit_no_update
  BEFORE UPDATE OR DELETE ON public.nova_analysis_audit_events
  FOR EACH ROW EXECUTE FUNCTION private.nova_analysis_audit_immutable();
REVOKE ALL ON FUNCTION private.nova_analysis_audit_immutable() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.nova_analysis_jobs IS
  'Durable owner-scoped SMC/Elliott research jobs. No credentials or broker account snapshots are stored.';
COMMENT ON TABLE public.nova_analysis_audit_events IS
  'Append-only audit trail for durable analysis job lifecycle transitions.';
NOTIFY pgrst, 'reload schema';

-- Transactional service-only lifecycle RPCs keep each state change and its audit
-- event in the same PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.nova_create_analysis_job(
  p_id uuid, p_user_id uuid, p_connection_id uuid, p_symbol text,
  p_timeframe text, p_bar_count integer
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NULL OR p_user_id IS NULL OR p_connection_id IS NULL
     OR p_symbol IS NULL OR p_symbol !~ '^[A-Z0-9._/-]{2,32}$'
     OR p_timeframe IS NULL OR p_timeframe NOT IN ('1m','5m','15m','30m','1h','4h','1d','1w')
     OR p_bar_count IS NULL OR p_bar_count NOT BETWEEN 25 AND 500 THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_request';
  END IF;
  INSERT INTO public.nova_analysis_jobs
    (id,user_id,connection_id,symbol,timeframe,status,request_metadata)
  VALUES (
    p_id,p_user_id,p_connection_id,p_symbol,p_timeframe,'queued',
    pg_catalog.jsonb_build_object('bar_count',p_bar_count,'source','exness_mt5_demo')
  );
  INSERT INTO public.nova_analysis_audit_events(job_id,user_id,event_type,details)
  VALUES (p_id,p_user_id,'queued',
    pg_catalog.jsonb_build_object('symbol',p_symbol,'timeframe',p_timeframe,'bar_count',p_bar_count));
END;
$function$;

CREATE OR REPLACE FUNCTION public.nova_update_analysis_job(
  p_job_id uuid, p_user_id uuid, p_status text,
  p_result jsonb DEFAULT NULL, p_error_code text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_rows integer; v_details jsonb := '{}'::jsonb;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL OR p_status NOT IN ('started','completed','failed') THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_transition';
  END IF;
  IF p_status='completed' AND (p_result IS NULL OR pg_catalog.jsonb_typeof(p_result)<>'object' OR p_error_code IS NOT NULL) THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_result';
  ELSIF p_status='failed' AND (p_result IS NOT NULL OR p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,80}$') THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_failure';
  ELSIF p_status='started' AND (p_result IS NOT NULL OR p_error_code IS NOT NULL) THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_start';
  END IF;

  UPDATE public.nova_analysis_jobs
  SET status=p_status,
      started_at=CASE WHEN p_status='started' THEN COALESCE(started_at,pg_catalog.now()) ELSE started_at END,
      finished_at=CASE WHEN p_status IN ('completed','failed') THEN pg_catalog.now() ELSE NULL END,
      result=CASE WHEN p_status='completed' THEN p_result ELSE NULL END,
      error_code=CASE WHEN p_status='failed' THEN p_error_code ELSE NULL END,
      updated_at=pg_catalog.now()
  WHERE id=p_job_id AND user_id=p_user_id AND status IN ('queued','started');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'nova_analysis_job_not_found_or_terminal'; END IF;

  IF p_status='failed' THEN
    v_details := pg_catalog.jsonb_build_object('error_code',p_error_code);
  END IF;
  INSERT INTO public.nova_analysis_audit_events(job_id,user_id,event_type,details)
  VALUES (p_job_id,p_user_id,p_status,v_details);
END;
$function$;

REVOKE ALL ON FUNCTION public.nova_create_analysis_job(uuid,uuid,uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nova_update_analysis_job(uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nova_create_analysis_job(uuid,uuid,uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.nova_update_analysis_job(uuid,uuid,text,jsonb,text) TO service_role;

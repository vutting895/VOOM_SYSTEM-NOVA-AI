-- Reject NULL lifecycle states explicitly rather than relying on CHECK/NOT NULL behavior.
CREATE OR REPLACE FUNCTION public.nova_update_analysis_job(
  p_job_id uuid, p_user_id uuid, p_status text,
  p_result jsonb DEFAULT NULL, p_error_code text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE v_rows integer; v_details jsonb := '{}'::jsonb;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL OR p_status IS NULL
     OR p_status NOT IN ('started','completed','failed') THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_transition';
  END IF;
  IF p_status='completed' AND
     (p_result IS NULL OR pg_catalog.jsonb_typeof(p_result)<>'object' OR p_error_code IS NOT NULL) THEN
    RAISE EXCEPTION 'nova_analysis_job_invalid_result';
  ELSIF p_status='failed' AND
     (p_result IS NOT NULL OR p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_]{1,80}$') THEN
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

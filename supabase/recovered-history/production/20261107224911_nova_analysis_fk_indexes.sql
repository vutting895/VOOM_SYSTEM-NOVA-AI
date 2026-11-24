-- Cover the new analysis foreign keys to keep deletes and owner-scoped joins efficient.
CREATE INDEX IF NOT EXISTS nova_analysis_jobs_connection_id_idx
  ON public.nova_analysis_jobs (connection_id);
CREATE INDEX IF NOT EXISTS nova_analysis_audit_user_id_idx
  ON public.nova_analysis_audit_events (user_id);
CREATE INDEX IF NOT EXISTS nova_analysis_audit_job_owner_idx
  ON public.nova_analysis_audit_events (job_id, user_id);

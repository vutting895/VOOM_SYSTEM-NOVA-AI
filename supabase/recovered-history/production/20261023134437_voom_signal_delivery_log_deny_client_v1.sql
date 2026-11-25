CREATE POLICY signal_delivery_log_deny_client_access ON public.signal_delivery_log FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

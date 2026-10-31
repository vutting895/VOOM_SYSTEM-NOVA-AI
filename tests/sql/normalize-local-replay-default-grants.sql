-- Local-only normalization for Supabase CLI's disposable replay bootstrap.
-- The hosted Production catalog fingerprint has service_role REFERENCES/TRIGGER/TRUNCATE
-- on broker_connections, but not DELETE/INSERT/SELECT/UPDATE. The local Supabase
-- bootstrap grants those four privileges by default; remove only those extras so
-- the replay can be compared to the captured hosted catalog. This file is never
-- placed in supabase/migrations and is never applied to a hosted project.
REVOKE DELETE, INSERT, SELECT, UPDATE
  ON TABLE public.broker_connections
  FROM service_role;

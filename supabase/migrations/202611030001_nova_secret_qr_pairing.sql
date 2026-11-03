-- NOVA Secure QR Pairing: pairing metadata only; never stores provider credentials.
CREATE TABLE IF NOT EXISTS public.secret_pairing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'provider_connection'
    CHECK (purpose = 'provider_connection'),
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scanned', 'approved', 'rejected', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  scanned_at timestamptz,
  approved_at timestamptz,
  CONSTRAINT secret_pairing_expiry_window CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '2 minutes'
  ),
  CONSTRAINT secret_pairing_status_timestamps CHECK (
    (status NOT IN ('scanned', 'approved') OR scanned_at IS NOT NULL)
    AND (status <> 'approved' OR approved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS secret_pairing_owner_created_idx
  ON public.secret_pairing_sessions (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS secret_pairing_expiry_idx
  ON public.secret_pairing_sessions (expires_at)
  WHERE status IN ('pending', 'scanned');

ALTER TABLE public.secret_pairing_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.secret_pairing_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.secret_pairing_sessions TO authenticated;

DROP POLICY IF EXISTS secret_pairing_select_own ON public.secret_pairing_sessions;
CREATE POLICY secret_pairing_select_own ON public.secret_pairing_sessions
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS secret_pairing_insert_own ON public.secret_pairing_sessions;
CREATE POLICY secret_pairing_insert_own ON public.secret_pairing_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'pending'
    AND purpose = 'provider_connection'
    AND expires_at > now()
    AND expires_at <= now() + interval '2 minutes'
  );

DROP POLICY IF EXISTS secret_pairing_update_own ON public.secret_pairing_sessions;
CREATE POLICY secret_pairing_update_own ON public.secret_pairing_sessions
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.nova_secret_pairing_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
     OR OLD.purpose IS DISTINCT FROM NEW.purpose
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR (OLD.token_hash IS DISTINCT FROM NEW.token_hash
         AND NOT (NEW.token_hash IS NULL AND NEW.status IN ('approved', 'rejected', 'cancelled', 'expired'))) THEN
    RAISE EXCEPTION 'secret_pairing_immutable_fields';
  END IF;

  IF OLD.status NOT IN ('pending', 'scanned') THEN
    RAISE EXCEPTION 'secret_pairing_already_resolved';
  END IF;
  IF (OLD.status = 'pending' AND NEW.status NOT IN ('scanned', 'rejected', 'cancelled', 'expired'))
     OR (OLD.status = 'scanned' AND NEW.status NOT IN ('approved', 'rejected', 'cancelled', 'expired')) THEN
    RAISE EXCEPTION 'secret_pairing_invalid_transition';
  END IF;
  IF NEW.status IN ('approved', 'rejected', 'cancelled', 'expired') AND NEW.token_hash IS NOT NULL THEN
    RAISE EXCEPTION 'secret_pairing_terminal_token_must_be_cleared';
  END IF;
  IF NEW.status IN ('scanned', 'approved') AND NEW.scanned_at IS NULL THEN
    RAISE EXCEPTION 'secret_pairing_scan_timestamp_required';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN
    RAISE EXCEPTION 'secret_pairing_approval_timestamp_required';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.nova_secret_pairing_guard_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS nova_secret_pairing_guard_update ON public.secret_pairing_sessions;
CREATE TRIGGER nova_secret_pairing_guard_update
  BEFORE UPDATE ON public.secret_pairing_sessions
  FOR EACH ROW EXECUTE FUNCTION private.nova_secret_pairing_guard_update();

COMMENT ON TABLE public.secret_pairing_sessions IS
  'Short-lived owner-scoped QR pairing metadata. token_hash is a one-time 256-bit token hash; no provider credential or secret is stored.';
COMMENT ON COLUMN public.secret_pairing_sessions.token_hash IS
  'SHA-256 hash of a random 256-bit one-time pairing token. Cleared on terminal state.';
NOTIFY pgrst, 'reload schema';

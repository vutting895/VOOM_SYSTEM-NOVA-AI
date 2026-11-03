-- NOVA Secure QR Pairing: pairing metadata only; never stores provider credentials.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.secret_pairing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'provider_connection'
    CHECK (purpose = 'provider_connection'),
  token_hash text CHECK (token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scanned', 'approved', 'rejected', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  scanned_at timestamptz,
  approved_at timestamptz,
  CONSTRAINT secret_pairing_token_state CHECK (
    (status IN ('pending', 'scanned') AND token_hash IS NOT NULL)
    OR (status IN ('approved', 'rejected', 'cancelled', 'expired') AND token_hash IS NULL)
  ),
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
REVOKE ALL ON TABLE public.secret_pairing_sessions FROM authenticated;
GRANT SELECT (id, owner_id, purpose, status, expires_at, created_at, scanned_at, approved_at)
  ON TABLE public.secret_pairing_sessions TO authenticated;
GRANT INSERT (owner_id, purpose, token_hash, status, expires_at)
  ON TABLE public.secret_pairing_sessions TO authenticated;

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
    AND token_hash IS NOT NULL
    AND expires_at > now()
    AND expires_at <= now() + interval '2 minutes'
  );

-- State changes are performed only through narrow authenticated RPCs below.
-- The trigger is defense in depth for future privileged callers.
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
  IF (OLD.status = 'pending' AND NEW.status <> 'scanned')
     OR (OLD.status = 'scanned' AND NEW.status <> 'approved') THEN
    RAISE EXCEPTION 'secret_pairing_invalid_transition';
  END IF;
  IF OLD.expires_at <= now() THEN
    RAISE EXCEPTION 'secret_pairing_expired';
  END IF;
  IF NEW.status IN ('approved', 'rejected', 'cancelled', 'expired') AND NEW.token_hash IS NOT NULL THEN
    RAISE EXCEPTION 'secret_pairing_terminal_token_must_be_cleared';
  END IF;
  IF OLD.scanned_at IS DISTINCT FROM NEW.scanned_at
     AND NOT (OLD.status = 'pending' AND NEW.status = 'scanned' AND NEW.scanned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'secret_pairing_scan_timestamp_immutable';
  END IF;
  IF OLD.approved_at IS DISTINCT FROM NEW.approved_at
     AND NOT (OLD.status = 'scanned' AND NEW.status = 'approved' AND NEW.approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'secret_pairing_approval_timestamp_immutable';
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

CREATE OR REPLACE FUNCTION private.nova_claim_secret_pairing_impl(p_token_hash text)
RETURNS TABLE(id uuid, purpose text, status text, expires_at timestamptz,
              created_at timestamptz, scanned_at timestamptz, approved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'pairing_token_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    UPDATE public.secret_pairing_sessions AS s
       SET status = 'scanned', scanned_at = now()
     WHERE s.owner_id = v_user
       AND s.token_hash = p_token_hash
       AND s.status = 'pending'
       AND s.expires_at > now()
    RETURNING s.id, s.purpose, s.status, s.expires_at, s.created_at, s.scanned_at, s.approved_at;
END;
$function$;

CREATE OR REPLACE FUNCTION private.nova_approve_secret_pairing_impl(p_pairing_id uuid, p_token_hash text)
RETURNS TABLE(id uuid, purpose text, status text, expires_at timestamptz,
              created_at timestamptz, scanned_at timestamptz, approved_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE v_user uuid := (SELECT auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;
  IF p_pairing_id IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'pairing_approval_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    UPDATE public.secret_pairing_sessions AS s
       SET status = 'approved', approved_at = now(), token_hash = NULL
     WHERE s.id = p_pairing_id
       AND s.owner_id = v_user
       AND s.token_hash = p_token_hash
       AND s.status = 'scanned'
       AND s.expires_at > now()
    RETURNING s.id, s.purpose, s.status, s.expires_at, s.created_at, s.scanned_at, s.approved_at;
END;
$function$;

REVOKE ALL ON FUNCTION private.nova_claim_secret_pairing_impl(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.nova_approve_secret_pairing_impl(uuid, text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.nova_claim_secret_pairing_impl(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.nova_approve_secret_pairing_impl(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.nova_claim_secret_pairing(p_token_hash text)
RETURNS TABLE(id uuid, purpose text, status text, expires_at timestamptz,
              created_at timestamptz, scanned_at timestamptz, approved_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.nova_claim_secret_pairing_impl(p_token_hash);
$function$;

CREATE OR REPLACE FUNCTION public.nova_approve_secret_pairing(p_pairing_id uuid, p_token_hash text)
RETURNS TABLE(id uuid, purpose text, status text, expires_at timestamptz,
              created_at timestamptz, scanned_at timestamptz, approved_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.nova_approve_secret_pairing_impl(p_pairing_id, p_token_hash);
$function$;

REVOKE ALL ON FUNCTION public.nova_claim_secret_pairing(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nova_approve_secret_pairing(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nova_claim_secret_pairing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nova_approve_secret_pairing(uuid, text) TO authenticated;

COMMENT ON TABLE public.secret_pairing_sessions IS
  'Short-lived owner-scoped QR pairing metadata. token_hash is a one-time 256-bit token hash; no provider credential or secret is stored.';
COMMENT ON COLUMN public.secret_pairing_sessions.token_hash IS
  'SHA-256 hash of a random 256-bit one-time pairing token. Cleared on terminal state.';
COMMENT ON FUNCTION public.nova_claim_secret_pairing(text) IS
  'Atomic same-owner one-time QR claim. Requires an authenticated session and never returns the raw pairing token.';
COMMENT ON FUNCTION public.nova_approve_secret_pairing(uuid, text) IS
  'Atomic same-owner one-time QR approval. Clears the token hash and grants no provider credential access.';
NOTIFY pgrst, 'reload schema';

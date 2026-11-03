BEGIN;
INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

SET LOCAL request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
INSERT INTO public.secret_pairing_sessions
  (owner_id, purpose, token_hash, status, expires_at)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'provider_connection',
  repeat('a', 64),
  'pending',
  now() + interval '90 seconds'
);

DO $test$
BEGIN
  IF (SELECT count(*) FROM public.secret_pairing_sessions
      WHERE owner_id = '10000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'owner_select_failed';
  END IF;
END;
$test$;

DO $test$
BEGIN
  IF (SELECT count(*) FROM public.nova_claim_secret_pairing(repeat('a', 64))
      WHERE status = 'scanned') <> 1 THEN
    RAISE EXCEPTION 'owner_claim_failed';
  END IF;
END;
$test$;

DO $test$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.secret_pairing_sessions
    WHERE owner_id = '10000000-0000-4000-8000-000000000001';
  IF (SELECT count(*) FROM public.nova_approve_secret_pairing(v_id, repeat('a', 64))
      WHERE status = 'approved') <> 1 THEN
    RAISE EXCEPTION 'owner_approval_failed';
  END IF;
END;
$test$;

SET LOCAL ROLE postgres;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.secret_pairing_sessions
      WHERE owner_id = '10000000-0000-4000-8000-000000000001'
        AND status = 'approved' AND token_hash IS NULL) <> 1 THEN
    RAISE EXCEPTION 'approved_token_hash_not_cleared';
  END IF;
  IF has_column_privilege('authenticated', 'public.secret_pairing_sessions', 'token_hash', 'SELECT') THEN
    RAISE EXCEPTION 'token_hash_read_privilege_not_revoked';
  END IF;
  IF has_table_privilege('authenticated', 'public.secret_pairing_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'direct_client_update_not_revoked';
  END IF;
END;
$test$;

SET LOCAL request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.secret_pairing_sessions
      WHERE owner_id = '10000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'foreign_owner_select_not_denied';
  END IF;
  IF (SELECT count(*) FROM public.nova_claim_secret_pairing(repeat('a', 64))) <> 0 THEN
    RAISE EXCEPTION 'foreign_owner_claim_not_denied';
  END IF;
END;
$test$;

ROLLBACK;

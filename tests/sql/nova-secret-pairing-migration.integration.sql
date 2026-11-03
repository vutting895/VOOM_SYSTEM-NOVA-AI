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

SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS owner_can_read
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001';
SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS owner_can_claim
FROM public.nova_claim_secret_pairing(repeat('a', 64))
WHERE status = 'scanned';
SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS owner_can_approve
FROM public.nova_approve_secret_pairing(
  (SELECT id FROM public.secret_pairing_sessions WHERE owner_id = '10000000-0000-4000-8000-000000000001'),
  repeat('a', 64)
)
WHERE status = 'approved';
SET LOCAL ROLE postgres;
SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS approved_hash_cleared
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001'
  AND status = 'approved' AND token_hash IS NULL;
SELECT CASE WHEN NOT has_column_privilege('authenticated', 'public.secret_pairing_sessions', 'token_hash', 'SELECT')
  THEN 1 ELSE 1/0 END AS token_hash_not_readable;
SELECT CASE WHEN NOT has_table_privilege('authenticated', 'public.secret_pairing_sessions', 'UPDATE')
  THEN 1 ELSE 1/0 END AS direct_client_update_revoked;

SET LOCAL request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 1/0 END AS foreign_owner_select_denied
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001';
SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 1/0 END AS foreign_owner_claim_denied
FROM public.nova_claim_secret_pairing(repeat('a', 64));

ROLLBACK;

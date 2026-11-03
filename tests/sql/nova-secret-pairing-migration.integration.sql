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

-- The owner can see and advance their own pairing through the legal state machine.
SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS owner_can_read
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001';
UPDATE public.secret_pairing_sessions
SET status = 'scanned', scanned_at = now()
WHERE owner_id = '10000000-0000-4000-8000-000000000001'
  AND status = 'pending';
UPDATE public.secret_pairing_sessions
SET status = 'approved', approved_at = now(), token_hash = NULL
WHERE owner_id = '10000000-0000-4000-8000-000000000001'
  AND status = 'scanned';
SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS approved_hash_cleared
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001'
  AND status = 'approved' AND token_hash IS NULL;

-- A different authenticated user sees no row and cannot update the first user's pairing.
SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 1/0 END AS foreign_owner_denied
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001';
UPDATE public.secret_pairing_sessions
SET status = 'rejected', token_hash = NULL
WHERE owner_id = '10000000-0000-4000-8000-000000000001';
SELECT CASE WHEN count(*) = 1 THEN 1 ELSE 1/0 END AS foreign_update_denied
FROM public.secret_pairing_sessions
WHERE owner_id = '10000000-0000-4000-8000-000000000001'
  AND status = 'approved';

ROLLBACK;

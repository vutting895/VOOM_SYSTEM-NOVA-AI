\set ON_ERROR_STOP on

INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (id) DO NOTHING;

BEGIN;

-- Owner A creates a thread and a pending research-draft review.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

INSERT INTO public.nova_agent_threads(id, title)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner A test thread')
RETURNING id AS test_thread_id \gset

SELECT id AS test_approval_id
FROM public.nova_create_approval(
  :'test_thread_id',
  'strategy_draft_review',
  '{"title":"Owner A research draft","summary":"Research-only proposal; no order or account action.","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  repeat('a', 64),
  'nova-approval.v1',
  now() + interval '10 minutes'
) \gset

SELECT (status = 'pending') AS owner_can_read_pending
FROM public.nova_approval_requests
WHERE id = :'test_approval_id' \gset
\if :owner_can_read_pending
\else
  \echo 'FAIL: owner cannot read pending approval'
  \quit 1
\endif

-- A different authenticated user must see no foreign thread and may not resolve its approval.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

SELECT (count(*) = 0) AS foreign_thread_hidden
FROM public.nova_agent_threads
WHERE id = :'test_thread_id' \gset
\if :foreign_thread_hidden
\else
  \echo 'FAIL: foreign thread was visible to second user'
  \quit 1
\endif

SELECT (result_code = 'not_found') AS foreign_approval_denied
FROM public.nova_resolve_approval(
  :'test_approval_id', 'approve', NULL, NULL, 'nova-approval.v1'
) \gset
\if :foreign_approval_denied
\else
  \echo 'FAIL: second user was allowed to resolve foreign approval'
  \quit 1
\endif

-- Return to owner A, resolve exactly once, then prove a replay is rejected.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT (result_code = 'resolved' AND status = 'approved') AS owner_decision_saved
FROM public.nova_resolve_approval(
  :'test_approval_id', 'approve', 'Research review only', NULL, 'nova-approval.v1'
) \gset
\if :owner_decision_saved
\else
  \echo 'FAIL: owner decision did not persist'
  \quit 1
\endif

SELECT (result_code = 'already_resolved') AS replay_rejected
FROM public.nova_resolve_approval(
  :'test_approval_id', 'approve', NULL, NULL, 'nova-approval.v1'
) \gset
\if :replay_rejected
\else
  \echo 'FAIL: duplicate approval replay was not rejected'
  \quit 1
\endif

-- Owner A can edit a research draft, but the edit is not itself an approval.
SELECT id AS edit_approval_id
FROM public.nova_create_approval(
  :'test_thread_id',
  'strategy_draft_review',
  '{"title":"Owner A second draft","summary":"Review this second research draft.","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  repeat('b', 64),
  'nova-approval.v1',
  now() + interval '10 minutes'
) \gset

SELECT (
  result_code = 'resolved'
  AND status = 'edited'
  AND decision_payload ->> 'summary' = 'Edited research-only summary'
) AS owner_edit_saved
FROM public.nova_resolve_approval(
  :'edit_approval_id',
  'edit',
  'Edited before re-review',
  '{"title":"Owner A second draft","summary":"Edited research-only summary","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  'nova-approval.v1'
) \gset
\if :owner_edit_saved
\else
  \echo 'FAIL: owner edit did not persist as a non-approved edit'
  \quit 1
\endif

-- Stale policy versions must not resolve a fresh request.
SELECT id AS expiry_approval_id
FROM public.nova_create_approval(
  :'test_thread_id',
  'strategy_draft_review',
  '{"title":"Owner A expiry draft","summary":"Draft to test expiry and policy version.","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  repeat('c', 64),
  'nova-approval.v1',
  now() + interval '10 minutes'
) \gset

SELECT (result_code = 'policy_mismatch' AND status = 'pending') AS stale_policy_rejected
FROM public.nova_resolve_approval(
  :'expiry_approval_id', 'approve', NULL, NULL, 'nova-approval.v2'
) \gset
\if :stale_policy_rejected
\else
  \echo 'FAIL: stale policy version changed the approval state'
  \quit 1
\endif

-- Only this disposable CI database bypasses the immutability trigger to simulate elapsed time.
RESET ROLE;
ALTER TABLE public.nova_approval_requests DISABLE TRIGGER nova_approval_guard_update;
UPDATE public.nova_approval_requests
SET expires_at = now() - interval '1 second'
WHERE id = :'expiry_approval_id';
ALTER TABLE public.nova_approval_requests ENABLE TRIGGER nova_approval_guard_update;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

SELECT (result_code = 'expired' AND status = 'expired') AS expired_approval_rejected
FROM public.nova_resolve_approval(
  :'expiry_approval_id', 'approve', NULL, NULL, 'nova-approval.v1'
) \gset
\if :expired_approval_rejected
\else
  \echo 'FAIL: expired approval was not rejected'
  \quit 1
\endif

COMMIT;
\echo 'PASS: owner create/read/resolve; second-user isolation; one-time replay rejection; edit; stale policy; expiry'

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

COMMIT;
\echo 'PASS: owner create/read/resolve; second-user isolation; one-time decision'

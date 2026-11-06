\set ON_ERROR_STOP on

INSERT INTO auth.users(id) VALUES
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444')
ON CONFLICT (id) DO NOTHING;

BEGIN;

-- Owner A creates a thread and review request. The trigger writes "requested" atomically.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

INSERT INTO public.nova_agent_threads(id, title)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'audit event test thread')
RETURNING id AS audit_thread_id \gset

SELECT id AS audit_approval_id
FROM public.nova_create_approval(
  :'audit_thread_id',
  'strategy_draft_review',
  '{"title":"Audit event research draft","summary":"Research only. Never an executable order.","market":"XAU/USD","timeframe":"15m","riskProfile":"low"}'::jsonb,
  repeat('d', 64),
  'nova-approval.v1',
  now() + interval '10 minutes'
) \gset

SELECT (
  count(*) = 1
  AND min(event_type) = 'requested'
  AND min(actor_type) = 'owner'
  AND min(to_status) = 'pending'
) AS request_event_written
FROM public.nova_approval_events
WHERE approval_id = :'audit_approval_id' \gset
\if :request_event_written
\else
  \echo 'FAIL: request event was not written atomically'
  \quit 1
\endif

-- Authenticated clients have read-only access to their own event history.
SELECT (
  NOT has_table_privilege('authenticated', 'public.nova_approval_events', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.nova_approval_events', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.nova_approval_events', 'DELETE')
) AS client_event_mutations_denied \gset
\if :client_event_mutations_denied
\else
  \echo 'FAIL: authenticated role has event mutation privileges'
  \quit 1
\endif

-- Owner B sees no events for owner A.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);

SELECT (count(*) = 0) AS foreign_events_hidden
FROM public.nova_approval_events
WHERE approval_id = :'audit_approval_id' \gset
\if :foreign_events_hidden
\else
  \echo 'FAIL: foreign approval audit events were visible'
  \quit 1
\endif

-- Owner B cannot resolve A's approval and this must not create another event.
SELECT (result_code = 'not_found') AS foreign_resolution_denied
FROM public.nova_resolve_approval(
  :'audit_approval_id', 'approve', NULL, NULL, 'nova-approval.v1'
) \gset
\if :foreign_resolution_denied
\else
  \echo 'FAIL: foreign approval was resolved'
  \quit 1
\endif

-- Owner A approves once. The event is recorded with the human actor and note.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

SELECT (result_code = 'resolved' AND status = 'approved') AS audit_approval_resolved
FROM public.nova_resolve_approval(
  :'audit_approval_id', 'approve', 'Approved for research review only', NULL, 'nova-approval.v1'
) \gset
\if :audit_approval_resolved
\else
  \echo 'FAIL: owner approval did not resolve'
  \quit 1
\endif

SELECT (
  count(*) = 2
  AND count(*) FILTER (WHERE event_type = 'approved'
    AND actor_type = 'owner'
    AND actor_user_id = '33333333-3333-4333-8333-333333333333'::uuid
    AND from_status = 'pending'
    AND to_status = 'approved'
    AND decision_note = 'Approved for research review only') = 1
  AND (SELECT array_agg(event_type ORDER BY event_sequence)
       FROM public.nova_approval_events
       WHERE approval_id = :'audit_approval_id') = ARRAY['requested', 'approved']::text[]
) AS approval_event_appended
FROM public.nova_approval_events
WHERE approval_id = :'audit_approval_id' \gset
\if :approval_event_appended
\else
  \echo 'FAIL: approval event is missing, unordered or malformed'
  \quit 1
\endif

SELECT (result_code = 'already_resolved') AS replay_rejected
FROM public.nova_resolve_approval(
  :'audit_approval_id', 'approve', NULL, NULL, 'nova-approval.v1'
) \gset
\if :replay_rejected
\else
  \echo 'FAIL: approval replay was not rejected'
  \quit 1
\endif

SELECT (count(*) = 2) AS replay_did_not_duplicate_event
FROM public.nova_approval_events
WHERE approval_id = :'audit_approval_id' \gset
\if :replay_did_not_duplicate_event
\else
  \echo 'FAIL: replay duplicated audit event'
  \quit 1
\endif

-- Edit is a separate terminal event and does not imply approval.
SELECT id AS audit_edit_approval_id
FROM public.nova_create_approval(
  :'audit_thread_id',
  'strategy_draft_review',
  '{"title":"Draft to edit","summary":"Original draft awaiting a human review.","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  repeat('e', 64),
  'nova-approval.v1',
  now() + interval '10 minutes'
) \gset

SELECT (result_code = 'resolved' AND status = 'edited') AS edit_saved
FROM public.nova_resolve_approval(
  :'audit_edit_approval_id',
  'edit',
  'Edited for another review',
  '{"title":"Draft to edit","summary":"Revised research-only draft.","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  'nova-approval.v1'
) \gset
\if :edit_saved
\else
  \echo 'FAIL: edit did not resolve as edited'
  \quit 1
\endif

SELECT (
  count(*) = 2
  AND count(*) FILTER (WHERE event_type = 'edited'
    AND decision_payload ->> 'summary' = 'Revised research-only draft.'
    AND actor_type = 'owner') = 1
) AS edit_event_saved
FROM public.nova_approval_events
WHERE approval_id = :'audit_edit_approval_id' \gset
\if :edit_event_saved
\else
  \echo 'FAIL: edit event payload was not preserved'
  \quit 1
\endif

-- Expiry is system-attributed. Only this disposable CI database bypasses the request guard
-- to move the clock; the normal resolver still performs the actual expiry transition.
SELECT id AS audit_expiry_approval_id
FROM public.nova_create_approval(
  :'audit_thread_id',
  'strategy_draft_review',
  '{"title":"Draft to expire","summary":"Research request for expiry audit test.","market":"XAU/USD","timeframe":"1h","riskProfile":"low"}'::jsonb,
  repeat('f', 64),
  'nova-approval.v1',
  now() + interval '10 minutes'
) \gset

RESET ROLE;
ALTER TABLE public.nova_approval_requests DISABLE TRIGGER nova_approval_guard_update;
UPDATE public.nova_approval_requests
SET expires_at = now() - interval '1 second'
WHERE id = :'audit_expiry_approval_id';
ALTER TABLE public.nova_approval_requests ENABLE TRIGGER nova_approval_guard_update;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

SELECT (result_code = 'expired' AND status = 'expired') AS expiry_resolution_recorded
FROM public.nova_resolve_approval(
  :'audit_expiry_approval_id', 'approve', NULL, NULL, 'nova-approval.v1'
) \gset
\if :expiry_resolution_recorded
\else
  \echo 'FAIL: expired request was not resolved as expired'
  \quit 1
\endif

SELECT (
  count(*) = 2
  AND count(*) FILTER (WHERE event_type = 'expired'
    AND actor_type = 'system'
    AND actor_user_id IS NULL
    AND from_status = 'pending'
    AND to_status = 'expired') = 1
) AS system_expiry_event_saved
FROM public.nova_approval_events
WHERE approval_id = :'audit_expiry_approval_id' \gset
\if :system_expiry_event_saved
\else
  \echo 'FAIL: system expiry event is missing or misattributed'
  \quit 1
\endif

-- Both event UPDATE and DELETE are blocked; FK-driven account erasure remains allowed.
RESET ROLE;
DO $$
DECLARE
  v_event_id uuid;
  v_update_blocked boolean := false;
  v_delete_blocked boolean := false;
  v_truncate_blocked boolean := false;
BEGIN
  SELECT id INTO v_event_id
  FROM public.nova_approval_events
  WHERE user_id = '33333333-3333-4333-8333-333333333333'::uuid
  ORDER BY event_sequence
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'audit event fixture missing';
  END IF;

  BEGIN
    UPDATE public.nova_approval_events
    SET decision_note = 'tampered'
    WHERE id = v_event_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'nova_approval_events_append_only' THEN
      RAISE;
    END IF;
    v_update_blocked := true;
  END;

  BEGIN
    DELETE FROM public.nova_approval_events WHERE id = v_event_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'nova_approval_events_append_only' THEN
      RAISE;
    END IF;
    v_delete_blocked := true;
  END;

  BEGIN
    EXECUTE 'TRUNCATE TABLE public.nova_approval_events';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'nova_approval_events_append_only' THEN
      RAISE;
    END IF;
    v_truncate_blocked := true;
  END;

  IF NOT v_update_blocked OR NOT v_delete_blocked OR NOT v_truncate_blocked THEN
    RAISE EXCEPTION 'direct event mutation or truncation was not blocked';
  END IF;
END;
$;

-- Account erasure cascades through the parent request and removes retained audit rows.
DELETE FROM auth.users
WHERE id = '33333333-3333-4333-8333-333333333333';

SELECT (count(*) = 0) AS account_erasure_cascades_events
FROM public.nova_approval_events
WHERE user_id = '33333333-3333-4333-8333-333333333333' \gset
\if :account_erasure_cascades_events
\else
  \echo 'FAIL: account erasure left orphaned audit events'
  \quit 1
\endif

ROLLBACK;
\echo 'PASS: append-only request/decision/edit/expiry events; owner isolation; replay; account erasure'

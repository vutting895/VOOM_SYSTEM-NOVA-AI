-- Pending NOVA approval audit extension.
-- Keep in pending-migrations until Production migration lineage PRs #231/#233 are reconciled.
-- This records human review history only; it never grants broker execution authority.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.nova_approval_requests'::regclass
      AND conname = 'nova_approval_requests_event_identity_key'
  ) THEN
    ALTER TABLE public.nova_approval_requests
      ADD CONSTRAINT nova_approval_requests_event_identity_key
      UNIQUE (id, thread_id, user_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.nova_approval_events (
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('requested', 'approved', 'rejected', 'edited', 'expired', 'cancelled')
  ),
  actor_type text NOT NULL CHECK (actor_type IN ('owner', 'system')),
  actor_user_id uuid,
  from_status text CHECK (
    from_status IS NULL OR from_status IN (
      'pending', 'approved', 'rejected', 'edited', 'expired', 'cancelled'
    )
  ),
  to_status text NOT NULL CHECK (
    to_status IN ('pending', 'approved', 'rejected', 'edited', 'expired', 'cancelled')
  ),
  policy_version text NOT NULL CHECK (policy_version = 'nova-approval.v1'),
  proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[a-f0-9]{64}$'),
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  decision_payload jsonb,
  decision_payload_hash text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT nova_approval_events_request_owner_fk
    FOREIGN KEY (approval_id, thread_id, user_id)
    REFERENCES public.nova_approval_requests(id, thread_id, user_id)
    ON DELETE CASCADE,

  CONSTRAINT nova_approval_events_actor_check
    CHECK (
      (actor_type = 'owner' AND actor_user_id = user_id)
      OR (actor_type = 'system' AND actor_user_id IS NULL)
    ),

  CONSTRAINT nova_approval_events_transition_check
    CHECK (
      (event_type = 'requested' AND from_status IS NULL AND to_status = 'pending'
        AND actor_type = 'owner')
      OR (event_type = 'approved' AND from_status = 'pending' AND to_status = 'approved'
        AND actor_type = 'owner')
      OR (event_type = 'rejected' AND from_status = 'pending' AND to_status = 'rejected'
        AND actor_type = 'owner')
      OR (event_type = 'edited' AND from_status = 'pending' AND to_status = 'edited'
        AND actor_type = 'owner')
      OR (event_type = 'expired' AND from_status = 'pending' AND to_status = 'expired'
        AND actor_type = 'system')
      OR (event_type = 'cancelled' AND from_status = 'pending' AND to_status = 'cancelled'
        AND actor_type = 'owner')
    ),

  CONSTRAINT nova_approval_events_payload_check
    CHECK (
      (event_type = 'edited'
        AND decision_payload IS NOT NULL
        AND private.nova_valid_strategy_draft_proposal(decision_payload)
        AND decision_payload_hash IS NOT NULL
        AND decision_payload_hash ~ '^[a-f0-9]{64}$')
      OR (event_type <> 'edited'
        AND decision_payload IS NULL
        AND decision_payload_hash IS NULL)
    )
);

-- Keep the candidate safe to re-apply after an interrupted local validation run.
ALTER TABLE public.nova_approval_events
  ADD COLUMN IF NOT EXISTS decision_payload_hash text;

-- Temporarily rebuild the immutability trigger during migration so legacy edited
-- events can receive their integrity hash before the guard is restored.
DROP TRIGGER IF EXISTS nova_approval_events_immutable ON public.nova_approval_events;

UPDATE public.nova_approval_events
SET decision_payload_hash = encode(
  extensions.digest(convert_to(decision_payload::text, 'UTF8'), 'sha256'),
  'hex'
)
WHERE event_type = 'edited'
  AND decision_payload IS NOT NULL
  AND decision_payload_hash IS NULL;

ALTER TABLE public.nova_approval_events
  DROP CONSTRAINT IF EXISTS nova_approval_events_payload_check;
ALTER TABLE public.nova_approval_events
  ADD CONSTRAINT nova_approval_events_payload_check
  CHECK (
    (event_type = 'edited'
      AND decision_payload IS NOT NULL
      AND private.nova_valid_strategy_draft_proposal(decision_payload)
      AND decision_payload_hash IS NOT NULL
      AND decision_payload_hash ~ '^[a-f0-9]{64}$')
    OR (event_type <> 'edited'
      AND decision_payload IS NULL
      AND decision_payload_hash IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS nova_approval_events_one_type_per_request_idx
  ON public.nova_approval_events (approval_id, event_type);

CREATE INDEX IF NOT EXISTS nova_approval_events_owner_history_idx
  ON public.nova_approval_events (user_id, approval_id, event_sequence ASC);

ALTER TABLE public.nova_approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nova_approval_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.nova_approval_events TO authenticated;

DROP POLICY IF EXISTS nova_approval_events_select_own ON public.nova_approval_events;
CREATE POLICY nova_approval_events_select_own ON public.nova_approval_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.nova_approval_events_guard_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Permit FK-driven erasure when the owning user/thread/request is deleted.
  -- A direct DELETE remains blocked; ordinary application roles have no DELETE grant.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'nova_approval_events_append_only';
END;
$function$;

REVOKE ALL ON FUNCTION private.nova_approval_events_guard_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS nova_approval_events_immutable ON public.nova_approval_events;
CREATE TRIGGER nova_approval_events_immutable
  BEFORE UPDATE OR DELETE ON public.nova_approval_events
  FOR EACH ROW EXECUTE FUNCTION private.nova_approval_events_guard_mutation();

DROP TRIGGER IF EXISTS nova_approval_events_no_truncate ON public.nova_approval_events;
CREATE TRIGGER nova_approval_events_no_truncate
  BEFORE TRUNCATE ON public.nova_approval_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.nova_approval_events_guard_mutation();

CREATE OR REPLACE FUNCTION private.nova_capture_approval_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_event_type text;
  v_actor_type text;
  v_actor_user_id uuid;
  v_from_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'requested';
    v_actor_type := 'owner';
    v_actor_user_id := NEW.user_id;
    v_from_status := NULL;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_event_type := NEW.status;
    v_from_status := OLD.status;

    IF NEW.status = 'expired' THEN
      v_actor_type := 'system';
      v_actor_user_id := NULL;
    ELSE
      v_actor_type := 'owner';
      v_actor_user_id := NEW.user_id;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.nova_approval_events (
    approval_id,
    thread_id,
    user_id,
    event_type,
    actor_type,
    actor_user_id,
    from_status,
    to_status,
    policy_version,
    proposal_hash,
    decision_note,
    decision_payload,
    decision_payload_hash,
    created_at
  )
  VALUES (
    NEW.id,
    NEW.thread_id,
    NEW.user_id,
    v_event_type,
    v_actor_type,
    v_actor_user_id,
    v_from_status,
    NEW.status,
    NEW.policy_version,
    NEW.proposal_hash,
    CASE WHEN NEW.status IN ('approved', 'rejected', 'edited') THEN NEW.decision_note ELSE NULL END,
    CASE WHEN NEW.status = 'edited' THEN NEW.decision_payload ELSE NULL END,
    CASE WHEN NEW.status = 'edited' THEN encode(
      extensions.digest(convert_to(NEW.decision_payload::text, 'UTF8'), 'sha256'), 'hex'
    ) ELSE NULL END,
    clock_timestamp()
  )
  ON CONFLICT (approval_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.nova_capture_approval_event()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS nova_approval_capture_event ON public.nova_approval_requests;
CREATE TRIGGER nova_approval_capture_event
  AFTER INSERT OR UPDATE OF status ON public.nova_approval_requests
  FOR EACH ROW EXECUTE FUNCTION private.nova_capture_approval_event();

-- Backfill requests created before this audit extension was installed.
INSERT INTO public.nova_approval_events (
  approval_id, thread_id, user_id, event_type, actor_type, actor_user_id,
  from_status, to_status, policy_version, proposal_hash, created_at
)
SELECT
  a.id, a.thread_id, a.user_id, 'requested', 'owner', a.user_id,
  NULL, 'pending', a.policy_version, a.proposal_hash, a.created_at
FROM public.nova_approval_requests AS a
ON CONFLICT (approval_id, event_type) DO NOTHING;

INSERT INTO public.nova_approval_events (
  approval_id, thread_id, user_id, event_type, actor_type, actor_user_id,
  from_status, to_status, policy_version, proposal_hash,
  decision_note, decision_payload, decision_payload_hash, created_at
)
SELECT
  a.id,
  a.thread_id,
  a.user_id,
  a.status,
  CASE WHEN a.status = 'expired' THEN 'system' ELSE 'owner' END,
  CASE WHEN a.status = 'expired' THEN NULL ELSE a.user_id END,
  'pending',
  a.status,
  a.policy_version,
  a.proposal_hash,
  CASE WHEN a.status IN ('approved', 'rejected', 'edited') THEN a.decision_note ELSE NULL END,
  CASE WHEN a.status = 'edited' THEN a.decision_payload ELSE NULL END,
  CASE WHEN a.status = 'edited' THEN encode(
    extensions.digest(convert_to(a.decision_payload::text, 'UTF8'), 'sha256'), 'hex'
  ) ELSE NULL END,
  COALESCE(a.decided_at, a.updated_at, a.created_at)
FROM public.nova_approval_requests AS a
WHERE a.status <> 'pending'
ON CONFLICT (approval_id, event_type) DO NOTHING;

COMMENT ON TABLE public.nova_approval_events IS
  'Append-only owner-scoped audit history for human strategy-draft review. It is not broker execution authority.';
COMMENT ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) IS
  'Creates an owner-bound review request; nova_approval_events captures requested history in the same transaction.';
COMMENT ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) IS
  'Resolves a review request once; nova_approval_events captures the terminal decision in the same transaction.';
NOTIFY pgrst, 'reload schema';

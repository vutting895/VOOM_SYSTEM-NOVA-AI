-- Durable, owner-scoped NOVA review workflow. It cannot authorize broker writes.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.nova_agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'NOVA review' CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'awaiting_review', 'closed')),
  policy_version text NOT NULL DEFAULT 'nova-approval.v1' CHECK (policy_version = 'nova-approval.v1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS nova_agent_threads_user_updated_idx
  ON public.nova_agent_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.nova_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type = 'strategy_draft_review'),
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL CHECK (policy_version = 'nova-approval.v1'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'edited', 'expired', 'cancelled')),
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  decision_payload jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT nova_approval_owner_thread_fk
    FOREIGN KEY (thread_id, user_id)
    REFERENCES public.nova_agent_threads(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS nova_approval_user_thread_created_idx
  ON public.nova_approval_requests (user_id, thread_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS nova_one_pending_approval_per_thread
  ON public.nova_approval_requests (thread_id) WHERE status = 'pending';

ALTER TABLE public.nova_agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nova_approval_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nova_agent_threads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.nova_approval_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.nova_agent_threads TO authenticated;
GRANT SELECT ON TABLE public.nova_approval_requests TO authenticated;

DROP POLICY IF EXISTS nova_agent_threads_select_own ON public.nova_agent_threads;
CREATE POLICY nova_agent_threads_select_own ON public.nova_agent_threads
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS nova_agent_threads_insert_own_active ON public.nova_agent_threads;
CREATE POLICY nova_agent_threads_insert_own_active ON public.nova_agent_threads
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND state = 'active' AND policy_version = 'nova-approval.v1'
  );
DROP POLICY IF EXISTS nova_approval_select_own ON public.nova_approval_requests;
CREATE POLICY nova_approval_select_own ON public.nova_approval_requests
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.nova_agent_threads t
      WHERE t.id = nova_approval_requests.thread_id AND t.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION private.nova_valid_strategy_draft_proposal(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $function$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p)) <> 5
     OR (p - ARRAY['title','summary','market','timeframe','riskProfile']::text[]) <> '{}'::jsonb THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'title') <> 'string' OR char_length(btrim(p->>'title')) NOT BETWEEN 1 AND 120
     OR jsonb_typeof(p->'summary') <> 'string' OR char_length(btrim(p->>'summary')) NOT BETWEEN 1 AND 600 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'market') NOT IN ('string','null')
     OR (jsonb_typeof(p->'market') = 'string' AND p->>'market' NOT IN ('BTC/USDT','ETH/USDT','EUR/USD','XAU/USD','US30')) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'timeframe') NOT IN ('string','null')
     OR (jsonb_typeof(p->'timeframe') = 'string' AND p->>'timeframe' NOT IN ('5m','15m','1h','4h','1d')) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p->'riskProfile') NOT IN ('string','null')
     OR (jsonb_typeof(p->'riskProfile') = 'string' AND p->>'riskProfile' NOT IN ('low','medium','high')) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION private.nova_valid_strategy_draft_proposal(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.nova_approval_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.thread_id IS DISTINCT FROM NEW.thread_id
     OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.request_type IS DISTINCT FROM NEW.request_type
     OR OLD.proposal IS DISTINCT FROM NEW.proposal OR OLD.proposal_hash IS DISTINCT FROM NEW.proposal_hash
     OR OLD.policy_version IS DISTINCT FROM NEW.policy_version OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'nova_approval_immutable_fields';
  END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'nova_approval_already_resolved'; END IF;
  IF NEW.status = 'expired' THEN
    IF OLD.expires_at > now() THEN RAISE EXCEPTION 'nova_approval_not_expired'; END IF;
  ELSE
    IF NEW.status NOT IN ('approved','rejected','edited') OR OLD.expires_at <= now()
       OR OLD.policy_version <> 'nova-approval.v1' THEN
      RAISE EXCEPTION 'nova_approval_invalid_transition';
    END IF;
  END IF;
  IF NEW.decision_note IS NOT NULL AND char_length(NEW.decision_note) > 300 THEN
    RAISE EXCEPTION 'nova_approval_note_too_long';
  END IF;
  IF NEW.status = 'edited' THEN
    IF NOT private.nova_valid_strategy_draft_proposal(NEW.decision_payload) THEN
      RAISE EXCEPTION 'nova_approval_invalid_edit';
    END IF;
  ELSIF NEW.decision_payload IS NOT NULL THEN
    RAISE EXCEPTION 'nova_approval_unexpected_decision_payload';
  END IF;
  NEW.decided_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS nova_approval_guard_update ON public.nova_approval_requests;
CREATE TRIGGER nova_approval_guard_update BEFORE UPDATE ON public.nova_approval_requests
  FOR EACH ROW EXECUTE FUNCTION private.nova_approval_guard_update();
REVOKE ALL ON FUNCTION private.nova_approval_guard_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.nova_create_approval_impl(
  p_thread_id uuid, p_request_type text, p_proposal jsonb, p_proposal_hash text,
  p_policy_version text, p_expires_at timestamptz
)
RETURNS TABLE(id uuid, thread_id uuid, request_type text, proposal jsonb, proposal_hash text,
              policy_version text, status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_user uuid := (SELECT auth.uid()); v_state text; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  IF p_request_type IS NULL OR p_request_type <> 'strategy_draft_review'
     OR p_policy_version IS NULL OR p_policy_version <> 'nova-approval.v1'
     OR p_proposal_hash IS NULL OR p_proposal_hash !~ '^[a-f0-9]{64}
    RAISE EXCEPTION 'nova_approval_request_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT t.state INTO v_state FROM public.nova_agent_threads t
    WHERE t.id = p_thread_id AND t.user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_state <> 'active' THEN
    RAISE EXCEPTION 'nova_thread_not_found_or_not_active' USING ERRCODE = 'P0001';
  END IF;
  -- Calculate the persisted hash in Postgres from jsonb's canonical representation.
  -- The client checksum is format-checked but never trusted as the stored integrity value.
  INSERT INTO public.nova_approval_requests AS a
    (thread_id,user_id,request_type,proposal,proposal_hash,policy_version,status,expires_at)
  VALUES (
    p_thread_id, v_user, p_request_type, p_proposal,
    encode(extensions.digest(convert_to(p_proposal::text, 'UTF8'), 'sha256'), 'hex'),
    p_policy_version, 'pending', p_expires_at
  )
  RETURNING a.id INTO v_id;
  UPDATE public.nova_agent_threads t SET state='awaiting_review',updated_at=now(),last_activity_at=now()
    WHERE t.id=p_thread_id AND t.user_id=v_user;
  RETURN QUERY SELECT a.id,a.thread_id,a.request_type,a.proposal,a.proposal_hash,
    a.policy_version,a.status,a.expires_at,a.created_at
    FROM public.nova_approval_requests a WHERE a.id=v_id AND a.user_id=v_user;
END;
$function$;

CREATE OR REPLACE FUNCTION private.nova_resolve_approval_impl(
  p_approval_id uuid, p_decision text, p_decision_note text, p_decision_payload jsonb, p_policy_version text
)
RETURNS TABLE(result_code text, request_id uuid, thread_id uuid, status text,
              decided_at timestamptz, decision_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_user uuid := (SELECT auth.uid()); v_row public.nova_approval_requests%ROWTYPE; v_status text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  SELECT a.* INTO v_row FROM public.nova_approval_requests a
    WHERE a.id=p_approval_id AND a.user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::timestamptz,NULL::jsonb; RETURN;
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN QUERY SELECT 'already_resolved'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,v_row.decision_payload; RETURN;
  END IF;
  IF v_row.expires_at <= now() THEN
    UPDATE public.nova_approval_requests a SET status='expired',decision_note=NULL,decision_payload=NULL
      WHERE a.id=v_row.id AND a.user_id=v_user;
    UPDATE public.nova_agent_threads t SET state='active',updated_at=now(),last_activity_at=now()
      WHERE t.id=v_row.thread_id AND t.user_id=v_user;
    RETURN QUERY SELECT 'expired'::text,v_row.id,v_row.thread_id,'expired'::text,now(),NULL::jsonb; RETURN;
  END IF;
  IF p_policy_version IS NULL OR v_row.policy_version <> 'nova-approval.v1'
     OR p_policy_version <> 'nova-approval.v1' THEN
    RETURN QUERY SELECT 'policy_mismatch'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,NULL::jsonb; RETURN;
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve','reject','edit')
     OR (p_decision_note IS NOT NULL AND char_length(p_decision_note) > 300)
     OR (p_decision='edit' AND NOT private.nova_valid_strategy_draft_proposal(p_decision_payload))
     OR (p_decision<>'edit' AND p_decision_payload IS NOT NULL) THEN
    RETURN QUERY SELECT 'invalid_decision'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,NULL::jsonb; RETURN;
  END IF;
  v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'edited' END;
  UPDATE public.nova_approval_requests a
    SET status=v_status,decision_note=NULLIF(btrim(p_decision_note), ''),
        decision_payload=CASE WHEN p_decision='edit' THEN p_decision_payload ELSE NULL END
    WHERE a.id=v_row.id AND a.user_id=v_user AND a.status='pending';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'already_resolved'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,NULL::jsonb; RETURN;
  END IF;
  UPDATE public.nova_agent_threads t SET state='active',updated_at=now(),last_activity_at=now()
    WHERE t.id=v_row.thread_id AND t.user_id=v_user;
  RETURN QUERY SELECT 'resolved'::text,a.id,a.thread_id,a.status,a.decided_at,a.decision_payload
    FROM public.nova_approval_requests a WHERE a.id=v_row.id AND a.user_id=v_user;
END;
$function$;

-- Definer implementations are narrowly scoped and always check auth.uid() + owner.
REVOKE ALL ON FUNCTION private.nova_create_approval_impl(uuid,text,jsonb,text,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.nova_resolve_approval_impl(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.nova_create_approval_impl(uuid,text,jsonb,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION private.nova_resolve_approval_impl(uuid,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.nova_create_approval(
  p_thread_id uuid, p_request_type text, p_proposal jsonb, p_proposal_hash text,
  p_policy_version text, p_expires_at timestamptz
)
RETURNS TABLE(id uuid, thread_id uuid, request_type text, proposal jsonb, proposal_hash text,
              policy_version text, status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT * FROM private.nova_create_approval_impl(
    p_thread_id,p_request_type,p_proposal,p_proposal_hash,p_policy_version,p_expires_at
  );
$function$;

CREATE OR REPLACE FUNCTION public.nova_resolve_approval(
  p_approval_id uuid, p_decision text, p_decision_note text DEFAULT NULL,
  p_decision_payload jsonb DEFAULT NULL, p_policy_version text DEFAULT 'nova-approval.v1'
)
RETURNS TABLE(result_code text, request_id uuid, thread_id uuid, status text,
              decided_at timestamptz, decision_payload jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT * FROM private.nova_resolve_approval_impl(
    p_approval_id,p_decision,p_decision_note,p_decision_payload,p_policy_version
  );
$function$;

REVOKE ALL ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) TO authenticated;

COMMENT ON TABLE public.nova_agent_threads IS
  'Owner-scoped durable thread metadata for draft reviews; no chat transcript, access token or broker secret is stored.';
COMMENT ON TABLE public.nova_approval_requests IS
  'Owner-scoped expiring strategy-draft review requests. Acceptance never grants broker or order execution.';
COMMENT ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) IS
  'SECURITY INVOKER wrapper for narrow authenticated, owner-bound approval creation.';
COMMENT ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) IS
  'SECURITY INVOKER wrapper for atomic one-time owner-bound review resolution and expiry/policy checks.';
NOTIFY pgrst, 'reload schema';

     OR p_expires_at IS NULL
     OR NOT private.nova_valid_strategy_draft_proposal(p_proposal)
     OR p_expires_at <= now() + interval '1 minute'
     OR p_expires_at > now() + interval '15 minutes' THEN
    RAISE EXCEPTION 'nova_approval_request_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT t.state INTO v_state FROM public.nova_agent_threads t
    WHERE t.id = p_thread_id AND t.user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_state <> 'active' THEN
    RAISE EXCEPTION 'nova_thread_not_found_or_not_active' USING ERRCODE = 'P0001';
  END IF;
  -- Calculate the persisted hash in Postgres from jsonb's canonical representation.
  -- The client checksum is format-checked but never trusted as the stored integrity value.
  INSERT INTO public.nova_approval_requests AS a
    (thread_id,user_id,request_type,proposal,proposal_hash,policy_version,status,expires_at)
  VALUES (
    p_thread_id, v_user, p_request_type, p_proposal,
    encode(extensions.digest(convert_to(p_proposal::text, 'UTF8'), 'sha256'), 'hex'),
    p_policy_version, 'pending', p_expires_at
  )
  RETURNING a.id INTO v_id;
  UPDATE public.nova_agent_threads t SET state='awaiting_review',updated_at=now(),last_activity_at=now()
    WHERE t.id=p_thread_id AND t.user_id=v_user;
  RETURN QUERY SELECT a.id,a.thread_id,a.request_type,a.proposal,a.proposal_hash,
    a.policy_version,a.status,a.expires_at,a.created_at
    FROM public.nova_approval_requests a WHERE a.id=v_id AND a.user_id=v_user;
END;
$function$;

CREATE OR REPLACE FUNCTION private.nova_resolve_approval_impl(
  p_approval_id uuid, p_decision text, p_decision_note text, p_decision_payload jsonb, p_policy_version text
)
RETURNS TABLE(result_code text, request_id uuid, thread_id uuid, status text,
              decided_at timestamptz, decision_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_user uuid := (SELECT auth.uid()); v_row public.nova_approval_requests%ROWTYPE; v_status text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501'; END IF;
  SELECT a.* INTO v_row FROM public.nova_approval_requests a
    WHERE a.id=p_approval_id AND a.user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::timestamptz,NULL::jsonb; RETURN;
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN QUERY SELECT 'already_resolved'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,v_row.decision_payload; RETURN;
  END IF;
  IF v_row.expires_at <= now() THEN
    UPDATE public.nova_approval_requests a SET status='expired',decision_note=NULL,decision_payload=NULL
      WHERE a.id=v_row.id AND a.user_id=v_user;
    UPDATE public.nova_agent_threads t SET state='active',updated_at=now(),last_activity_at=now()
      WHERE t.id=v_row.thread_id AND t.user_id=v_user;
    RETURN QUERY SELECT 'expired'::text,v_row.id,v_row.thread_id,'expired'::text,now(),NULL::jsonb; RETURN;
  END IF;
  IF v_row.policy_version <> 'nova-approval.v1' OR p_policy_version <> 'nova-approval.v1' THEN
    RETURN QUERY SELECT 'policy_mismatch'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,NULL::jsonb; RETURN;
  END IF;
  IF p_decision NOT IN ('approve','reject','edit')
     OR (p_decision_note IS NOT NULL AND char_length(p_decision_note) > 300)
     OR (p_decision='edit' AND NOT private.nova_valid_strategy_draft_proposal(p_decision_payload))
     OR (p_decision<>'edit' AND p_decision_payload IS NOT NULL) THEN
    RETURN QUERY SELECT 'invalid_decision'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,NULL::jsonb; RETURN;
  END IF;
  v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'edited' END;
  UPDATE public.nova_approval_requests a
    SET status=v_status,decision_note=NULLIF(btrim(p_decision_note), ''),
        decision_payload=CASE WHEN p_decision='edit' THEN p_decision_payload ELSE NULL END
    WHERE a.id=v_row.id AND a.user_id=v_user AND a.status='pending';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'already_resolved'::text,v_row.id,v_row.thread_id,v_row.status,v_row.decided_at,NULL::jsonb; RETURN;
  END IF;
  UPDATE public.nova_agent_threads t SET state='active',updated_at=now(),last_activity_at=now()
    WHERE t.id=v_row.thread_id AND t.user_id=v_user;
  RETURN QUERY SELECT 'resolved'::text,a.id,a.thread_id,a.status,a.decided_at,a.decision_payload
    FROM public.nova_approval_requests a WHERE a.id=v_row.id AND a.user_id=v_user;
END;
$function$;

-- Definer implementations are narrowly scoped and always check auth.uid() + owner.
REVOKE ALL ON FUNCTION private.nova_create_approval_impl(uuid,text,jsonb,text,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.nova_resolve_approval_impl(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.nova_create_approval_impl(uuid,text,jsonb,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION private.nova_resolve_approval_impl(uuid,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.nova_create_approval(
  p_thread_id uuid, p_request_type text, p_proposal jsonb, p_proposal_hash text,
  p_policy_version text, p_expires_at timestamptz
)
RETURNS TABLE(id uuid, thread_id uuid, request_type text, proposal jsonb, proposal_hash text,
              policy_version text, status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT * FROM private.nova_create_approval_impl(
    p_thread_id,p_request_type,p_proposal,p_proposal_hash,p_policy_version,p_expires_at
  );
$function$;

CREATE OR REPLACE FUNCTION public.nova_resolve_approval(
  p_approval_id uuid, p_decision text, p_decision_note text DEFAULT NULL,
  p_decision_payload jsonb DEFAULT NULL, p_policy_version text DEFAULT 'nova-approval.v1'
)
RETURNS TABLE(result_code text, request_id uuid, thread_id uuid, status text,
              decided_at timestamptz, decision_payload jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT * FROM private.nova_resolve_approval_impl(
    p_approval_id,p_decision,p_decision_note,p_decision_payload,p_policy_version
  );
$function$;

REVOKE ALL ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) TO authenticated;

COMMENT ON TABLE public.nova_agent_threads IS
  'Owner-scoped durable thread metadata for draft reviews; no chat transcript, access token or broker secret is stored.';
COMMENT ON TABLE public.nova_approval_requests IS
  'Owner-scoped expiring strategy-draft review requests. Acceptance never grants broker or order execution.';
COMMENT ON FUNCTION public.nova_create_approval(uuid,text,jsonb,text,text,timestamptz) IS
  'SECURITY INVOKER wrapper for narrow authenticated, owner-bound approval creation.';
COMMENT ON FUNCTION public.nova_resolve_approval(uuid,text,text,jsonb,text) IS
  'SECURITY INVOKER wrapper for atomic one-time owner-bound review resolution and expiry/policy checks.';
NOTIFY pgrst, 'reload schema';

-- Disposable PostgreSQL integration test for NOVA Video preparation and approval.
-- Runs only after the older Workspace baseline and the forward-only approval migration.
-- Test rows are isolated in a transaction and rolled back.
BEGIN;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

INSERT INTO public.nova_video_projects (id, user_id, title)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111',
        'Tenant A video project');

INSERT INTO public.nova_video_jobs (
  id, user_id, project_id, task_type, status, prompt, request,
  execution_mode, estimated_cost, idempotency_key
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'video_generation',
  'blocked_no_free_gpu',
  'Tenant A approved storyboard candidate',
  '{"schema_version":"nova.video-job.v2","director_plan":{"schemaVersion":"nova.director-plan.v1","frameRate":24}}'::jsonb,
  'free_only',
  0,
  'tenantAvideojob0001'
);

INSERT INTO public.nova_video_preparations (
  id, job_id, user_id, snapshot, snapshot_hash, planner_version
) VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  '{
    "schemaVersion":"nova.video-preparation.v1",
    "job":{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","projectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","taskType":"video_generation","status":"blocked_no_free_gpu"},
    "directorPlan":{"schemaVersion":"nova.director-plan.v1","frameRate":24},
    "productionPlan":{"schemaVersion":"nova.video-production-plan.v1","requiresHumanApproval":true,"executionEnabled":false,"status":"blocked_no_free_gpu"},
    "policy":{"requiresHumanApproval":true,"executionEnabled":false,"estimatedCost":0,"executionBlockers":["verified_zero_cost_gpu_unavailable","worker_dispatch_disabled"]}
  }'::jsonb,
  repeat('a', 64),
  '1.0.0'
);

INSERT INTO public.nova_video_approval_decisions (
  id, preparation_id, user_id, snapshot_hash, decision, decision_note
) VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '11111111-1111-4111-8111-111111111111',
  repeat('a', 64),
  'approved',
  'Reviewed by Tenant A'
);

DO $$
DECLARE
  project_count integer;
  job_count integer;
  preparation_count integer;
  decision_count integer;
BEGIN
  SELECT count(*) INTO project_count FROM public.nova_video_projects
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT count(*) INTO job_count FROM public.nova_video_jobs
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  SELECT count(*) INTO preparation_count FROM public.nova_video_preparations
    WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  SELECT count(*) INTO decision_count FROM public.nova_video_approval_decisions
    WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  IF project_count <> 1 OR job_count <> 1 OR preparation_count <> 1 OR decision_count <> 1 THEN
    RAISE EXCEPTION 'Tenant A cannot read its own complete Video approval chain';
  END IF;
END
$$;

-- A user may submit a preparation only when its Director plan matches
-- the persisted immutable job request. A forged plan is rejected by RLS.
INSERT INTO public.nova_video_jobs (
  id, user_id, project_id, task_type, status, prompt, request,
  execution_mode, estimated_cost, idempotency_key
) VALUES (
  '99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'video_generation',
  'blocked_no_free_gpu',
  'Tenant A job for forged snapshot rejection',
  '{"schema_version":"nova.video-job.v2","director_plan":{"schemaVersion":"nova.director-plan.v1","frameRate":24}}'::jsonb,
  'free_only',
  0,
  'tenantAforgedjob01'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_preparations (
      job_id, user_id, snapshot, snapshot_hash, planner_version
    ) VALUES (
      '99999999-9999-4999-8999-999999999999',
      '11111111-1111-4111-8111-111111111111',
      '{
        "schemaVersion":"nova.video-preparation.v1",
        "job":{"id":"99999999-9999-4999-8999-999999999999","projectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","taskType":"video_generation","status":"blocked_no_free_gpu"},
        "directorPlan":{"schemaVersion":"nova.director-plan.v1","frameRate":23},
        "productionPlan":{"schemaVersion":"nova.video-production-plan.v1","requiresHumanApproval":true,"executionEnabled":false,"status":"blocked_no_free_gpu"},
        "policy":{"requiresHumanApproval":true,"executionEnabled":false,"estimatedCost":0}
      }'::jsonb,
      repeat('c', 64),
      '1.0.0'
    );
    RAISE EXCEPTION 'Forged Director plan unexpectedly passed RLS';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.nova_video_approval_decisions (
      preparation_id, user_id, snapshot_hash, decision, execution_authorized
    ) VALUES (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '11111111-1111-4111-8111-111111111111',
      repeat('a', 64),
      'approved',
      true
    );
    RAISE EXCEPTION 'Execution authorization unexpectedly accepted on human approval';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

-- A second preparation for the same owner/job and a second decision for the
-- same owner/preparation must fail. Existing snapshots and decisions are immutable.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_preparations (
      job_id, user_id, snapshot, snapshot_hash, planner_version
    ) VALUES (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '11111111-1111-4111-8111-111111111111',
      '{
        "schemaVersion":"nova.video-preparation.v1",
        "job":{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","projectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","taskType":"video_generation","status":"blocked_no_free_gpu"},
        "directorPlan":{"schemaVersion":"nova.director-plan.v1","frameRate":24},
        "productionPlan":{"schemaVersion":"nova.video-production-plan.v1","requiresHumanApproval":true,"executionEnabled":false,"status":"blocked_no_free_gpu"},
        "policy":{"requiresHumanApproval":true,"executionEnabled":false,"estimatedCost":0}
      }'::jsonb,
      repeat('b', 64),
      '1.0.0'
    );
    RAISE EXCEPTION 'Duplicate preparation unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.nova_video_approval_decisions (
      preparation_id, user_id, snapshot_hash, decision
    ) VALUES (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '11111111-1111-4111-8111-111111111111',
      repeat('a', 64),
      'rejected'
    );
    RAISE EXCEPTION 'Second approval decision unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$$;

-- Tenant B cannot see or attach rows to Tenant A's Video resources.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE
  project_count integer;
  job_count integer;
  preparation_count integer;
  decision_count integer;
BEGIN
  SELECT count(*) INTO project_count FROM public.nova_video_projects
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT count(*) INTO job_count FROM public.nova_video_jobs
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  SELECT count(*) INTO preparation_count FROM public.nova_video_preparations
    WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  SELECT count(*) INTO decision_count FROM public.nova_video_approval_decisions
    WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  IF project_count <> 0 OR job_count <> 0 OR preparation_count <> 0 OR decision_count <> 0 THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A Video records';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_preparations (
      job_id, user_id, snapshot, snapshot_hash, planner_version
    ) VALUES (
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '22222222-2222-4222-8222-222222222222',
      '{
        "schemaVersion":"nova.video-preparation.v1",
        "job":{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","projectId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","taskType":"video_generation","status":"blocked_no_free_gpu"},
        "directorPlan":{"schemaVersion":"nova.director-plan.v1","frameRate":24},
        "productionPlan":{"schemaVersion":"nova.video-production-plan.v1","requiresHumanApproval":true,"executionEnabled":false,"status":"blocked_no_free_gpu"},
        "policy":{"requiresHumanApproval":true,"executionEnabled":false,"estimatedCost":0}
      }'::jsonb,
      repeat('a', 64),
      '1.0.0'
    );
    RAISE EXCEPTION 'Cross-tenant preparation insert unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation OR check_violation OR insufficient_privilege THEN
    NULL;
  END;
END
$$;

INSERT INTO public.nova_video_projects (id, user_id, title)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '22222222-2222-4222-8222-222222222222',
        'Tenant B video project');

INSERT INTO public.nova_video_jobs (
  id, user_id, project_id, task_type, status, prompt, request,
  execution_mode, estimated_cost, idempotency_key
) VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'video_generation',
  'blocked_no_free_gpu',
  'Tenant B own job',
  '{}'::jsonb,
  'free_only',
  0,
  'tenantBvideojob0001'
);

-- Authenticated clients cannot mutate or delete job, preparation, or approval history.
DO $$
BEGIN
  BEGIN
    UPDATE public.nova_video_preparations
      SET snapshot_hash = repeat('f', 64)
      WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    RAISE EXCEPTION 'Preparation update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.nova_video_approval_decisions
      WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    RAISE EXCEPTION 'Approval deletion unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.nova_video_jobs
      SET status = 'blocked_worker_unavailable'
      WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    RAISE EXCEPTION 'Job status update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

-- A decision must carry the same snapshot hash as the referenced preparation.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_approval_decisions (
      preparation_id, user_id, snapshot_hash, decision
    ) VALUES (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '22222222-2222-4222-8222-222222222222',
      repeat('f', 64),
      'approved'
    );
    RAISE EXCEPTION 'Cross-tenant approval insert unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation OR check_violation OR insufficient_privilege THEN
    NULL;
  END;
END
$$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.nova_video_preparations;
    RAISE EXCEPTION 'Anonymous preparation read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

ROLLBACK;

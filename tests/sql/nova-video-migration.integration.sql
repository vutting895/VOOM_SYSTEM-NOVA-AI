-- Disposable PostgreSQL integration test for NOVA Video Workspace RLS and hard constraints.
-- This runs only against a throwaway CI database and rolls back all test rows.
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
        'Tenant A project');

INSERT INTO public.nova_video_jobs (
  id, user_id, project_id, task_type, status, prompt,
  execution_mode, estimated_cost, idempotency_key
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'video_generation', 'blocked_no_free_gpu', 'tenant A prompt',
  'free_only', 0, 'tenantAjobkey0001'
);

DO $$
DECLARE
  project_count integer;
  job_count integer;
BEGIN
  SELECT count(*) INTO project_count
    FROM public.nova_video_projects
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT count(*) INTO job_count
    FROM public.nova_video_jobs
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  IF project_count <> 1 OR job_count <> 1 THEN
    RAISE EXCEPTION 'Tenant A could not read its own video records';
  END IF;
END
$$;

-- Switch to tenant B: A's rows must be invisible and A's project cannot be reused.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $$
DECLARE
  project_count integer;
  job_count integer;
BEGIN
  SELECT count(*) INTO project_count
    FROM public.nova_video_projects
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT count(*) INTO job_count
    FROM public.nova_video_jobs
    WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  IF project_count <> 0 OR job_count <> 0 THEN
    RAISE EXCEPTION 'Tenant B can read Tenant A video records';
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_jobs (
      user_id, project_id, task_type, status, prompt,
      execution_mode, estimated_cost, idempotency_key
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'video_analysis', 'blocked_worker_unavailable', 'cross-tenant attempt',
      'free_only', 0, 'tenantBcrosskey0001'
    );
    RAISE EXCEPTION 'Cross-tenant project reference unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END
$$;

INSERT INTO public.nova_video_projects (id, user_id, title)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '22222222-2222-4222-8222-222222222222',
        'Tenant B project');

DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_jobs (
      user_id, project_id, task_type, status, prompt,
      execution_mode, estimated_cost, idempotency_key
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'video_generation', 'blocked_no_free_gpu', 'paid request',
      'free_only', 0.01, 'tenantBpaidcost0001'
    );
    RAISE EXCEPTION 'Non-zero estimated cost unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.nova_video_jobs (
      user_id, project_id, task_type, status, prompt,
      execution_mode, estimated_cost, idempotency_key
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'video_generation', 'running', 'premature worker state',
      'free_only', 0, 'tenantBbadstatus0001'
    );
    RAISE EXCEPTION 'Executable job status unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

-- Authenticated users must not be able to mutate queued job metadata directly.
DO $$
BEGIN
  BEGIN
    UPDATE public.nova_video_jobs
      SET status = 'blocked_worker_unavailable'
      WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    RAISE EXCEPTION 'Direct job update unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

-- Anonymous role has no table access.
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.nova_video_projects;
    RAISE EXCEPTION 'Anonymous table read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

ROLLBACK;

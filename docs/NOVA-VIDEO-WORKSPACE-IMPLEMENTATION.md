# NOVA Video Workspace — CPU-only vertical slice

Date: 2026-10-31
Related architecture: `docs/NOVA-AI-VIDEO-PLATFORM-SPEC.md`
Delivery branch: `feat/nova-video-cpu-workspace-20261031`

## What this slice implements

- Authenticated NOVA route at `/video`, linked from the existing global navigation.
- Owner-scoped project metadata through `GET/POST /api/video/projects`.
- Owner-scoped job request metadata through `GET/POST /api/video/jobs`.
- Supabase migration for `nova_video_projects` and `nova_video_jobs`, with RLS and composite project-owner foreign key.
- Explicit free-only policy at the database boundary: `execution_mode='free_only'`, `estimated_cost=0`.
- Idempotency key uniqueness per user.
- UI clearly explains that jobs are recorded but not executed.

## Deliberate blockers

This is a metadata-only vertical slice. It does not upload or store media binaries, execute FFmpeg, call ComfyUI, run Whisper, invoke any hosted model API, dispatch a worker, or generate a video.

- Generation jobs are persisted as `blocked_no_free_gpu`.
- Analysis and edit/export jobs are persisted as `blocked_worker_unavailable`.
- No provider credentials, storage buckets, Worker bindings, secrets, or cloud resources are added.
- No hosted Supabase migration is applied by this PR.
- No billing, paid API, paid GPU, credit, or auto-top-up path exists in the new endpoints.

## Security properties

- All API routes authenticate using the existing `authenticateAgentRequest` helper before parsing request bodies.
- Queries include the authenticated user's ID and rely on Supabase RLS.
- A composite foreign key ensures a job's project belongs to the same user as the job.
- Client input cannot set owner, status, execution mode, model, or cost.
- Only an allowlisted task type and a bounded idempotency key are accepted.
- No service-role key or broker integration is used.

## Required verification before staging

1. Review the migration and API diff.
2. Confirm Frontend CI runs `tests/nova-video-workspace.test.mjs` on the exact PR head.
3. Run the migration only in an approved isolated Supabase local/staging environment; do not apply it to the production Supabase Free project as part of this PR.
4. Use two isolated test users to prove project/job owner reads and cross-tenant denial.
5. Verify `/video` authentication, create/list project, record blocked job, and confirm no worker/network dispatch.
6. Confirm Netlify Preview corresponds to the reviewed PR SHA.

## Completion status

The authenticated metadata workspace is implemented in this branch pending CI/review. End-to-end video production is **not complete**. It remains blocked on a verified zero-cost GPU, approved private media storage, worker runtime, model/checkpoint license review, and full integration tests. Do not represent the platform as production-ready or video generation as functional until those gates pass.

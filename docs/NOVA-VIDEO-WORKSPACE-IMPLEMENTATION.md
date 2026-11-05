# NOVA Video API — metadata-only vertical slice

Date: 2026-10-31
Related architecture: `docs/NOVA-AI-VIDEO-PLATFORM-SPEC.md`
Delivery branch: `feat/nova-video-cpu-workspace-20261031`

## What this slice implements

- Authenticated external API routes `GET/POST /api/video/projects` and `GET/POST /api/video/jobs`.
- Exact-origin CORS preflight and response handling for independently hosted frontend clients (configured through `NOVA_VIDEO_ALLOWED_ORIGINS`).
- OpenAPI contract at `docs/openapi/nova-video-api.yaml` and external integration guide at `docs/NOVA-VIDEO-API-INTEGRATION.md`.
- Owner-scoped project metadata through `GET/POST /api/video/projects`.
- Owner-scoped job request metadata through `GET/POST /api/video/jobs`.
- Supabase migration for `nova_video_projects` and `nova_video_jobs`, with RLS and composite project-owner foreign key.
- Explicit free-only policy at the database boundary: `execution_mode='free_only'`, `estimated_cost=0`.
- Idempotency key uniqueness per user.
- Existing `/video` page is a legacy/demo client only; the external consumer frontend is out of scope and can call the API directly.

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

## Free cloud video-analysis candidate — not enabled

Cloudflare Workers AI now offers `@cf/cloudflare/clef-omni`, a hosted multimodal decision model that accepts MP4/WebM inputs (up to two videos per request, 16 MiB and 60 seconds per clip; combined audio/video media is limited to 16 MiB decoded). It samples video at 2 frames/second and returns probability-scored answers to typed questions. It is useful for bounded clip classification (for example, scene/action/speech-presence checks), but it is **not** a freeform video summarizer, video generator, editor, or export engine.

The Workers AI documentation lists a daily no-charge allocation of 10,000 Neurons. On Workers Free, operations fail after the allocation is exhausted; on Workers Paid, usage above the allocation is billed. The current deployed `voom-system-nova-ai` Worker reports `usage_model=standard` through the read-only Cloudflare API. Cloudflare documents Standard usage for Workers Paid accounts; the connected session does not have Billing Read permission to independently verify the account subscription or billing state. Therefore this PR must not call Clef-Omni or claim that it is eligible for the user's Free-only constraint. No video was sent to Workers AI and no inference was run.

Revisit this option only after the account owner verifies the Workers plan, billing state and AI usage allowance in the Cloudflare dashboard. If verified as eligible, implement a separately gated, short-clip analysis capability with strict media limits, tenant auth, no persistence by default, and an explicit daily quota ceiling. This does not solve text/image-to-video generation or editing.

References:
- https://developers.cloudflare.com/workers-ai/models/clef-omni/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/

## Required verification before staging

1. Review the migration, API, UI and CI diff.
2. Confirm Frontend CI runs `tests/nova-video-workspace.test.mjs` on the exact PR head.
3. Confirm `NOVA Video Migration CI` applies the migration to ephemeral PostgreSQL and passes the two-tenant RLS, foreign-project denial, no-update-grant, blocked-status and zero-cost constraint checks.
4. Run the migration only in an approved isolated Supabase local/staging environment; do not apply it to the production Supabase Free project as part of this PR.
5. Use two isolated Supabase Auth test users to prove API-level project/job owner reads and cross-tenant denial.
6. Verify API authentication, CORS from the allowlisted external frontend origin, create/list project, record blocked job, and confirm no worker/network dispatch.
7. Confirm Netlify Preview corresponds to the reviewed PR SHA.

The PostgreSQL integration suite is a disposable CI database test, not evidence that the hosted Supabase project has received the migration or that the hosted API has passed tenant-isolation acceptance.

## Completion status

The authenticated metadata API is implemented in this branch pending CI/review. End-to-end video production is **not complete**. It remains blocked on a verified zero-cost GPU, approved private media storage, worker runtime, model/checkpoint license review, and full integration tests. Do not represent the platform as production-ready or video generation as functional until those gates pass.

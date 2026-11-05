# NOVA Video API Worker

This package exposes the API-only NOVA Video control plane on Cloudflare Workers. It is designed for the independently hosted consumer frontend; this repository does not recreate or host that UI.

## Endpoints

- `GET /api/video/skills` — authenticated 22-skill catalog.
- `POST /api/video/plan` — authenticated NOVA Director deterministic shot planning (CPU-only, no model inference).\n- `POST /api/video/production-plan` — projects the Director timeline into per-scene Engine generation-task contracts and approval/QC/delivery stages; all generation remains blocked.
- `POST /api/video/jobs` accepts an optional `brief`; when supplied, it stores the generated Director plan in the tenant-owned `request` JSONB field.
- `GET/POST /api/video/projects` — owner-scoped project metadata.
- `GET/POST /api/video/jobs` — owner-scoped blocked job metadata.

## Required Worker variables

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `NOVA_VIDEO_ALLOWED_ORIGINS` — exact comma-separated HTTPS origins; no wildcard and no default allowlist.

The Worker validates the Supabase session against `/auth/v1/user` and calls PostgREST with the same user's bearer token and publishable key. Database row-level security remains authoritative. No service-role key is accepted or used.

## Capability boundary

This Worker provides deterministic Director planning, Worker-safe production-plan projection and records metadata only. The planning and production-plan endpoints do not invoke an LLM, video model, GPU, database or worker. The production planner creates immutable task-contract data from the Director timeline; it does not dispatch those tasks. Generation remains `blocked_no_free_gpu`; analysis/edit/export remain `blocked_worker_unavailable`. All results keep `executionEnabled=false` and `estimatedCost=0`. It does not upload/store media, dispatch workers, invoke models, generate, analyze, edit, or export video.

## Staging/release gates

- Apply `202610310001_nova_video_workspace.sql` only to an explicitly approved, isolated staging environment after backup and RLS review; it is not applied by this package.
- Configure an exact external frontend origin and confirm the actual HTTPS origin with the owner.
- Prove two-user project/job isolation, CORS preflight and real authenticated requests.
- Verify the deployed Worker SHA before publishing its URL.
- Do not create paid storage, GPU, model, trial-credit or billable resources.

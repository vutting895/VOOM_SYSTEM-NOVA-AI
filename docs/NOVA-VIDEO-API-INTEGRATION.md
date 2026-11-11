# NOVA AI Video API — External Frontend Integration

## Scope

NOVA Video is an API service for an independently hosted frontend. This repository does not need to build, host, or deploy the consumer's web UI for the API to be called. The existing `/video` page is a legacy/demo client and is not a dependency of the API contract.

## Current capability boundary

Implemented API routes:
- `GET/POST /api/video/projects` — list and create tenant-owned project metadata.
- `GET/POST /api/video/jobs` — list and record tenant-owned job requests.

Not implemented:
- media upload or private object storage;
- job detail/cancel endpoints or webhook callbacks;
- actual video generation, analysis, editing, transcoding or export;
- worker dispatch, model inference or GPU execution.

Every accepted job is currently recorded in a blocked state:
- `video_generation` → `blocked_no_free_gpu`
- `video_analysis` and `video_edit_export` → `blocked_worker_unavailable`

The API returns `executionEnabled: false` and zero estimated cost. A successful HTTP response means the request was recorded, not that a video was processed.

## API origin and deployment

The routes currently live in the Next.js application under `frontend/app/api/video`. The intended public origin is `https://voomsystem.netlify.app`, but production use must wait until Netlify confirms a deploy containing the reviewed API commit. Do not treat the current website deployment as proof that this API revision is live.

Configure the external frontend's exact HTTPS origin(s) in Netlify environment variable:

```text
NOVA_VIDEO_ALLOWED_ORIGINS=https://your-frontend.example,https://app.your-domain.example
```

Use exact origins only: scheme + hostname + optional port; no path or wildcard. The API does not enable cookie credentials. Cross-origin requests use the Authorization bearer header. Unlisted origins receive no CORS permission and preflight is rejected.

## Authentication

The frontend must sign the user in through the same Supabase Auth project used by NOVA and send its short-lived access token:

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

Never expose a Supabase service-role key in browser code. The API validates the token with Supabase Auth and performs database requests under the authenticated user's JWT, relying on RLS. Do not send refresh tokens to the API.

## Example integration

```js
const API_BASE = "https://voomsystem.netlify.app";
const accessToken = session.access_token;

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const projectResponse = await fetch(`${API_BASE}/api/video/projects`, {
  headers,
  cache: "no-store",
});
if (!projectResponse.ok) throw new Error("Could not load projects");
const { projects } = await projectResponse.json();

const createResponse = await fetch(`${API_BASE}/api/video/projects`, {
  method: "POST",
  headers,
  body: JSON.stringify({ title: "Campaign video", description: "" }),
});
if (!createResponse.ok) throw new Error("Could not create project");
const { project } = await createResponse.json();

const jobResponse = await fetch(`${API_BASE}/api/video/jobs`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    project_id: project.id,
    task_type: "video_generation",
    prompt: "A short cinematic product introduction",
    idempotency_key: crypto.randomUUID().replaceAll("-", ""),
  }),
});
const jobPayload = await jobResponse.json();
if (!jobResponse.ok) throw new Error(jobPayload.error || "Could not record job");
// 202 means accepted for recording only. jobPayload.executionEnabled is false.
```

## HTTP behavior

- `401`: missing/invalid/expired Supabase access token.
- `400`: invalid JSON or unsupported fields/values.
- `403`: CORS preflight Origin is not allowlisted.
- `409`: same idempotency key reused with a different project/task/prompt.
- `413`: request body exceeds the endpoint size limit.
- `415`: request content type is not application/json.
- `503`: auth provider or Supabase data store unavailable/not configured.
- `202`: new job request recorded but blocked and not executed.
- `200`: list response or identical idempotent replay.

## Required deployment configuration

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NOVA_VIDEO_ALLOWED_ORIGINS`

The unapplied Video Workspace SQL is preserved at `supabase/pending-migrations/nova_video_workspace.sql`, outside the active migration directory. Its original filename timestamp (`202610310001`) sorts before the latest applied Production version (`20261031070311`), so it must not be reactivated under that timestamp. After the Production migration history is restored, generate a fresh filename with `supabase migration new nova_video_workspace`, copy this preserved SQL into the generated file, and verify it on an isolated local/Staging path before any hosted apply. The API will return 503 for project/job operations until the corresponding schema exists in an explicitly approved target. Do not apply it to Production as part of this API-only branch.

## Release gates

1. Frontend CI and disposable PostgreSQL migration CI must execute and pass with inspectable logs.
2. Independent security review must verify token handling, CORS allowlist, owner RLS and composite project-owner foreign key.
3. Test two distinct Supabase Auth users against staging; each must be unable to read or reference the other's projects/jobs.
4. Verify CORS preflight and actual requests from the exact external frontend origin.
5. Deploy the API commit and verify the deployed commit SHA before publishing the base URL.
6. Keep all media processing disabled until a truly zero-cost worker, private storage and model-license review are proven.

See `docs/openapi/nova-video-api.yaml` for the machine-readable contract.

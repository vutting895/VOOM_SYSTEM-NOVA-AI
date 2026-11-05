# NOVA AI Video API — External Frontend Integration

## Scope and runtime

NOVA Video is an API-only service for the independently hosted consumer frontend. The current implementation target is a dedicated Cloudflare Worker in `integrations/nova-video-api/`. The root Vite/Express application and Netlify site are not the API runtime. Do not create or deploy another NOVA consumer UI.

The Worker URL is intentionally unpublished. Publish it only after a reviewed deployment, exact deployed SHA verification, and authenticated staging acceptance. Do not call `https://voomsystem.netlify.app` as the Video API origin.

## Endpoints

- `GET /api/video/skills` — authenticated 22-skill catalog.
- `GET/POST /api/video/projects` — owner-scoped project metadata.
- `GET/POST /api/video/jobs` — owner-scoped job-request metadata.\n- `POST /api/video/production-plan` — authenticated projection from Director timeline to Engine task/stage contracts; no execution.

Every request requires a short-lived Supabase Auth access token from the same Supabase project:

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

Never expose a service-role key or refresh token in browser code. The Worker validates the access token with Supabase Auth, then accesses PostgREST using the same user's bearer token and the publishable key. RLS remains authoritative.

## CORS and Worker configuration

Configure these Worker variables only after the external frontend's exact HTTPS origin is confirmed:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `NOVA_VIDEO_ALLOWED_ORIGINS` — comma-separated exact origins (scheme + hostname + optional port). No wildcard, no credentials, and no default allowlist.

An unset allowlist denies browser-origin requests. Do not infer the origin from a preview URL or use the Netlify API origin as a substitute.

## Project example

```js
const API_BASE = "<verified Cloudflare Worker origin>";
const accessToken = session.access_token;

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

const response = await fetch(`${API_BASE}/api/video/projects`, {
  headers,
  cache: "no-store",
});
if (!response.ok) throw new Error("Could not load projects");
const { projects } = await response.json();
```

## NOVA Director planning

- `POST /api/video/plan` — authenticated, deterministic NOVA Director planning.
- `POST /api/video/jobs` optionally accepts a `brief` and persists the Director plan in the owner-scoped job request.
- Input fields: `title`, `concept`, optional `audience`, `platform`, `language`, `style`, `callToAction`, `durationSeconds` (3–60), `aspectRatio` (`9:16`, `16:9`, `1:1`), `goal`, `verifiedFacts`, and `mustAvoid`.
- Returns a 24 FPS, frame-accurate shot plan with beat, framing, camera movement, lighting, transitions, visual prompts and continuity rules.
- This route runs NOVA-owned deterministic CPU logic only. It does not call an LLM, video model, GPU, database, worker or media storage.
- Every response includes `executionEnabled: false`, `estimatedCost: 0` and `requiresHumanApproval: true`.
- It does not create a project/job record. Use the jobs endpoint separately to record a request.

Example:

```js
const response = await fetch(`${API_BASE}/api/video/plan`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    title: "NOVA Product Film",
    concept: "A premium product on a quiet morning table",
    durationSeconds: 15,
    aspectRatio: "9:16",
    goal: "product_ad",
    language: "th"
  })
});
const { directorPlan } = await response.json();
```

## Engine production-plan projection\n\n- `POST /api/video/production-plan` accepts the same bounded creative-brief fields as `/api/video/plan`.\n- NOVA Director creates the 24 FPS frame timeline; the Worker-safe production planner validates the scene boundaries and creates one bounded Wan 2.2 task contract per scene, plus human-approval, assembly, QC and delivery dependencies.\n- Each generation task remains `blocked_no_free_gpu`; the response sets `executionEnabled: false`, `estimatedCost: 0` and `requiresHumanApproval: true`.\n- This is a control-plane plan projection, not a model invocation, queue submission, media upload or proof of generated video.\n\n## Job status and capability boundary

A successful job POST means that the request and optional deterministic Director plan were recorded, not that any media was processed. When `brief` is supplied, the Worker computes the plan again server-side and persists it in `request.director_plan`; the client-supplied plan is never trusted.

- `video_generation` → `blocked_no_free_gpu`
- `video_analysis` and `video_edit_export` → `blocked_worker_unavailable`

Every skill and job returns `executionEnabled: false` and `estimatedCost: 0`. There is no media upload, private object storage, worker dispatch, model inference, GPU execution, video generation, analysis, editing, transcoding or export.

## Database and acceptance gates

The additive migration `202610310001_nova_video_workspace` defines owner-scoped project/job tables, RLS, a composite project-owner foreign key, and a per-user idempotency key. The migration is not applied to the hosted Supabase project. Do not apply it to production or create a billable Supabase branch as part of this work.

Before publication:

1. Run Worker contract CI on the exact PR head with inspectable logs.
2. Review authentication, exact-origin CORS, PostgREST redirects, RLS, project-owner binding and idempotency.
3. Apply the migration only to an explicitly approved, isolated staging environment.
4. Test two distinct Supabase users; each must be unable to list, reference or create jobs against the other user's projects.
5. Verify preflight and authenticated calls from the exact external frontend origin.
6. Verify the deployed Worker SHA before publishing its URL.

No paid API, GPU, trial credits, auto-top-up, paid storage or unapproved production resource is allowed.

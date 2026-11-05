# NOVA AI Video API — Frontend Integration

## Runtime boundary

NOVA Video is an API-only control plane for the independently hosted consumer frontend. The API target is a dedicated Cloudflare Worker under `integrations/nova-video-api/`. The Netlify frontend is not the API origin. The Worker URL remains unpublished until reviewed deployment and authenticated staging acceptance are complete.

All non-preflight requests require a short-lived Supabase Auth access token from the same project:

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

Never expose a service-role key or refresh token in browser code. The Worker verifies the token with Supabase Auth and uses the same caller bearer token with the publishable key for PostgREST. RLS is the authoritative row boundary.

## Endpoints

- `GET /api/video/skills` — 22-skill catalog; every skill is non-executable.
- `POST /api/video/plan` — deterministic NOVA Director 24 FPS shot plan.
- `POST /api/video/production-plan` — per-scene Engine task contracts, human approval, assembly, QC and delivery stages.
- `GET/POST /api/video/projects` — owner-scoped project metadata.
- `GET/POST /api/video/jobs` — owner-scoped blocked jobs.
- `POST /api/video/preparations` — immutable preparation snapshot generated from the saved owner-scoped job.
- `GET /api/video/preparations?job_id=<uuid>` — read the preparation and any approval decision.
- `POST /api/video/preparation-decisions` — one-time approval or rejection bound to the snapshot hash.

## Project and Job workflow

Create a project:

```js
const API_BASE = "<verified Worker origin>";
const headers = {
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
};

const projectResponse = await fetch(`${API_BASE}/api/video/projects`, {
  method: "POST",
  headers,
  body: JSON.stringify({ title: "NOVA Product Film" }),
});
if (!projectResponse.ok) throw new Error("Project creation failed");
const { project } = await projectResponse.json();
```

Create a job with a creative brief. The Worker regenerates the plan and never trusts a client-supplied Director plan:

```js
const jobResponse = await fetch(`${API_BASE}/api/video/jobs`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    project_id: project.id,
    task_type: "video_generation",
    prompt: "Create a short product film",
    idempotency_key: crypto.randomUUID().replaceAll("-", ""),
    brief: {
      title: "NOVA Product Film",
      concept: "A premium ceramic cup on a quiet morning table",
      durationSeconds: 15,
      aspectRatio: "9:16",
      goal: "product_ad",
      language: "th",
      verifiedFacts: ["Ceramic body"],
      mustAvoid: ["Unverified performance claims"]
    }
  })
});
if (!jobResponse.ok) throw new Error("Job creation failed");
const { job } = await jobResponse.json();
```

A successful POST records a job request, not a video. `video_generation` remains `blocked_no_free_gpu`; analysis and editing/export remain `blocked_worker_unavailable`.

## Immutable preparation and human decision

Create the preparation from the stored job:

```js
const preparationResponse = await fetch(`${API_BASE}/api/video/preparations`, {
  method: "POST",
  headers,
  body: JSON.stringify({ job_id: job.id })
});
if (!preparationResponse.ok) throw new Error("Preparation failed");
const { preparation } = await preparationResponse.json();
```

Read it and any decision:

```js
const reviewResponse = await fetch(
  `${API_BASE}/api/video/preparations?job_id=${encodeURIComponent(job.id)}`,
  { headers, cache: "no-store" }
);
if (!reviewResponse.ok) throw new Error("Preparation lookup failed");
const review = await reviewResponse.json();
```

Record the authenticated user's explicit decision:

```js
const decisionResponse = await fetch(`${API_BASE}/api/video/preparation-decisions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    preparation_id: preparation.id,
    decision: "approved",
    decision_note: "Creative plan reviewed"
  })
});
if (!decisionResponse.ok) throw new Error("Approval could not be recorded");
const decision = await decisionResponse.json();
```

There is one immutable preparation per job and one append-only decision per preparation. If the brief changes, create a new job and a new preparation. A conflicting second decision returns `409`.

**An approval does not enable rendering.** The job remains `blocked_no_free_gpu`, `executionEnabled=false` and `estimatedCost=0`. The response also keeps explicit blockers for verified zero-cost GPU capacity and disabled worker dispatch. The future execution service must independently validate the snapshot and all compute/license/security gates.

## Creative brief fields

Required: `title`, `concept`.

Optional: `audience`, `platform`, `language`, `style`, `callToAction`, `durationSeconds` (3–60), `aspectRatio` (`9:16`, `16:9`, `1:1`), `goal` (`product_ad`, `explainer`, `story`, `brand_film`), `verifiedFacts`, `mustAvoid`.

NOVA Director returns a deterministic shot plan with narrative beats, framing, camera movement, lighting, transitions, subject continuity, verified-fact guard and 24 FPS frame allocation. This is NOVA-owned planning logic, not a trained foundation video model or an LLM inference result.

## Production database and rollout gate

Migration candidate: `supabase/migrations/20261105143000_nova_video_preparation_approval.sql`. It defines owner-scoped `nova_video_projects`, `nova_video_jobs`, `nova_video_preparations`, and `nova_video_approval_decisions` with RLS and append-only preparation/decision data.

The connected Production project currently has no Video workspace tables. Its latest recorded migration is `20261031070311`, while the repository still contains older pending migration files; the Supabase `main` branch reports `MIGRATIONS_FAILED`. There is no verified staging environment. The migration candidate is not applied. Before any schema change, reconcile migration history, repair the failed branch, produce and verify a backup/restore, and complete independent SQL/RLS review. Then test Tenant A and Tenant B using separate authenticated sessions in isolated staging.

Before publishing the Worker:
1. Pass exact-head Worker contract tests and module syntax checks.
2. Pass independent security review.
3. Prove cross-tenant denial for projects, jobs, preparations and decisions.
4. Verify the exact HTTPS frontend CORS origin.
5. Confirm the deployed Worker SHA and authenticated staging acceptance.

No production migration, Worker deployment, paid API/GPU, trial-credit fallback, model download, media upload, worker dispatch or billing change is authorized by this source-level work.

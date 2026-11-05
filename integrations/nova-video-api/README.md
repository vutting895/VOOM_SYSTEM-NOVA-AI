# NOVA Video API Worker

The Cloudflare Worker is the authenticated control plane for NOVA Video. It is intentionally separate from the consumer frontend and from the local inference runtime.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/video/skills` | Authenticated free-only skill catalog |
| POST | `/api/video/plan` | Deterministic NOVA Director shot plan |
| POST | `/api/video/production-plan` | Per-scene Engine task contracts and pipeline stages |
| GET / POST | `/api/video/projects` | Owner-scoped project metadata |
| GET / POST | `/api/video/jobs` | Owner-scoped blocked job metadata; optional brief generates the Director plan server-side |
| POST | `/api/video/preparations` | Create one immutable Engine preparation snapshot from an owned job |
| GET | `/api/video/preparations?job_id=<uuid>` | Read the owner's immutable preparation and its decision |
| POST | `/api/video/preparation-decisions` | Append one approval or rejection bound to the snapshot hash |

Every endpoint except CORS preflight requires a Supabase access token:

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

The Worker validates the token with Supabase Auth, then calls PostgREST using the same caller bearer token and publishable key. RLS remains authoritative. No service-role key or refresh token is used.

## Job → Preparation → Approval

1. Create a project using `POST /api/video/projects`.
2. Create a `video_generation` job using `POST /api/video/jobs`. Supply `brief` to let the Worker create and persist the Director plan under `request.director_plan`.
3. Call `POST /api/video/preparations` with `{ "job_id": "<owned-job-uuid>" }`. The Worker reads the saved job using the authenticated owner filter, validates its Director plan, builds the canonical Engine task/stage plan, hashes the snapshot with SHA-256, and inserts one immutable preparation per job.
4. Read the snapshot using `GET /api/video/preparations?job_id=<uuid>`.
5. Record `approved` or `rejected` using `POST /api/video/preparation-decisions` with `preparation_id`, `decision`, and an optional `decision_note`.

Preparation snapshots and approval decisions are append-only. A decision is tied to the exact snapshot hash. Conflicting decisions are rejected; create a new job when the creative brief changes.

**Approval is not execution permission.** Even after an `approved` decision, the original job remains `blocked_no_free_gpu`, `executionEnabled=false`, and `estimatedCost=0`. The API does not dispatch workers, download models, invoke a GPU, upload media, render, analyze, edit, transcode, or export a video.

## Worker configuration

Required Worker variables, only after a reviewed staging setup:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `NOVA_VIDEO_ALLOWED_ORIGINS` — exact comma-separated HTTPS origins, no wildcard

`workers_dev=false` remains enforced. The Worker URL is unpublished until a reviewed deployment SHA and authenticated staging acceptance are verified.

## Database schema candidate and rollout block

Migration candidate: `supabase/migrations/20261105143000_nova_video_preparation_approval.sql`.

It creates the Video project/job tables if absent and adds:
- `nova_video_preparations`: one owner-bound immutable snapshot per job with a SHA-256 hash.
- `nova_video_approval_decisions`: one append-only owner decision per preparation, tied to the same snapshot hash.

All four tables have RLS. Authenticated access is limited to owner-scoped `SELECT` and `INSERT`; no client `UPDATE` or `DELETE` grants are issued. The preparation insert policy requires an owner-owned `video_generation` job in `blocked_no_free_gpu`. The approval insert policy requires the owner and exact saved snapshot hash.\n\n**Important trust boundary:** the Worker computes preparation snapshots and decision payloads, but these tables currently grant authenticated users direct `INSERT` via PostgREST. RLS enforces tenant ownership and immutable rows, but it does not prove that an insert originated from the Worker. A user can call PostgREST directly to create their own preparation/decision row. This cannot unlock execution, but it means the database records are not yet cryptographically attested as Worker-generated. Before any execution feature, introduce a trusted server-only write path (or a reviewed signature scheme), remove direct client `INSERT` access to these records, and prove that clients cannot forge preparation or approval events.

**Do not apply this migration to Production.** The currently connected Production project has no `nova_video_projects` or `nova_video_jobs` tables, its recorded latest migration is `20261031070311`, the repository contains older pending migration files, and the Supabase `main` branch currently reports `MIGRATIONS_FAILED`. There is no verified staging database. Reconcile migration history, repair the failed branch state, verify an encrypted backup and restore, and pass isolated two-user RLS tests before any migration or Worker deployment.

## Acceptance gates

- Exact-head GitHub Actions tests and syntax checks pass.
- Independent security review and inline review threads are resolved.
- A verified isolated staging environment proves Tenant A cannot read or decide on Tenant B's jobs/preparations.
- The precise frontend origin passes HTTPS CORS and authenticated integration tests.
- Migration backup/restore and rollback are reviewed.
- A local inference acceptance run proves an approved model/checkpoint, exact source revision, actual GPU VRAM, and no-cost compute evidence.
- A generated MP4 passes media and perceptual acceptance before any real generation feature is described as available.

No paid API, hosted inference, GPU provisioning, trial credit, top-up, production migration, production deployment or media upload is enabled by this package.

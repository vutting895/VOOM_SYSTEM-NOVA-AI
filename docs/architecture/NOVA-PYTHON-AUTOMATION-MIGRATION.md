# NOVA Python Backend Automation Migration

Status: design proposal; no runtime, secrets, deployment, trading, or workflow changes are authorized by this document.

## Decision

Use a hybrid model:
- Python backend services execute recurring and long-running application jobs.
- GitHub Actions remains the source-controlled CI, test, security-scan, and release/deployment gate.
- Keep NOVA isolated from VOOM Studio Affiliate at repository, credentials, database, queue, network, and deployment boundaries.

## Current baseline

- Main commit at design time: `3105ad79990fa6596d1e210e7a645b0b0e12e5fa`.
- Existing application worker stack is in `workers/` and `infra/docker-compose.yml`; it already declares Redis, PostgreSQL, and a research-worker service.
- Kaggle recurring ingestion currently runs in `.github/workflows/kaggle-daily-ingestion.yml` at 01:00 UTC (08:00 Asia/Bangkok), with a manual dispatch input and a seven-day Actions artifact.
- Kaggle credential validation is separately defined in `.github/workflows/kaggle-api-readonly-check.yml`.
- PR #246 is a prior, unmerged Async Runtime proposal. Its base is stale relative to current main and it reports failed exact-head CI jobs with no executed test steps. Treat it as reference material, not a deployable runtime or a branch to merge as-is.

## Target architecture

1. Authenticated System Hub/API remains the public control plane.
2. A private Python FastAPI dispatcher validates the caller-derived owner/tenant, allowed job type, payload schema, request size, and idempotency key.
3. Durable PostgreSQL job and append-only audit records are the source of truth.
4. A worker claims jobs with a lease/lock and bounded concurrency. Redis/Celery may be used for dispatch acceleration, but Redis must not be the only durable record.
5. The scheduler is single-active through a PostgreSQL advisory lock or durable lease; duplicate scheduler instances must not enqueue duplicate work.
6. Workers have least-privilege provider credentials only for the specific job. They never receive broker credentials, Supabase user tokens, MT5 bridge tokens, or trading execution permissions.
7. Results are persisted with source provenance, input manifest/hash, code SHA, run ID, start/end timestamps, and explicit terminal status.

## First migration candidate: Kaggle daily ingestion

Replace the scheduled GitHub-hosted data download with a Python job only after the worker is deployed and tested:
- Preserve the existing 08:00 Asia/Bangkok schedule and manual run capability.
- Validate the dataset slug against the strict owner/name format.
- Retrieve credentials from runtime secret storage; never log token, username/key, CLI stdout/stderr, or authorization headers.
- Download into a temporary isolated directory; enforce time, size, file-count, and disk limits.
- Validate expected files/schema, UTC timestamps, symbol/timeframe, duplicates, gaps, and provenance before promotion.
- Generate a SHA-256 manifest and persist it durably. A successful download is not a successful validated dataset.
- Use atomic promotion/versioning; never overwrite the last known-good dataset on a failed run.
- Retain an explicit failure state and actionable reason without leaking provider response bodies.
- During shadow mode, compare manifest/results with the existing Actions job. Keep Actions as fallback until parity is proven.

## Workflows retained in GitHub Actions

Keep PR/push CI, Python/Node tests, typecheck, build, dependency/security checks, migrations validation, Docker build, and deployment/release approvals in GitHub Actions. Do not move source validation or release authorization into a runtime scheduler.

After a proven migration, change only the Kaggle ingestion schedule trigger. Retain a manual workflow_dispatch fallback that invokes the approved backend job API; do not leave two active schedulers.

## Safety invariants

- Live Trading remains OFF.
- No order, modify-order, close-position, transfer, or withdrawal capability is added to the automation service.
- No worker can bypass Python Bridge or MQL5 EA Safety Gates.
- Existing Risk Policy and approval gates are unchanged.
- Research/training jobs cannot silently promote a model or change a production strategy.
- Tenant identity is derived from the authenticated server-side session, never trusted from request payload.
- Fail closed on missing secrets, invalid provenance, unavailable database, or ambiguous job state.

## Required verification before production

- Exact-head CI executes and passes unit, integration, and security tests.
- Linux container starts from a clean environment and survives restart.
- Scheduler singleton/lease, duplicate delivery, idempotency, retries, timeout, cancellation, and worker crash recovery are tested.
- PostgreSQL durability and cross-tenant RLS are tested using separate authenticated principals.
- Redis outage does not lose accepted jobs or fabricate completion.
- Kaggle API failure, malformed archive, missing files, disk exhaustion, and partial download preserve last known-good data.
- Shadow-run parity is demonstrated over multiple scheduled cycles.
- Runtime secrets, private ingress, resource limits, backup, rollback, and monitoring are reviewed before deployment.

## Rollout sequence

1. Build and test the private worker in an isolated branch.
2. Deploy to a non-production Linux environment with no trading capability.
3. Run manual jobs and failure-injection tests.
4. Run scheduled shadow mode without changing the existing Actions schedule.
5. Demonstrate parity and owner-approved operational controls.
6. Open a separate PR to switch the scheduler trigger; retain manual fallback.
7. Disable the old scheduled trigger only after the new scheduler is confirmed healthy.
8. Keep CI/CD and release workflows in GitHub Actions.

No production migration is complete until runtime evidence, exact-head CI run IDs, and rollback evidence are attached.

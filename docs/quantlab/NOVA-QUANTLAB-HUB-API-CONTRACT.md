# NOVA QuantLab Hub and Worker API contract

Status: **Development implementation present; not deployed; no compute executor is registered.** The Hub gateway and Python queue API now exist. This is not yet an operational training/backtest service.

## Trust and tenant boundary

1. The System Hub validates the Supabase access token, then forwards the same bearer token over HTTPS.
2. The Python worker independently validates that token against the same Supabase Auth project.
3. Until a canonical organization-membership/tenant registry is approved, the worker maps each authenticated Supabase user ID to their own isolated tenant ID. This is user-per-tenant isolation, not shared organization tenancy. No client-supplied tenant/user headers or payload fields are trusted.
4. The worker rejects redirects to avoid forwarding bearer credentials to another origin.
5. Internal dispatcher lease endpoints use a separate `QUANTLAB_DISPATCHER_TOKEN` and are not exposed through the System Hub gateway.
6. This API has no broker order, execution, funds-transfer, or account-mutation operation.

## Hub endpoints

- `GET /v1/quantlab/capabilities`
- `GET /v1/quantlab/jobs?limit=25&state=QUEUED&cursor=...`
- `POST /v1/quantlab/jobs` with `Idempotency-Key`
- `GET /v1/quantlab/jobs/{job_id}`
- `GET /v1/quantlab/jobs/{job_id}/events`

The Hub validates allowlisted job types (`dataset.validate`, `backtest`, `train`, `evaluate`), resource profile `free-cpu`, timeout 1–900 seconds, a 64 KiB body limit, and bounded query filters. Browser-supplied tenant, requester, actor, or worker identity fields are rejected.

## Python worker user API

- `GET /v1/jobs` — tenant-scoped list with bounded cursor pagination.
- `POST /v1/jobs` — idempotent enqueue; returns HTTP 202.
- `GET /v1/jobs/{job_id}` — tenant-scoped job detail.
- `GET /v1/jobs/{job_id}/events` — tenant-scoped append-only event history.

The queue stores the submitted experiment payload, job state, requester, idempotency key, append-only state events, and a bounded JSON result (maximum 256 KiB) in SQLite. A worker cannot mark a job SUCCEEDED without supplying a JSON result. Same-tenant replay with the same key and same request returns the original job; reuse with a different request returns 409. Cross-tenant lookup returns 404.

## Internal dispatcher/lease API

These endpoints require `X-QuantLab-Dispatcher-Token`, configured separately from user Supabase sessions:

- `POST /v1/internal/leases/claim` — claim one queued job and receive a one-time lease token.
- `POST /v1/internal/leases/{job_id}/heartbeat` — extend a valid, unexpired lease.
- `POST /v1/internal/leases/{job_id}/finish` — complete with `SUCCEEDED`, `FAILED`, `REJECTED`, or `TIMED_OUT`.

Claim is serialized with `BEGIN IMMEDIATE`. A lease expires after its bounded TTL; the next claim operation returns expired RUNNING jobs to QUEUED and appends a recovery event before claiming. Lease tokens are stored as SHA-256 hashes. A stale, expired, wrong-worker, or reused token is rejected. The event table has database-level UPDATE/DELETE guards.

**Not implemented:** a polling dispatcher process, execution-handler registry, actual model-training/backtest executor, retry policy beyond lease-expiry requeue, result/artifact persistence, quotas/rate limiting, cancellation, and automated backup/restore. The lease API is a queue/worker boundary, not proof that work is being executed.

## Storage and deployment

- `QUANTLAB_DB_PATH` must be an absolute path on a persistent volume. Default: `/data/nova-quantlab/quantlab.sqlite3`.
- SQLite WAL mode is enabled. This is a **single-node queue**; do not mount the same SQLite database for concurrent replicas or treat it as a distributed queue.
- Backups must include a consistent SQLite backup/checkpoint procedure and a restore test before production.
- Python service must run as a container/hosted process with persistent disk. It is not a Cloudflare Worker. The Hub therefore accepts only HTTPS and an exact hostname in `QUANTLAB_WORKER_ALLOWED_HOSTS` (comma-separated exact hostnames); `QUANTLAB_WORKER_URL` must be a root HTTPS origin with no credentials, custom port, path, query, or fragment.
- Neither environment variable is configured by this change. No secret/configuration changes or deployments were made.

## Production gates

Before routing production traffic: register an actual dispatcher/executor; implement bounded concurrency, hard process timeout, retry policy, artifact storage, quotas, cancellation and audit; choose an explicitly approved persistent hosting option and verify cost; configure user auth and dispatcher credentials; perform tenant-isolation, idempotency, lease expiry/recovery, worker-crash, timeout, backup/restore and end-to-end tests. Do not apply Supabase migrations or enable broker writes as part of this work order.

Safety invariants remain false: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

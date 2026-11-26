# NOVA QuantLab Hub API contract (Development)

Status: gateway contract implemented on the NOVA development branch; the downstream Quant Worker is not yet implemented or configured.

## Trust boundary

1. The System Hub validates the Supabase access token against the configured Supabase Auth endpoint.
2. The Hub forwards the same bearer session to the configured Quant Worker over HTTPS. It does not accept `tenant_id`, `requester_id`, `actor_id`, worker identity, or tenant scope from the browser payload.
3. The downstream worker MUST independently validate the bearer token against the same trusted Supabase project, derive user and tenant membership server-side, and enforce tenant-scoped reads/writes. It MUST NOT trust a tenant header or user ID supplied by the caller.
4. The worker must return JSON objects only. The Hub rejects redirects, non-JSON responses, malformed JSON, and responses larger than 256 KiB.
5. The Hub has no broker execution, order, funds-movement, or account-mutation route in this API.

## Hub endpoints

- `GET /v1/quantlab/capabilities` — authenticated gateway configuration and allowlisted job types. `configured` means only that a syntactically valid worker URL is configured; it does not prove worker health.
- `GET /v1/quantlab/jobs?limit=25&state=QUEUED&cursor=...` — list the authenticated user's jobs. Limit 1–100; state is allowlisted; cursor <=256 chars.
- `POST /v1/quantlab/jobs` — create a research job. Requires `Idempotency-Key` matching `[A-Za-z0-9][A-Za-z0-9._:-]{7,127}`; body <=64 KiB.
- `GET /v1/quantlab/jobs/{job_id}` — retrieve a tenant-scoped job.
- `GET /v1/quantlab/jobs/{job_id}/events` — retrieve a tenant-scoped append-only event stream.

Create body is an allowlisted object with only:
```json
{
  "job_type": "backtest",
  "resource_profile": "free-cpu",
  "timeout_seconds": 600,
  "experiment": {
    "spec": "nova.quant-experiment.v1"
  }
}
```

Allowed job types: `dataset.validate`, `backtest`, `train`, `evaluate`. Resource profile is `free-cpu`; timeout is 1–900 seconds. Browser-supplied identity and tenant fields are rejected.

## Downstream worker contract

The worker receives:
- `GET /v1/jobs[?limit=&state=&cursor=]`
- `POST /v1/jobs` with the validated JSON body and `Idempotency-Key`
- `GET /v1/jobs/{job_id}`
- `GET /v1/jobs/{job_id}/events`

It must respond with JSON object bodies and preserve meaningful HTTP status codes (202 for accepted creation, 400 for invalid request, 401/403 for auth/tenant denial, 404 for jobs outside the caller's tenant, 409 for idempotency/state conflicts, 429 for quotas, 5xx for service faults).

The worker implementation must provide durable persistence, tenant-scoped idempotency, append-only events, worker leases/heartbeats, retry/recovery semantics, quotas, audit metadata, and persistent artifact references. The existing SQLite adapter is single-node only and is not itself this HTTP worker.

## Configuration and rollout

Set `QUANTLAB_WORKER_URL` on the System Hub Worker only after the downstream worker exists and has passed its own auth/tenant/lifecycle contract tests. The Hub accepts only an HTTPS `*.workers.dev` origin with no credentials, path, query, or fragment. This environment variable is intentionally not configured by this change.

Before production routing: implement and deploy the downstream worker separately; configure the Hub variable through approved secret/config management; run end-to-end tenant isolation, idempotency, quota, lifecycle, timeout, crash recovery, and audit tests; verify persistent storage/backup/restore; then perform a staged non-trading rollout. Do not apply Supabase migrations or enable broker writes as part of this contract.

Safety invariants remain false: `ordersEnabled`, `executionEnabled`, and `liveTradingEnabled`.

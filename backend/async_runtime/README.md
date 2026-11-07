# NOVA Async Analysis Runtime

This service runs SMC + Elliott Wave research away from the System Hub request path.

## Services

- `redis`: Celery broker/result backend and tenant-scoped short-lived cache.
- `analysis-api`: private FastAPI ingress that validates a System Hub dispatch and enqueues a Celery task.
- `smc-worker`: Celery worker that validates closed OHLC bars and runs SMC + Elliott analysis.

PostgreSQL remains the durable source of truth. Redis is a runtime projection/cache only. The durable tables are owner-scoped to Supabase Auth and the job's broker connection; the creation RPC verifies the connection belongs to the tenant and is currently connected to Exness Demo.

## Local startup

Create a high-entropy token and keep it out of source control:

```bash
export NOVA_ANALYSIS_INTERNAL_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
docker compose -f infra/async-runtime/docker-compose.yml up --build -d
docker compose -f infra/async-runtime/docker-compose.yml ps
docker compose -f infra/async-runtime/docker-compose.yml logs -f analysis-api smc-worker
```

The dispatcher binds to `127.0.0.1:8000` only. Do not change this to a public bind. To connect a remote Cloudflare System Hub, place the API behind a separately approved Cloudflare Tunnel/private ingress and enforce an additional network/origin policy. The Hub requires the exact HTTPS endpoint host to be configured explicitly.

Configure the System Hub Worker outside source control:

- `NOVA_ANALYSIS_DISPATCH_URL=https://<approved-private-host>/internal/v1/analysis/smc`
- `NOVA_ANALYSIS_DISPATCH_HOST=<approved-private-host>`
- Worker secret `NOVA_ANALYSIS_DISPATCH_TOKEN` = the same high-entropy token.

Set `NOVA_ANALYSIS_INTERNAL_TOKEN` in the dispatcher runtime to that same token. Never place the token in Git, frontend variables, browser storage, request URLs or logs.

## API contract

The only task-ingress route is:

`POST /internal/v1/analysis/smc`

It requires `Authorization: Bearer <internal-token>` and accepts a strict payload with:

- UUID `tenant_id` derived by System Hub after Supabase Auth.
- UUID `connection_id` resolved under that owner.
- Allowlisted symbol and timeframe.
- 25–500 normalized, chronological OHLC bars.
- `last_bar_closed=true`.
- Source provenance for the Exness MT5 Demo feed.

The dispatcher rejects extra fields (including credential fields), unclosed candles, invalid IDs, unsupported providers, missing/weak internal tokens and malformed payloads. It returns HTTP 202 and a Celery task ID. A 202 response means queued, not completed.

## System Hub request

After the user's Supabase session and connection ownership are verified, the Hub supports:

```http
POST /v1/connections/{connectionId}/analyze
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

```json
{
  "symbol": "EURUSD",
  "timeframe": "M5",
  "count": 200
}
```

The Hub reads `count + 1` candles from the authenticated MT5 Demo proxy and removes the final forming candle. It forwards only normalized OHLCV plus owner/connection references to the internal dispatcher. The Supabase token is not forwarded to the dispatcher or Celery.

Supported MT5 timeframes: M1, M5, M15, M30, H1, H4, D1. Analysis count: 25–499 closed bars.

## Worker CLI

For a separately managed Redis instance:

```bash
cd backend/async_runtime
python -m pip install -r requirements.txt
celery -A tasks worker --loglevel=info --events --queues=smc_analysis --concurrency=2
```


## Task status and result retrieval

After the Hub receives HTTP 202, it can poll the authenticated owner-scoped route:

`GET /v1/connections/{connectionId}/analysis/{taskId}`

The System Hub re-authenticates the Supabase user, resolves the connection under that user, and forwards only the derived tenant ID and connection ID to the private dispatcher. The dispatcher first checks the one-hour Redis ownership index and Celery result backend. If Redis ownership has expired or Redis is unavailable, it queries PostgreSQL using the task ID, authenticated tenant ID and connection ID together.

Possible Celery states include `PENDING`, `STARTED`, `SUCCESS`, and `FAILURE`. The analysis payload is returned only after successful completion. Unknown or cross-tenant task IDs return not-found. Redis remains a one-hour ownership/status projection. Durable job state and the full analysis result are also written to PostgreSQL tables `nova_analysis_jobs` and `nova_analysis_audit_events`. The runtime requires `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY`; keep both only in dispatcher/worker secrets, never in the Hub or browser. The migration grants authenticated users read-only access under owner RLS and denies client writes. Audit events are append-only. Apply all versioned migrations in order, including `202611070001_nova_durable_analysis_jobs.sql`, `202611080001_nova_analysis_fk_indexes.sql`, and `202611080002_nova_analysis_status_null_guard.sql`. A read-only production verification script is available at `supabase/verification/nova-analysis-persistence.sql`.

## Safety boundaries

- Exness MT5 Demo is read-only.
- The currently forming candle is excluded from analysis.
- No broker credentials, Supabase access token, bridge token or account snapshot is sent to Redis/Celery.
- Tenant cache keys are scoped by tenant; bot-bound scans require ACTIVE bot state.
- One-shot tenant research scans do not change bot state.
- Order submission, execution, and Live Trading remain disabled.
- Durable persistence is required for new System Hub dispatches; if PostgreSQL persistence is unavailable, the dispatcher rejects enqueue with HTTP 503.
- PostgreSQL is the durable fallback for status/result polling after Redis ownership or Celery result expiry.
- Do not treat a queued task as a trading signal or completed analysis.


## Supabase verification performed

- Confirmed both durable tables exist with RLS enabled and zero test rows retained.
- Executed a transaction-scoped lifecycle smoke test: queued -> started -> completed, including exactly three audit events; rolled the test data back.
- Executed a cross-tenant connection ownership negative test; the RPC rejected the mismatched owner.
- Simulated two authenticated user JWT subjects and verified each user sees only their own job and audit row; rolled all test rows back.
- Verified both lifecycle RPCs are SECURITY INVOKER, executable by service_role only, and not executable by anon/authenticated.
- Added indexes for all new analysis foreign keys. Remaining performance advisor finding is an older approval-request FK, outside this increment.
- Security advisor currently reports a separate Auth warning: leaked-password protection is disabled. No analysis-table RLS warning was returned.

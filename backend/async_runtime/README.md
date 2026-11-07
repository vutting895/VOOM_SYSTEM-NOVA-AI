# NOVA Async Analysis Runtime

This service runs SMC + Elliott Wave research away from the System Hub request path.

## Services

- `redis`: Celery broker/result backend and tenant-scoped short-lived cache.
- `analysis-api`: private FastAPI ingress that validates a System Hub dispatch and enqueues a Celery task.
- `smc-worker`: Celery worker that validates closed OHLC bars and runs SMC + Elliott analysis.

PostgreSQL remains the durable source of truth. Redis is a runtime projection/cache only.

## Local startup

Create a high-entropy token and keep it out of source control:

```bash
export NOVA_ANALYSIS_INTERNAL_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
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

The System Hub re-authenticates the Supabase user, resolves the connection under that user, and forwards only the derived tenant ID and connection ID to the private dispatcher. The dispatcher checks a one-hour Redis ownership index created at enqueue time before reading the Celery result backend.

Possible Celery states include `PENDING`, `STARTED`, `SUCCESS`, and `FAILURE`. The analysis payload is returned only after successful completion. Unknown or cross-tenant task IDs return not-found. The Redis ownership index and Celery result both expire after one hour; this is a short-lived runtime facility, not durable PostgreSQL job history. PostgreSQL persistence and long-term audit retrieval remain a separate follow-up.

## Safety boundaries

- Exness MT5 Demo is read-only.
- The currently forming candle is excluded from analysis.
- No broker credentials, Supabase access token, bridge token or account snapshot is sent to Redis/Celery.
- Tenant cache keys are scoped by tenant; bot-bound scans require ACTIVE bot state.
- One-shot tenant research scans do not change bot state.
- Order submission, execution, and Live Trading remain disabled.
- Task result retrieval and durable job persistence are not yet exposed by this increment.
- Do not treat a queued task as a trading signal or completed analysis.

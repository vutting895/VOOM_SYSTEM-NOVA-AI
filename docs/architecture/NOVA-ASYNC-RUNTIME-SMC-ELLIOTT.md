# NOVA Async Runtime v1.0 — SMC + Elliott Wave

## Scope

This isolated Python analysis runtime handles background SMC and Elliott-wave research. It does not replace the current React/Express frontend server or the tenant-authenticated System Integration Hub. It consumes an OHLC snapshot already obtained by an authorized, read-only upstream adapter.

**Security boundary:** Do not put Supabase access tokens, broker credentials, bridge tokens, account payloads, or provider secrets into Celery arguments, Redis keys, task results, or logs. The upstream API must authenticate the user, verify tenant/connection ownership, fetch allowed read-only bars, and pass only the market-data snapshot to the task. This delivery does not add a public task-submission endpoint.

## Components

- backend/async_runtime/celery_app.py: Celery app, Redis broker/result configuration, JSON-only serialization, task limits and worker heartbeat signal handling.
- backend/async_runtime/tasks.py: tasks.scan_market_smc background task; exports app for the command celery -A tasks worker.
- backend/async_runtime/smc_engine.py: OHLC validation, UTC timestamp normalization, FVG, liquidity sweeps and unified analysis.
- backend/async_runtime/elliott_wave.py: confirmed-pivot Elliott impulse candidates and Fibonacci ratios. It is heuristic and may have alternate counts.
- backend/async_runtime/bot_state.py: tenant-scoped Redis runtime projection, atomic state transitions, worker heartbeat and tenant-scoped short-lived market cache.
- Dockerfile and infra/async-runtime/docker-compose.yml: isolated Redis + Celery worker deployment.

## Redis key separation

For a single-node local development stack, logical databases are separated:

- DB 0: Celery broker
- DB 1: bot runtime state, heartbeat and tenant-scoped price/analysis cache
- DB 2: Celery result backend

For production, prefer separately managed Redis instances or endpoints for broker, results and cache/state, with TLS, authentication, persistence, monitoring, capacity limits and tested recovery. Do not run FLUSHDB or FLUSHALL; they can destroy queued and unacknowledged work. Redis is not the durable source of trading approvals, account state, or financial records; PostgreSQL remains authoritative.

## Bot state transitions

STOPPED -> ACTIVE -> PAUSED -> ACTIVE, with shutdown through STOPPING -> STOPPED. ERROR can only return to STOPPED before reactivation. State keys include both tenant_id and bot_id; a missing state defaults to STOPPED. A task associated with a bot is skipped unless its Redis state is ACTIVE.

Redis runtime status is a cache/projection only. A future host integration must persist configuration and authorized state changes in PostgreSQL and publish changes through a transactional outbox. Redis state must not grant trading permission.

## Task payload and usage

Each bar contains timestamp (ISO-8601 with timezone), open, high, low, close, and optional volume. Timestamps are normalized to UTC, and bars must be strictly chronological and unique. The final bar must be a confirmed closed candle; the task requires explicit last_bar_closed=True. The service rejects invalid OHLC ranges, non-finite values, more than 5,000 records, and fewer than 25 records.

The data adapter must produce JSON-safe Python values: ISO timestamp strings and ordinary numeric values, not pandas Timestamp or numpy scalar objects.

From backend/async_runtime with the runtime installed and Redis reachable:

~~~python
from tasks import scan_market_smc

# bars comes from the authenticated, read-only NOVA market-data adapter.
# Use closed candles only; never substitute random/synthetic bars in production.
task = scan_market_smc.delay(
    "EURUSD", "1h", bars,
    last_bar_closed=True,
    tenant_id="tenant-uuid-or-internal-id",
    bot_id="bot-uuid-or-internal-id",
)
print(f"Task ID: {task.id}")
~~~

To scan multiple symbol/timeframe combinations in parallel, enqueue one task per completed OHLC snapshot:

~~~python
jobs = [
    ("EURUSD", "1h", eurusd_h1_closed_bars),
    ("GBPUSD", "1h", gbpusd_h1_closed_bars),
    ("XAUUSDm", "5m", xauusd_m5_closed_bars),
]
task_results = [
    scan_market_smc.delay(
        symbol, timeframe, bars,
        last_bar_closed=True,
        tenant_id=tenant_id,
        bot_id=bot_id,
    )
    for symbol, timeframe, bars in jobs
]
print([task.id for task in task_results])
~~~

Read an asynchronous result with:

~~~python
from celery.result import AsyncResult

result = AsyncResult(task_id, app=scan_market_smc.app)
if result.ready():
    payload = result.get(propagate=True)
~~~

For an ad-hoc research scan not bound to a bot, omit both tenant_id and bot_id. They must either both be present or both be absent. The upstream API—not client-supplied task arguments—must establish tenant identity and bot ownership.

## Local run

From repository root:

~~~bash
docker compose -f infra/async-runtime/docker-compose.yml up --build -d
docker compose -f infra/async-runtime/docker-compose.yml ps
docker compose -f infra/async-runtime/docker-compose.yml logs -f smc-worker
~~~

To run Celery directly from backend/async_runtime after installing requirements.txt and starting Redis on localhost:

~~~bash
python -m pip install -r requirements.txt
celery -A tasks worker --loglevel=info --events --queues=smc_analysis --concurrency=2
~~~

The shorter command celery -A tasks worker --loglevel=info also works: tasks.py exports the Celery app alias and smc_analysis is the default queue. localhost is correct for a host process; containers must use the Compose service name redis.

## Analysis semantics

- FVG and liquidity-sweep outputs use the documented three-candle gap and prior-window sweep heuristics.
- Elliott Wave output is a rule-based impulse candidate from alternating swing pivots. A pivot is visible only after right_bars have elapsed; each pivot reports confirmed_at_index. The detector checks common Wave 2, Wave 3 and Wave 4 constraints, but does not solve alternate counts, diagonals, flats, zigzags or higher-timeframe context.
- These are research annotations, not trading instructions. Task output explicitly keeps orders_enabled, execution_enabled and live_trading_enabled false.

## Reliability notes

Celery with late acknowledgement can redeliver work; analysis therefore remains pure and side-effect-light. A future persistence consumer must use a unique idempotency key such as tenant + bot + symbol + timeframe + last closed-bar timestamp, backed by a PostgreSQL unique constraint. Validation errors fail immediately; only transient Redis/time-limit errors are retried. Worker heartbeat keys refresh from Celery lifecycle signals and expire if the worker stops sending heartbeats. Worker concurrency must be load-tested against CPU, RAM and Redis latency before increasing.

The shared worker heartbeat key means at least one worker instance is live; it is not a per-worker inventory. Per-instance monitoring should use Celery worker events or unique worker-node keys in a later observability phase.

## Validation still required before production

- Run the Python unittest suite in a pinned Python environment.
- Run Compose locally and verify Redis health, worker registration and a task submitted with genuine read-only OHLC bars.
- Integrate an authenticated host-side data adapter; no credentials are passed to Celery.
- Add persistent PostgreSQL job/analysis records with tenant RLS and idempotency.
- Add load, duplicate delivery, worker termination, Redis recovery and tenant-isolation tests.
- Do not enable broker order endpoints or Live Trading as part of this runtime.

# NOVA Execution Service — Disabled Contract Stub

This directory contains an isolated Cloudflare Worker contract stub for the future NOVA automated Demo execution boundary.

## Current state
- Implementation: contract stub only
- Execution: hard-coded OFF
- Order submission: not implemented
- Intent persistence: not configured
- Broker adapter: absent
- Deployment: not configured or authorized
- Live Trading: out of scope and OFF

The worker does not call Supabase, Cloudflare services, MT5, or any broker. It does not parse, persist, queue, or forward submitted intent bodies. Request payloads and query parameters cannot enable execution.

## Routes
- `GET /health` — reports the stub as healthy but disabled; this is not execution readiness.
- `GET /v1/trading/execution/status` — returns disabled capability flags.
- `POST /v1/trading/intents` — always returns HTTP 503 with `state: not_executed`.
- `GET /v1/trading/intents/{intentId}` — returns HTTP 503 until a durable tenant-scoped intent store exists.
- Other paths/methods — HTTP 404.

## Test
Run from the repository root:

```sh
node --test integrations/nova-execution-service/tests/*.test.mjs
```

Passing these tests proves only the disabled stub contract. It does not prove risk enforcement, Demo account identity, broker connectivity, or safe order execution.

## Required work before any Demo activation
1. Threat model and authenticated service-to-service identity.
2. Tenant-scoped durable intent ledger and database RLS.
3. Deterministic Risk Gateway with explicit, reviewed policy values.
4. Demo account/server identity verification immediately before submission.
5. Idempotency, concurrency control, reconciliation, and kill-switch enforcement.
6. Broker simulator tests, then isolated Exness Demo integration tests.
7. Independent security review and explicit release approval.

No production Worker, Wrangler deployment configuration, secrets, database schema, MT5 terminal, or broker account is changed by this stub.

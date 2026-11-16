# NOVA Execution Service

Status: authenticated contract scaffold only — not deployed and not connected to a broker.

This is a separate Cloudflare Worker boundary for the future Automated Demo execution path. It is deliberately fail-closed.

## Endpoints

- `GET /health` — public process status, hard-disabled capability flags, and risk-policy readiness. This is not execution readiness.
- `GET /v1/trading/execution/status` — Supabase-authenticated capability and risk-policy status.
- `POST /v1/trading/intents` — Supabase-authenticated contract stub. Always returns HTTP 423 with `intentAccepted=false`; it does not parse, persist, queue, forward or execute the candidate.
- `GET /v1/trading/intents/{intentId}` — authenticated response `503 intent_store_not_configured`; no intent is stored or retrievable yet.
- Unknown routes return 404.

## Hard safety boundary

- `executionEnabled=false`
- `ordersEnabled=false`
- `liveTradingEnabled=false`
- Capability flags are hard-coded; request fields and runtime variables cannot enable them.
- No broker URL, credential, order route, or MT5 execution call exists.
- Protected routes validate the Supabase access token with Supabase Auth.
- Supabase redirects are rejected; bearer credentials are not forwarded to another origin.
- CORS allows only origins explicitly listed in `ALLOWED_ORIGINS`.
- Authentication, origin, and upstream failures fail closed.

## Risk policy

The policy records the previously specified Demo constraints: 10% daily-loss threshold from broker-day starting equity with entry-lock-only behavior, 9% aggregate open-risk cap, and a maximum of 5 orders. Other execution-critical settings remain null and block policy readiness. The readiness validator rejects malformed values, empty symbol/session allowlists, per-trade risk above aggregate open risk, and disabled protective SL/TP requirements.

A structurally complete policy is only `configured_pending_verification`; it is not execution approval and cannot enable this Worker.

## Intent ledger proposal (not applied)

`sql/intent-ledger.proposed.sql` is a design artifact, not a migration and has not been run against Supabase. It proposes:

- Demo-only intent records with a unique `(user_id, idempotency_key)` constraint.
- Request-hash comparison so same-key/same-payload retries return the existing intent, while same-key/different-payload retries conflict.
- An audit event table linked by both intent ID and tenant ID.
- RLS enabled, browser roles denied table and RPC access, and service-role-only database access.
- An invoker-security RPC function; no SECURITY DEFINER and no broker/network call.

The proposed service-role path requires a server-only Supabase secret and strict tenant scoping in the Worker. It must never be sent to a browser. Before adoption, generate a timestamped migration with the Supabase CLI, review it, apply it only to an isolated Supabase development branch, run SQL tests and Supabase advisors, then verify RLS and idempotency behavior. Do not apply this proposal to the primary project.

## Local tests

Run from the repository root:

```sh
node --test integrations/nova-execution-service/tests/*.test.mjs
```

Tests cover disabled flags, auth-required behavior, invalid sessions, CORS rejection, intent submission rejection, absence of broker calls, unavailable intent storage, risk-policy validation, and static checks on the proposed SQL contract. Static SQL tests do not prove the migration executes or that Postgres RLS behaves correctly. Passing tests do not prove broker connectivity or safe order execution.

## Not implemented

- Applied durable tenant-scoped intent ledger
- Worker integration with the proposed idempotency RPC
- Deterministic Risk Gateway enforcement on every intent
- Execution audit writer and secret-redaction validation
- Demo broker/server identity verification
- MT5 Demo adapter and reconciliation
- Global and per-tenant kill switch
- Broker simulator and isolated Demo integration tests

## Deployment

No Wrangler deployment configuration or workflow is included. Do not deploy or bind this Worker until the missing controls above, independent security review, kill-switch/reconciliation drills and explicit release approval are complete. No production Worker, secrets, database schema, MT5 terminal or broker account is changed by this scaffold.

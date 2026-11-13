# NOVA MT5 Decision API — Feature Branch Design

Status: feature-branch implementation; not deployed or production-configured.
Base: `main` at `b3ba15c4e8eafc9ee839cb95d42865a0b193e114`.
Contract: `nova.mt5-decision.v1`.

## Boundary

This Worker is an analysis/control adapter, not a broker execution service. It accepts signed events from an MT5 EA, validates the 30-module identifier range, reserves the event ID for deduplication, calls the Quant Engine through a private Cloudflare service binding, applies a deterministic fail-closed risk policy, and optionally asks the existing Cloudflare Workers AI binding for a bounded explanation. AI text cannot change the Quant Engine result or Risk Gate decision.

No OpenAI API, new database, migration, production secret, route, deployment, or broker write capability is introduced. All execution flags are hard-coded false.

## Machine-to-machine authentication

EA requests use:
- `X-NOVA-Timestamp`: Unix seconds, exactly 10 digits, maximum clock skew 60 seconds.
- `X-NOVA-Signature`: `sha256=<hex>`.
- HMAC-SHA256 input: `<timestamp>.<exact raw HTTP request body>`.
- Secret source: future Worker secret binding `MT5_M2M_HMAC_SECRET`; no secret value is committed or configured in this branch.

Event replay protection is delegated to an atomic Durable Object service binding `EVENT_DEDUPE`, keyed by `event_id`. The API fails closed if that binding is absent. The Durable Object implementation/binding and secret provisioning are intentionally deployment prerequisites and require separate approval.

## Event contract

```json
{
  "schema_version": "nova.mt5-event.v1",
  "event_id": "ea-event-0001",
  "module_id": "M01",
  "event_type": "signal",
  "symbol": "XAUUSDm",
  "timeframe": "M5",
  "occurred_at": "2026-11-13T08:00:00Z",
  "payload": {
    "allocation_pct": 5,
    "daily_loss_pct": 0.2,
    "drawdown_pct": 1,
    "leverage": 1,
    "data_age_seconds": 2,
    "market_open": true
  }
}
```

`module_id` accepts M01 through M30. Module-specific payloads remain opaque, bounded JSON until the EA's authoritative 30-module inventory and per-module schemas are supplied. Common risk evidence is required for a pass; missing or invalid values reject. Risk thresholds reflect the currently recorded policy: daily loss 10% (entry lock only), aggregate open risk 9%, maximum 5 open orders; prototype guardrails also cap allocation at 20%, drawdown at 7%, leverage at 1x and data age at 60 seconds. These values still require explicit policy-version review before staging. The account mode is fixed to Demo by the adapter and cannot be overridden by the event.

## Decision flow

1. Enforce method, route, content type and 64 KiB body limit.
2. Verify HMAC and timestamp.
3. Validate event envelope, module ID, UTC-aware event time and payload.
4. Atomically reserve event ID via `EVENT_DEDUPE`; duplicates return 409.
5. Call `QUANT_ENGINE` service binding with `nova.mt5-decision.v1`.
6. Apply deterministic risk policy (allocation <=20%, daily loss <10%, open risk <=9%, fewer than 5 open orders, drawdown <7%, leverage =1, data age <=60s, market open. Daily-loss breach applies entry lock only.).
7. Call existing Workers AI binding for explanation only. AI failure degrades explanation, never the risk result.
8. Return analysis/rejection and explicit execution-off flags.

## Bindings expected by the feature Worker

- `AI`: existing Cloudflare Workers AI binding (reuse, no model provider addition).
- `QUANT_ENGINE`: private service binding to an approved Quant Engine HTTP adapter implementing `POST /v1/mt5/decision`.
- `EVENT_DEDUPE`: Durable Object namespace implementing atomic event-ID reservation.
- `MT5_M2M_HMAC_SECRET`: future secret binding; configure only after separate approval.

The current Python Quant Engine and Risk Worker are research prototypes, not directly importable into a Cloudflare Worker. The private adapter must wrap the supported Quant Engine functions and expose a stable contract; this branch does not pretend a Python process is already reachable. Risk policy in this Worker is an independent deterministic gate, not a claim that the Python prototype is production-grade.

## Tests

Run from repository root:

```sh
node --test integrations/nova-mt5-decision-api/worker.test.mjs
```

Tests cover all 30 module IDs, envelope validation, HMAC freshness/tampering, deduplication, Quant Engine outage, risk rejection, Workers AI explanation and execution-off invariants.

## Explicitly not done

- No production Worker secret/binding or Cloudflare resource changes.
- No wrangler config, route, DNS, deployment, Supabase, or database changes.
- No broker orders, position mutations, or Live Trading.
- No claim of live EA connectivity or successful end-to-end Quant Engine integration until a real approved adapter and staging bindings are available.

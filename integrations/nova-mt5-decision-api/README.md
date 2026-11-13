# NOVA MT5 Decision API — Feature Branch Implementation

Status: feature-branch implementation; not deployed or production-configured.
Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
Branch: `feature/nova-mt5-decision-api`
Base main SHA: `b3ba15c4e8eafc9ee839cb95d42865a0b193e114`
Contract: `nova.mt5-decision.v1`

## 1. Authority boundary

The API is an analysis and decision-evaluation path only. The required order is:

1. Validate signed MT5 EA event.
2. Reserve the event ID with Durable Object.
3. Call the existing Python `HybridQuantumQuantEngine`.
4. Call the independent Python MT5 Risk Gate.
5. Mark the event reservation complete.
6. Optionally call the existing Cloudflare Workers AI binding for explanation only.

The API derives its structured decision only from the Risk Gate's validated `passed` field. Workers AI receives the already-computed Quant Engine and Risk Gate results after both have completed. AI text is returned with `advisory_only=true` and cannot change the structured decision. A Quant Engine or Risk Gate outage, malformed result, or missing binding fails closed and prevents AI from running.

This is not broker execution authorization. The response always sets `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.

## 2. Real Quant Engine adapter

`workers/quant/mt5_decision_adapter.py` calls the existing `backend.quant_engine.HybridQuantumQuantEngine` implementation directly. It reuses the existing VQC forecast path, fixed seed 42, and reports the backend and telemetry. It does not call an external model provider.

Required event fields:
- `payload.quant_features.price_return_norm`
- `payload.quant_features.volatility_atr_norm`
- `payload.quant_features.liquidity_imbalance`
- `payload.quant_features.momentum_rsi_norm`

Each value must be finite and within [-1, 1]. The engine result is explicitly labelled `research_only`, `score_calibration=not_calibrated`, and `trained_model=false`. The repository's existing engine uses deterministic initialized circuit weights; this adapter does not claim a trained or performance-validated forecast.

The authenticated Python endpoint is `POST /v1/mt5/decision` in `workers/runtime.py`. It requires the internal `NOVA_QUANT_M2M_TOKEN` bearer token and rejects any request that attempts to enable execution.

## 3. Independent MT5 Risk Gate

`workers/risk/mt5_decision_gate.py` is a deterministic policy evaluator, called through `POST /v1/mt5/risk-gate`. It requires a validated Quant Engine result and an explicit `payload.risk_snapshot`:

- `broker_day_start_equity`
- `current_equity`
- `aggregate_open_risk_money`
- `open_orders_count`
- `market_open`
- `broker_day_start_at` (timezone-aware timestamp)
- `snapshot_at` (timezone-aware timestamp)

The gate calculates daily loss relative to broker-day starting equity and aggregate open risk relative to current equity. Policy:
- Daily loss >= 10%: `ENTRY_LOCK_ONLY` for new entries; existing positions remain unchanged.
- Aggregate open risk > 9%: reject new entry.
- Open orders >= 5: reject new entry.
- Market closed or risk snapshot older than 60 seconds: reject new entry.
- Missing, invalid, non-finite, or timezone-naive risk evidence: fail closed.

The 60-second freshness guard is an inherited conservative control and must be included in staging policy review. No close, amend, cancel, or other broker write action exists in this API.

**Evidence limitation:** HMAC proves that the event was signed by a holder of the EA machine secret; it does not independently prove that the account/equity/open-risk snapshot is truthful. Before any staging result is treated as broker-verified, reconcile these values against the tenant-authorized, read-only MT5 Bridge account and open-position data. Until then, the Risk Gate test proves deterministic evaluation of supplied signed evidence, not independent broker-data verification.

## 4. Durable Object event deduplication

`event-dedupe.js` exports `EventDedupe` for the `EVENT_DEDUPE` namespace. Objects are named by `event_id`. It uses storage transactions for atomic reservation and owner-checked state changes:

- `reserve`: new event gets a 90-second processing lease; in-progress/completed IDs return 409.
- `complete`: matching claim becomes complete and retained for 7 days.
- `release`: matching processing claim is removed if Quant Engine or Risk Gate fails, allowing a safe retry.
- `alarm()`: expires abandoned processing leases and completed IDs.

The class must be provisioned as a SQLite-backed Durable Object namespace in a later approved staging configuration. No namespace, migration, or binding is created by this feature-branch change.

## 5. Cloudflare-to-Python adapter

`integrations/nova-quant-engine-adapter/worker.js` exposes only:
- `POST /v1/mt5/decision`
- `POST /v1/mt5/risk-gate`

It forwards to the fixed `NOVA_QUANT_RUNTIME_ORIGIN` configured by the runtime operator, over HTTPS only, using the internal `NOVA_QUANT_M2M_TOKEN`. It does not accept caller-supplied URLs, headers, or credentials. The Decision API Worker reaches this adapter through its private `QUANT_ENGINE` service binding.

No internal token or runtime origin has been configured in Production. Both Worker and Python runtime token values must be added only for an explicitly approved Staging environment.

## 6. M2M authentication

The EA signs the exact raw HTTP body:
- `X-NOVA-Timestamp`: Unix seconds, exactly 10 digits, max 60-second clock skew.
- `X-NOVA-Signature`: `sha256=<hex>`.
- HMAC-SHA256 input: `<timestamp>.<exact raw request body>`.
- Required secret binding: `MT5_M2M_HMAC_SECRET` (not provisioned).

Replay protection is separate from timestamp validation and is enforced by the Durable Object event reservation. Use unique event IDs generated by the EA; do not reuse IDs for different module events.

## 7. Contract tests

Node tests:

```sh
node --test integrations/nova-mt5-decision-api/*.test.mjs integrations/nova-quant-engine-adapter/*.test.mjs
```

Python tests:

```sh
python -m unittest workers.tests.test_mt5_quant_adapter workers.tests.test_mt5_risk_gate
```

Coverage includes:
- all 30 module identifiers M01–M30;
- HMAC freshness and body-tampering rejection;
- event deduplication, concurrent reservation, ownership, release and completion;
- actual call into the existing HybridQuantumQuantEngine;
- independent risk calculations and each configured policy limit;
- enforced call order Quant Engine → Risk Gate → AI;
- malicious AI text cannot reverse a rejected Risk Gate result;
- fail-closed behavior if any required compute service is unavailable;
- hard execution-off invariants.

## 8. Explicitly not done

- No Production secrets, bindings, routes, deployment, DNS, or Cloudflare resource changes.
- No Supabase/database/migration changes.
- No OpenAI API or additional model provider.
- No MT5 order submission, modification, cancellation, position mutation, or Live Trading.
- No claim of staging success, MT5 end-to-end connectivity, or broker-verified risk snapshot until approved Staging bindings and real read-only MT5 reconciliation are tested.

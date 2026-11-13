# NOVA MT5 Decision API — EA-compatible integration

Status: feature-branch implementation only; not deployed or production-configured.
Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
Branch: `feature/nova-mt5-decision-api`
Base main SHA: `b3ba15c4e8eafc9ee839cb95d42865a0b193e114`
External producer: standalone local workspace `MT5-AI-Trading-EA`
Request contract: `nova.mt5-request.v1`
Normalized internal contract: `nova.mt5-event.v2`

## 1. Match the EA that exists — do not invent fields

The current EA emits one closed-bar signal event with:
- `schema_version=mt5ea.signal.v1`
- `event_id` generated as `<symbol>-<EnumToString(timeframe)>-<bar_epoch>`
- symbol, timeframe, Demo account mode, UTC bar time
- bid, ask, spread points
- BUY/SELL/NEUTRAL totals
- exactly 30 `{name, vote}` entries

The API accepts a signed wrapper:
```json
{
  "schema_version": "nova.mt5-request.v1",
  "signal_event": { "...": "the exact mt5ea.signal.v1 object" },
  "risk_snapshot": {
    "broker_day_start_equity": 10000,
    "current_equity": 9900,
    "aggregate_open_risk_money": 100,
    "open_orders_count": 2,
    "market_open": true,
    "broker_day_start_at": "2026-11-13T00:00:00Z",
    "snapshot_at": "2026-11-13T08:59:30Z",
    "market_data_at": "2026-11-13T08:59:30Z"
  }
}
```

`risk_snapshot` is optional at the transport boundary so the producer can be validated independently. It is mandatory for Risk Gate evaluation. Missing or invalid risk evidence fails closed as WAIT; the API does not infer account equity or open risk from heuristic votes.

The API validates all 30 module names against the EA's actual ordered inventory and maps them to M01–M30. Duplicate, missing, unknown, invalid or count-inconsistent votes are rejected. The Risk Gate requires both account snapshot and latest market-data timestamps; the Local Controller must populate `market_data_at` from its read-only quote snapshot, not copy the closed-bar timestamp.

## 2. Quant adapter truthfulness

The current EA sends votes and a bid/ask snapshot. It does not send the OHLC history, ATR, RSI, normalized return, or liquidity features required by NOVA's existing `HybridQuantumQuantEngine`.

Therefore this integration deliberately uses `MT5HeuristicConsensusAdapter` to normalize the 30 votes and calculate vote counts, directional bias, participation ratio, and consensus strength. These are descriptive heuristic summaries only:
- not a trained model;
- not an ML probability;
- not independent evidence from 30 uncorrelated models;
- not calibrated and not evidence of profitability.

Do not fabricate VQC inputs from vote counts or relabel the heuristic summary as a HybridQuantumQuantEngine prediction. A future richer EA data contract may add separately defined market features and a separately tested model adapter.

## 3. EA-compatible deterministic Risk Gate

The MT5-specific gate uses the standalone EA's current hard safety ceilings:
- Daily loss >= 3% of broker-day starting equity: `ENTRY_LOCK_ONLY` for new entries.
- Aggregate open risk > 2% of current equity: reject new entry.
- Open positions/orders >= 5: reject new entry.
- Market closed, account snapshot or market data older than 60 seconds, invalid/missing fields, or invalid timestamps: fail closed.
- Existing positions are always `NO_CHANGE`; no close, amend, cancel, or broker write operation exists.

This policy is scoped to the MT5 integration only. It does not alter NOVA's other risk policies. The EA's local controls remain independent and must not be weakened.

**Evidence limitation:** HMAC authenticates the sender and protects the exact request body; it does not prove the risk snapshot came from the broker. The Local Controller must obtain/reconcile risk evidence through tenant-authorized read-only MT5 Bridge data before a snapshot is considered broker-verified. Until that read-only reconciliation exists, risk calculations are only as trustworthy as the signed snapshot supplied by the controller.

## 4. Decision authority and AI boundary

Processing order:
1. Resolve `X-NOVA-Key-Id` against the server-side `MT5_M2M_CLIENTS` registry, then verify HMAC-SHA256 over `<timestamp>.<key-id>.<exact raw request body>`; timestamp skew <=60 seconds.
2. Validate the exact EA signal contract and all 30 module names/votes.
3. Add the server-resolved client scope to the normalized event and reserve `<client-id>:<event-id>` using the Durable Object dedupe service.
4. Normalize votes through `MT5HeuristicConsensusAdapter`.
5. Evaluate the independent MT5 Risk Gate.
6. Complete the event reservation.
7. Optionally call Cloudflare Workers AI Llama 3.2 3B for an evidence-bounded explanation only.

Workers AI cannot alter the structured result. A policy pass still returns `WAIT`, because this API is research-only and does not authorize a trade. A risk rejection returns `REJECT`. Missing services, malformed responses, authentication failures, missing risk evidence, and timeouts fail closed as `WAIT`.

All responses keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.

## 5. Durable event lifecycle

`EVENT_DEDUPE` is a SQLite-backed Durable Object namespace contract:
- atomic reservation with a 90-second processing lease;
- completed event retained for 7 days;
- owner-checked complete/release;
- abandoned processing lease cleanup through `alarm()`.

The namespace and Worker binding are not provisioned by this PR. The Durable Object ID is derived from server-resolved `client_id:event_id`, avoiding collisions across tenants that share the EA's symbol/timeframe/bar event ID. Do not use the API in Staging until the binding is explicitly configured and its deployed behavior is verified.

## 6. Machine authentication and runtime boundary

The EA must not hold the NOVA long-lived secret. M2M keys are distinct per registered Local Controller/client; the Key ID is included in the HMAC input and is resolved server-side to a stable client scope. The same EA `event_id` generated by two tenants must not share one Durable Object deduplication namespace. The intended flow is:
- EA -> local Controller over localhost using the existing local controller token;
- Local Controller -> NOVA Decision API using HMAC-SHA256;
- Decision API -> private Quant adapter Service Binding;
- Quant adapter -> fixed HTTPS Python runtime origin using a separate internal bearer token.

The Local Controller must sign the exact forwarded request body using `<timestamp>.<key-id>.<exact raw body>` and keep only its own client secret in its local environment. The API derives `client_id` from its server-side key registry; callers cannot choose the client scope. Deduplication is namespaced by this trusted client scope. Do not place secrets in MQL5 source, EA inputs, `.set` files, logs, or Git.

Required not-yet-provisioned configuration:
- Decision API secret binding `MT5_M2M_CLIENTS` (JSON key registry mapping each Key ID to its secret and stable `client_id`; separate secret per client)
- Decision API Service Binding `QUANT_ENGINE`
- Durable Object namespace `EVENT_DEDUPE`
- Quant adapter `NOVA_QUANT_RUNTIME_ORIGIN` (fixed HTTPS origin)
- Quant adapter `NOVA_QUANT_M2M_TOKEN`
- Python runtime `NOVA_QUANT_M2M_TOKEN`

No Production secret, database, migration, Worker binding, route, DNS, or deployment is changed by this feature branch.

## 7. Verification

Node tests:
```sh
node --test integrations/nova-mt5-decision-api/*.test.mjs integrations/nova-quant-engine-adapter/*.test.mjs
```

Python tests:
```sh
python -m unittest workers.tests.test_mt5_quant_adapter workers.tests.test_mt5_risk_gate workers.tests.test_mt5_decision_pipeline
```

Required evidence before Staging:
- all 30 EA module names map exactly once to M01–M30;
- exact EA event ID format, including `PERIOD_M15` underscore, is accepted;
- per-client HMAC Key ID resolution, timestamp freshness, tampering, duplicate event and replay cases pass;
- identical EA event IDs from different client scopes map to distinct Durable Object IDs;
- real Python adapter and Risk Gate are called in order;
- 3% / 2% / 5 risk thresholds and stale/missing snapshot fail-closed behavior pass;
- risk snapshot reconciles against read-only MT5 Bridge account and position data;
- Worker-to-Worker Service Binding and Durable Object behavior verified in a dedicated Staging environment;
- no execution path exists and all execution flags remain false.

## 8. Explicitly not done

- No MT5 EA source or local Controller changes.
- No EA GitHub repository creation.
- No Production secrets, database/migrations, Cloudflare bindings, routes, DNS, or deployment.
- No OpenAI API or new model provider.
- No order placement/modification/cancellation, position mutation, or Live Trading.
- No claim of broker-verified risk, deployed health, or end-to-end MT5 connectivity.

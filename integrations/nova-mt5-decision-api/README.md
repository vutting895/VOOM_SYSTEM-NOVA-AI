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

The API accepts a signed wrapper containing only the exact EA signal:
```json
{
  "schema_version": "nova.mt5-request.v1",
  "signal_event": { "...": "the exact mt5ea.signal.v1 object" }
}
```

The Controller must not send `risk_snapshot`; the Decision Worker rejects that field with `controller_risk_snapshot_not_trusted`. The Worker fetches broker evidence from the tenant-authorized Bridge using its private `MT5_BRIDGE` Service Binding. It does not fall back to Controller-supplied equity or exposure.

The API validates all 30 module names against the EA's actual ordered inventory and maps them to M01–M30. Duplicate, missing, unknown, invalid or count-inconsistent votes are rejected.

## 2. Quant adapter truthfulness

The current EA sends votes and a bid/ask snapshot. It does not send the OHLC history, ATR, RSI, normalized return, or liquidity features required by NOVA's existing `HybridQuantumQuantEngine`.

Therefore this integration deliberately uses `MT5HeuristicConsensusAdapter` to normalize the 30 votes and calculate vote counts, directional bias, participation ratio, and consensus strength. These are descriptive heuristic summaries only:
- not a trained model;
- not an ML probability;
- not independent evidence from 30 uncorrelated models;
- not calibrated and not evidence of profitability.

Do not fabricate VQC inputs from vote counts or relabel the heuristic summary as a HybridQuantumQuantEngine prediction. A future richer EA data contract may add separately defined market features and a separately tested model adapter.

## 3. EA-compatible deterministic Risk Gate

The deterministic Risk Gate policy is:
- Daily loss >= 10% of broker-day starting equity: `ENTRY_LOCK_ONLY` for new entries.
- Aggregate open risk + proposed entry risk > 9% of current equity: reject the new entry.
- Open positions/orders >= 5: reject the new entry.
- Market closed, account snapshot or market data older than 60 seconds, invalid/missing fields, or invalid timestamps: fail closed.
- Existing positions are always `NO_CHANGE`; no close, amend, cancel, or broker write operation exists.

`proposed_entry_risk_money` is mandatory at Risk Gate evaluation. It must represent the monetary loss from the candidate order's actual volume to its actual stop-loss, calculated in the broker account currency using contract size, tick size/value, and applicable conversion rates. Do not substitute a percentage, quote-currency estimate, or zero when the stop-loss or conversion data is unavailable; reject the request.

**Bridge progress and remaining blockers:** the read-only Bridge now exposes `GET /api/exposure` with broker-sourced Open Positions, Pending Orders, per-position stop-loss risk, aggregate risk in account currency, account login/server scope, current equity, and snapshot time. It uses MT5 `positions_get()`, `orders_get()`, and `order_calc_profit()` under the terminal process lock. Unknown stop-loss risk returns `null` and `risk_calculation_complete=false`, never zero.

The Windows Bridge now captures a durable broker-day equity baseline from the current MT5 D1 bar and recalculates candidate risk with `order_calc_profit()`. The EA signal contract accepts a `candidate` object (`symbol`, `side`, `volume`, `entry_price`, `stop_loss`), but the current EA producer has not yet been updated in this repository to emit those fields. Requests without a candidate or a valid durable baseline therefore fail closed before Quant Engine dispatch. The Bridge still reports `policy_attestation.status=not_attested`; it cannot certify active EA inputs or the installed EX5 binary.

**Evidence limitation:** HMAC authenticates the sender and protects the exact signal request body; it does not prove broker state. The Decision Worker now discards this trust model: it rejects any Controller `risk_snapshot` and independently calls the tenant-authorized Bridge. Because the current Bridge does not yet expose the complete broker-day and candidate-risk contract, the Worker rejects the request before Quant Engine dispatch. No Controller-provided fallback is allowed.

## 3B. Candidate input and broker-day baseline

The EA signal may include:
```json
"candidate": {
  "symbol": "XAUUSDm",
  "side": "BUY",
  "volume": 0.10,
  "entry_price": 2600.20,
  "stop_loss": 2590.20
}
```

The Worker validates the exact fields and symbol match, then forwards the candidate to the Bridge through the tenant-scoped Relay. The Bridge independently validates broker volume limits/step and stop geometry and recalculates loss using MT5 `order_calc_profit()`. The Risk Gate receives `proposed_entry_risk_money` from that Bridge response, in account currency.

The Bridge persists the first observed equity within 30 seconds of the broker D1 bar open to a local SQLite database (WAL + FULL synchronous). A 2-second background poll attempts rollover capture. The baseline is keyed by tenant/account/server/day and is not reset on process restart. If no valid sample was captured within the 30-second window, the day remains blocked; current equity is never substituted.

This does not size candidate volume. Candidate volume still has to be supplied by the EA's strategy layer. The current EA source is not yet updated to emit this candidate object, so the existing EA-to-Decision path remains blocked until that producer is updated and compiled/tested. Candidate risk excludes commission, slippage and gaps; do not treat it as guaranteed maximum loss.

## 3A. Trusted Bridge boundary (feature branch)

- `MT5_M2M_CLIENTS` records must map each Key ID to `client_id`, `tenant_id`, `account_login`, and `broker_server`. These values are server-side registry data; callers cannot choose them.
- `MT5_BRIDGE_TOKENS` is a Staging secret JSON map keyed by tenant ID. It contains the same tenant-scoped read-only relay token registered in the Relay Worker; do not commit token values.
- Decision Worker calls `GET /api/exposure` only through the `MT5_BRIDGE` Service Binding. The Relay Worker routes the request to the Durable Object session for that tenant. The Bridge response's account login and broker server must exactly match the authenticated client registry.
- Relay Worker allowlists `/api/exposure` as GET-only and rejects query parameters. The Windows Relay Client already has the endpoint in its allowlist and treats it as a query-free GET.
- Missing binding/credentials, wrong account/server, stale snapshot, incomplete exposure, or missing required broker-risk fields returns a fail-closed error before Quant Engine dispatch.
- Current Bridge `/api/exposure` only supplies current equity, open/pending exposure, account currency and snapshot time. It does **not** yet supply broker-day starting equity, broker-day start timestamp, market-open state, market-data timestamp, or candidate-entry risk. Therefore the present Bridge contract intentionally cannot satisfy the full Risk Gate contract; the Decision API remains fail-closed until those fields are added from authoritative sources. Do not synthesize them from Controller input.

## 4. Decision authority and AI boundary

Processing order:
1. Resolve `X-NOVA-Key-Id` against the server-side `MT5_M2M_CLIENTS` registry, then verify HMAC-SHA256 over `<timestamp>.<key-id>.<exact raw request body>`; timestamp skew <=60 seconds.
2. Validate the exact EA signal contract and all 30 module names/votes.
3. Add the server-resolved client scope to the normalized event, fetch `GET /api/exposure` through `MT5_BRIDGE`, verify tenant/account/server identity and freshness, and reject incomplete broker-risk fields.\n4. Only after trusted Bridge validation, reserve `<client-id>:<event-id>` using the Durable Object dedupe service.
5. Normalize votes through `MT5HeuristicConsensusAdapter`.
6. Evaluate the independent MT5 Risk Gate.
7. Complete the event reservation.
8. Optionally call Cloudflare Workers AI Llama 3.2 3B for an evidence-bounded explanation only.

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
- Decision API secret binding `MT5_M2M_CLIENTS` (JSON key registry mapping each Key ID to its secret, stable `client_id`, `tenant_id`, `account_login`, and `broker_server`; separate secret per client)
- Decision API secret binding `MT5_BRIDGE_TOKENS` (tenant-ID to read-only Bridge relay token map; Staging only)
- Matching Staging-only `QUANT_ADAPTER_M2M_TOKEN` secret on the Decision API Worker and Quant Adapter Worker (authenticates the private service-binding caller)
- Decision API Service Binding `MT5_BRIDGE` to `voom-mt5-bridge-relay`
- Decision API Service Binding `QUANT_ENGINE`
- Durable Object namespace `EVENT_DEDUPE`
- Quant adapter `NOVA_QUANT_RUNTIME_ORIGIN` (fixed HTTPS origin)
- Quant adapter `NOVA_QUANT_M2M_TOKEN` (separate internal bearer token from Decision API → adapter runtime hop)
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
- 10% / 9% / 5 risk thresholds, proposed-entry aggregation, and stale/missing snapshot fail-closed behavior pass;
- read-only MT5 Bridge supplies Account Summary, Open Positions, Pending Orders, per-position stop-loss risk, quote timestamps, account currency, and stable account scope; Broker-Day Starting Equity and candidate-entry risk are independently captured and verified;
- Worker-to-Worker Service Binding and Durable Object behavior verified in a dedicated Staging environment;
- no execution path exists and all execution flags remain false.

## 8. Explicitly not done

- No MT5 EA source or local Controller changes.
- No EA GitHub repository creation.
- No Production secrets, database/migrations, Cloudflare bindings, routes, DNS, or deployment.
- No OpenAI API or new model provider.
- No order placement/modification/cancellation, position mutation, or Live Trading.
- No claim of broker-verified risk, deployed health, or end-to-end MT5 connectivity.

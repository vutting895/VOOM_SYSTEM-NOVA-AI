# NOVA v1 Master Integration — Trading API Contract (Proposal)

- Contract status: proposed; not deployed and not enabled
- API owner: NOVA System Hub + domain services
- Baseline: main SHA `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`
- Scope: Forex, Gold, Crypto; MT5/All-in-One is one constrained adapter
- Execution posture: disabled; Demo-only future path; Live Trading prohibited

## 1. Contract rules

- All public requests use HTTPS and a verified Supabase bearer token.
- The server derives principal, tenant, connection ownership, broker account identity and permissions. Client-supplied tenant/account identity is never authoritative.
- AI/strategy/EA output is untrusted. It may submit a candidate intent, not an order.
- Risk, approval, execution mode and policy version are server-owned.
- Public clients cannot call broker order APIs. The broker adapter is private and separately authenticated.
- Strict schemas reject unknown fields; unknown capability or missing evidence fails closed.
- Monetary risk values are expressed in a canonical account currency only after instrument and account conversion have been verified. Include currency code and scale; never infer USD from USC.
- All timestamps are ISO-8601 UTC; market data includes source timestamp, received timestamp and freshness.
- Idempotency is mandatory and durable. Replays return the original intent state; ambiguous broker submissions require reconciliation, not blind retry.

## 2. Trade Intent request

### Endpoint

`POST /v1/trading/intents`

Authenticated, tenant-scoped candidate creation. This endpoint does not place an order.

### Request schema (illustrative)

```json
{
  "schema_version": "nova.trade-intent.v1",
  "idempotency_key": "unique-client-generated-key",
  "instrument": {
    "symbol": "XAUUSD",
    "asset_class": "GOLD",
    "broker": "EXNESS",
    "timeframe": "M5"
  },
  "candidate": {
    "side": "BUY",
    "order_type": "MARKET",
    "entry_reference": 2700.0,
    "stop_loss": 2695.0,
    "take_profit": 2710.0,
    "valid_until": "2026-11-18T12:00:30Z"
  },
  "research": {
    "strategy_id": "mtraders.hybrid.v1",
    "model_versions": ["xgboost-v1", "lstm-v1"],
    "decision_id": "decision-id",
    "market_data_ref": "immutable-dataset-or-bar-reference",
    "market_data_sha256": "64-hex-digest",
    "source_bar_time_utc": "2026-11-18T11:55:00Z"
  },
  "execution_request": {
    "requested_mode": "DEMO"
  }
}
```

### Required validation

- Asset class is one of `FOREX`, `GOLD`, `CRYPTO`; symbol is allowlisted for the selected broker/connection.
- Timeframe and order type are supported by the selected adapter.
- Prices are finite, positive, and geometrically consistent with side; SL/TP are mandatory for the initial market-order profile.
- Candidate expiry is short-lived and later than issue time; source bar and quote are fresh.
- Research provenance references immutable, verified market data and model/strategy versions.
- The server resolves a single tenant-owned Demo connection and verifies its identity before any later execution step.
- No risk thresholds, approval status, execution permission, broker login, account currency, or tenant ID may be set by the request.

## 3. Intent lifecycle

Allowed state transitions:

```text
RECEIVED
  -> REJECTED_SCHEMA
  -> REJECTED_DATA
  -> RISK_REJECTED
  -> APPROVAL_REQUIRED
  -> APPROVED
  -> EXECUTION_DISABLED
  -> READY_FOR_DEMO
  -> SUBMISSION_PENDING
  -> BROKER_ACCEPTED
  -> PARTIALLY_FILLED
  -> FILLED
  -> BROKER_REJECTED
  -> RECONCILIATION_REQUIRED
  -> EXPIRED / CANCELLED
```

Only valid transitions are accepted. A client cannot set state directly. A duplicate idempotency key returns the existing record and must not create a second broker command.

## 4. Risk evaluation contract

Risk Guard is deterministic and independent of AI. Input evidence must include:

- verified account identity, environment, server and account currency;
- broker-day starting equity and current equity;
- open positions and pending orders across the entire account;
- instrument contract size, tick size/value, margin and conversion rates;
- current spread, quote timestamp and execution-cost estimate;
- existing and proposed stop-loss risk, normalized into account currency;
- current policy version, per-tenant/global kill-switch state and freshness bounds.

Output:

```json
{
  "schema_version": "nova.risk-decision.v1",
  "decision": "APPROVE",
  "reason_codes": [],
  "policy_version": "policy-version",
  "account_currency": "USD",
  "proposed_risk_money": 10.0,
  "projected_open_risk_money": 100.0,
  "projected_open_risk_pct": 1.0,
  "daily_loss_pct": 0.0,
  "account_exposure_count": 1,
  "max_account_exposure_count": 5,
  "entry_lock": false
}
```

A decision is denied when any mandatory field is missing, stale, non-finite, contradictory or unverified. A daily-loss threshold triggers an entry lock only; it must not prevent protective management of existing positions.

### Policy parameters

The following are design references, not an active Production configuration:

| Parameter | Candidate reference | Rule |
|---|---:|---|
| Daily loss | 10% of broker-day starting equity | Entry lock only; require explicit policy version and verified baseline |
| Aggregate open risk | 9% | Account-wide and normalized to account currency |
| Total orders/positions | 5 | Positions + pending orders, across symbols and all EA instances |
| Per-trade risk | Must be set by approved policy | PR #297 branch proposes 1%; not activated here |
| Aggregate profit close | Not part of this v1 intent contract | Separate close policy and separately authorized capability |

No value in this table changes the live or Demo system. Production risk policy is untouched.

## 5. Approval Gate

### Endpoint

`POST /v1/trading/intents/{intentId}/approve`

- Requires authenticated principal and a server-side role/capability check.
- Approver identity is derived from verified auth context, never request body.
- Approval binds to immutable intent hash, account/connection, policy version, expiry and decision evidence.
- Any change to intent, account, market data, risk snapshot or policy invalidates the approval and requires reevaluation.
- Approval does not itself execute or enable execution.
- A model cannot approve its own output.
- Enabling automated Demo execution is a separate, explicit release/configuration approval, not an intent-level shortcut.

## 6. Execution boundary

Public endpoint:

- `GET /v1/trading/intents/{intentId}` — read state for the owning tenant.
- `GET /v1/trading/execution/status` — capability and gate status; must report disabled until all gates are satisfied.

Private service-to-service operations (not exposed to browser/LLM clients):

- `POST /internal/v1/demo/commands` — signed, short-lived, tenant/account-bound command.
- `GET /internal/v1/demo/commands/{commandId}` — internal command state/reconciliation.

The Demo adapter must independently verify Demo account identity, connection ownership, signature, nonce, durable idempotency, expiry, symbol, volume, SL/TP, policy version and current risk reservation immediately before broker mutation. Unknown account environment, disconnected terminal, failed risk service, unavailable kill switch, or reservation conflict means reject.

No public `/orders`, `/execute`, `/withdraw`, `/transfer`, or Live route is defined.

## 7. Response examples

Candidate created but not executable:

```json
{
  "schema_version": "nova.trade-intent-response.v1",
  "intent_id": "server-generated-id",
  "status": "EXECUTION_DISABLED",
  "risk_decision": "NOT_EVALUATED",
  "approval_status": "NOT_REQUESTED",
  "execution_mode": "DEMO",
  "orders_enabled": false,
  "execution_enabled": false,
  "live_trading_enabled": false
}
```

Risk rejected:

```json
{
  "schema_version": "nova.trade-intent-response.v1",
  "intent_id": "server-generated-id",
  "status": "RISK_REJECTED",
  "reason_codes": ["DAILY_LOSS_ENTRY_LOCK"],
  "orders_enabled": false,
  "execution_enabled": false,
  "live_trading_enabled": false
}
```

## 8. Error semantics

| HTTP | Meaning |
|---|---|
| 400 | Invalid schema, unknown field, unsupported instrument/order type |
| 401 | Missing/invalid/expired authentication |
| 403 | Tenant/connection/approval capability denied |
| 404 | Intent not found or not visible to tenant |
| 409 | Idempotency conflict, stale state transition, reservation conflict |
| 422 | Valid schema but invalid market/risk/order geometry |
| 429 | Rate limit |
| 503 | Auth, risk, policy, kill switch, market data or execution dependency cannot be verified |
| 502/504 | Broker adapter/bridge failure; ambiguous submission requires reconciliation |

Error bodies must not expose credentials, raw broker payloads, secrets, or cross-tenant identifiers.

## 9. Audit and reconciliation

Persist append-only events for intent received, data validation, risk evaluation, approval/rejection, reservation, command signing, adapter acknowledgement, broker response, partial/final fill, cancellation, reconciliation and operator action. Each event records server timestamp, actor/service identity, tenant reference, intent/command IDs, policy/model versions, payload hash, correlation ID and sanitized reason code.

Never record access tokens, broker passwords, HMAC keys, or secret-bearing payloads.

## 10. Compatibility with current source

This is a proposed canonical contract. Existing sources are not yet proven to implement it end-to-end:

- PR #331 describes System Hub API and read-only broker endpoints.
- PR #297 provides pure intent validation and close planning only.
- PR #302 defines research-only MTRADERS decision contracts.
- PR #319 defines a Meta Decision candidate.
- PR #334 defines a hard-disabled Demo execution service.
- PR #336 defines a separate Demo adapter command/risk policy.
- PR #322 defines another MT5 decision/EA path.

These must be reconciled into one canonical contract before implementation. No deployment or execution is enabled by this document.

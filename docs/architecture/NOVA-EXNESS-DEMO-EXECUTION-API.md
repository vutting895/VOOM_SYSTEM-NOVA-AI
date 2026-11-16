# NOVA Exness MT5 Demo Execution API — Architecture & Delivery Plan

- Status: design baseline / implementation pending
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base branch: `main` at `b11b46420b5056fea1c1570c4382e6097928c771`
- Feature branch: `feat/nova-exness-demo-execution-adapter-20261116`
- Target: the user's existing Exness MT5 Demo terminal through the tenant-isolated Windows Bridge and Cloudflare WSS relay
- Live trading: permanently disabled in this delivery scope

## 1. Decision

Add a separate, Demo-only execution adapter. Do not convert or weaken the existing `integrations/mt5-readonly-bridge`. The existing bridge, read-only proxy, relay allowlists, System Hub and read-only regression tests are security boundaries and must remain read-only.

The execution adapter is a separate Windows-side process/service, with a separate command protocol and explicit capability allowlist. It may reuse the tenant identity and outbound relay transport pattern, but must not share the read-only bridge's HTTP routes or broaden its GET-only path set.

## 2. Current verified state

- `workers/runtime.py` is research/approval-only; it has no broker order routes.
- `integrations/mt5-readonly-bridge/bridge.py` permits GET/OPTIONS only and rejects order/trade/execute paths.
- `integrations/mt5-readonly-bridge/bridge_relay_client.py` allowlists only `/health`, `/api/account`, `/api/symbols`, and `/api/quotes`.
- `integrations/mt5-bridge-relay/worker.js` is a tenant-scoped WSS relay for the read-only path.
- `integrations/mt5-readonly-proxy/worker.js` authenticates Supabase sessions and resolves the signed-in user's own `broker_connections` row.
- The existing trading safety regression suite asserts that HTTP toggles and order execution remain disabled.
- The current FastAPI Docker PR #335 is a research service deployment candidate, not an execution service or public URL.

No order execution capability is currently evidenced as implemented or deployed.

## 3. Service boundaries

1. **NOVA Intelligence API** — market data, SMC, Elliott Wave, ML inference and strategy signals. It emits a typed trade proposal, never a broker command.
2. **NOVA Risk API** — independently validates account state, exposure, sizing, SL/TP, spread, market state, daily loss and policy version.
3. **NOVA Demo Execution API** — accepts only risk-approved, owner-scoped, Demo-only commands and dispatches them to the dedicated Windows execution adapter.
4. **MT5 Read-only Bridge** — unchanged; remains the source for independent account/market reads.
5. **MT5 Demo Execution Adapter** — new isolated Windows-side component, separate process, secret, relay command path and audit stream.

AI/model output is untrusted input. It cannot supply or override tenant IDs, connection IDs, account identity, risk settings, allowed symbols, policy versions, or execution permissions.

## 4. Initial API contract

All routes are authenticated, owner-scoped, rate-limited and require a connected Exness MT5 Demo connection.

- `POST /v1/exness/demo/preflight` — validate account, symbol, market state, volume and risk without sending an order.
- `POST /v1/exness/demo/orders` — submit a market or explicitly supported pending order using a server-generated command ID and client idempotency key.
- `GET /v1/exness/demo/orders/{client_order_id}` — retrieve persisted command/result state.
- `GET /v1/exness/demo/positions` — list current positions.
- `POST /v1/exness/demo/positions/{position_ticket}/close` — close an owned Demo position.
- `PATCH /v1/exness/demo/positions/{position_ticket}/protection` — modify SL/TP under risk-policy validation.
- `GET /v1/exness/demo/account` — read the verified account snapshot.

No generic broker proxy, arbitrary URL, raw MT5 method name, arbitrary Python execution, arbitrary terminal path, or user-supplied account/tenant route is permitted.

## 5. Command protocol and isolation

- The Windows execution adapter must run in the same dedicated Windows user session as the intended MT5 terminal.
- It must open outbound authenticated WSS only; no public inbound listener and no exposed MT5 port.
- Use a separate Worker/relay command namespace and separate command allowlist. Do not add POST/PATCH support to the existing read-only relay or bridge.
- Authenticate the end user at the NOVA API/Hub with Supabase JWT; resolve the connection from the caller's own RLS-protected row. Never trust a model-supplied connection ID or tenant ID.
- Authenticate the adapter using a unique per-tenant service credential held outside Git and outside chat. Never print or return the credential.
- Bind each command to tenant, connection, verified account fingerprint, Demo environment, command ID, idempotency key, expiry, nonce, policy version and canonical payload hash.
- The adapter must independently verify the active MT5 account is Demo and the broker/company identity contains Exness immediately before every mutation.
- Persist command intent and idempotency state before dispatch. Repeated requests with the same idempotency key must return the original command state and must never place a second order.
- Relay disconnect, stale account snapshot, stale quote, uncertain result, timeout after dispatch, duplicate command, policy mismatch or missing audit storage must fail closed. An uncertain send must be reconciled by querying MT5 history/positions before any retry.

## 6. Trading and risk policy

The initial Demo policy inherits the previously specified NOVA controls; all values must be verified against current account currency and broker contract specifications before implementation:

- Daily loss lock: 10% of broker-day starting equity; lock new entries only. Do not auto-close existing positions as a side effect of this lock.
- Maximum aggregate open risk: 9% of equity. This is a ceiling, not a target; the Risk API may reject lower-quality or insufficiently protected proposals.
- Maximum open orders/positions: 5 (define and test whether pending orders count toward the cap before coding).
- Every new position requires broker-confirmed SL and TP or a separately approved protection policy. No naked positions.
- Validate volume min/max/step, tick size/value, contract size, free margin, stop/freeze levels, spread, slippage/deviation, symbol trade mode, market session and quote freshness.
- Enforce daily loss, exposure and order count in a single serialized account-level risk transaction to prevent concurrent requests bypassing limits.
- Emergency stop blocks new commands immediately. It must not falsely report a cancellation or position close unless MT5 confirms it.
- No withdrawals, transfers, deposits, leverage changes, account settings changes or credential management.

The user previously specified an adjustable aggregate profit-close threshold with a default discussed as 100 account-currency units. Treat this as a separate policy item: do not implement or activate it until the exact currency, scope (all positions vs selected strategy), trigger semantics and behavior on partial fills are confirmed.

## 7. Demo-only hard gates

The adapter must reject execution unless all conditions are true:

1. Environment is exactly `demo`.
2. MT5 `account_info().trade_mode` equals `ACCOUNT_TRADE_MODE_DEMO`.
3. Server/company identity passes the Exness allowlist.
4. The tenant and connection are active, owner-scoped and provisioned by a trusted control-plane operation.
5. The account fingerprint matches the previously verified connection.
6. Live execution flags are false and a server-side Demo execution feature flag is true for this tenant only.
7. Risk preflight passes against fresh broker data.
8. The command is within its short expiry, nonce and idempotency constraints.
9. The audit journal is writable and the relay session is authenticated.
10. All invariants are rechecked immediately before `mt5.order_send`.

Any missing or ambiguous field rejects the command. A client request cannot turn on the feature flag. Live account detection is a hard rejection, not a fallback mode.

## 8. Observability and evidence

Record sanitized events for proposal received, risk result, command accepted/rejected, dispatch started, broker retcode, order/deal/position ticket, reconciliation, close/modify result and emergency stop. Never log tokens, passwords, full account credentials or unrestricted request payloads.

A successful API HTTP response is not proof of a filled order. Distinguish `accepted`, `dispatched`, `broker_confirmed`, `partially_filled`, `rejected`, `unknown_reconciliation_required`, and `closed`. Persist broker retcode and timestamps.

## 9. Required test gates

- Unit tests for Demo identity, Exness identity, volume/price normalization, stop levels, risk calculations, idempotency, command expiry, nonce replay, concurrent account-level risk checks and all fail-closed cases.
- Contract tests proving the old read-only bridge and relay remain GET-only and have no order methods.
- Negative tests for live account, wrong broker, wrong tenant, wrong owner, unverified connection, expired command, duplicate command, stale quote, no SL/TP, exceeded risk/order caps, missing audit store and relay loss.
- Adapter tests with a fake MT5 module; no real order is sent by CI.
- End-to-end validation first against a dedicated Exness Demo terminal with minimal test size and explicit operator observation; capture sanitized evidence and reconcile broker history.
- Docker/FastAPI tests are separate from the Windows terminal adapter tests.

## 10. Delivery phases

A. Contract + threat model (this document).
B. Isolated Demo execution adapter and command relay, with fake-MT5 tests.
C. Risk/ledger/idempotency integration and API endpoints.
D. Security review and CI regression proving the read-only path is unchanged.
E. Controlled Demo staging test on the user's existing terminal.
F. Production review of service deployment. Live Trading remains OFF and is out of scope.

No phase is considered complete without source commit, exact-head test evidence and runtime evidence where applicable. No merge, production deployment, secret provisioning, firewall/DNS change or real order submission is authorized by this design document alone.

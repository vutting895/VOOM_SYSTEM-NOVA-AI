# Exness Demo Automated Execution Policy

**Status:** Approved policy intent; implementation and runtime activation are NOT yet approved as complete.  
**Policy version:** 2026-11-11  
**Applies to:** NOVA, Exness MT5 Demo only.

## 1. Authorization boundary

The owner has approved AI-initiated automated order submission and position management on the dedicated Exness MT5 Demo account, subject to mandatory Backend Policy and Risk Policy enforcement.

This approval does not authorize:
- Any Live/real-money account connection or order execution.
- Deposits, withdrawals, transfers, or changes to account funding.
- Reusing a Demo execution credential or terminal route for another tenant.
- Bypassing risk checks, account-mode verification, tenant isolation, audit logging, or kill switches.
- Treating model output as an authorization decision.

## 2. Required architecture

All broker mutations must pass through this chain:

`Nova UI / AI Worker -> Backend Policy -> Identity + Tenant Guard -> Risk Engine -> Demo Execution Adapter -> MT5 Demo Bridge`

The LLM and MCP layer may propose an action, but must not call the broker directly. The Backend Policy service is the sole policy decision point and the only component allowed to authorize a broker mutation. The execution adapter must independently fail closed if policy authorization is missing, expired, mismatched, or invalid.

## 3. Account and environment enforcement

Every execution request must verify, at execution time:
- Provider is Exness MT5.
- Environment is Demo, confirmed from terminal/account metadata, not from a client-supplied flag.
- Authenticated Supabase identity owns the connection record.
- Tenant ID, connection ID, bridge route, and credential mapping match.
- The bridge is connected to the expected Demo server/account.
- Live mode is rejected at every layer, including adapter and bridge.
- Unknown, missing, stale, or conflicting account metadata causes rejection.

No UI setting, prompt, model response, MCP argument, or API body may override these checks.

## 4. Permitted Demo actions after implementation and tests

The intended Demo-only action set may include:
- Submit market and limit orders.
- Set and modify Stop Loss / Take Profit.
- Move stops using trailing-stop and break-even rules.
- Reduce or close positions.
- Cancel pending orders.
- Read orders, positions, deals, account state, quotes, and history.

Each action must be explicitly allow-listed and schema-validated. No generic arbitrary MT5 method invocation is permitted. The bridge must not expose deposit, withdrawal, transfer, account administration, or credential-management actions.

## 5. Mandatory risk gates

Before every new order or risk-increasing modification, the Risk Engine must evaluate at least:
- Maximum risk per trade and position size.
- Aggregate open risk and exposure by symbol/direction.
- Maximum concurrent positions and pending orders.
- Daily loss and peak-to-trough drawdown limits.
- Spread, slippage, quote freshness, and market/session conditions.
- Stop-loss presence and validity; reject unbounded-risk entries.
- Margin sufficiency and broker volume/price constraints.
- Duplicate/idempotency protection and order-rate limits.
- Strategy/model eligibility, data freshness, and kill-switch state.

Risk-increasing actions must be rejected if any required metric is unavailable, stale, invalid, or outside configured bounds. Risk-reducing actions (cancel pending order, reduce exposure, close position) may use a separate narrowly scoped emergency policy, with audit logging and Demo-account verification.

**Numeric thresholds are intentionally not invented in this policy document.** Automated execution must remain disabled until the owner-approved risk configuration is present, validated, versioned, and covered by tests.

## 6. Kill switches and operational controls

Required controls:
- Global execution kill switch, default OFF until all gates pass.
- Per-tenant and per-account kill switches.
- Strategy-level pause and order-rate limits.
- Circuit breaker on repeated broker/API errors, stale prices, rejected orders, or unexpected position state.
- Reconciliation after every mutation using broker-confirmed order/position state.
- No success response until broker confirmation is received.
- Manual operator override to disable automation; re-enabling requires explicit authorization and health checks.

## 7. Audit and observability

For every decision and attempted mutation, record:
- User/tenant/connection identifiers (non-secret opaque IDs).
- Policy and risk configuration versions.
- Model/strategy and signal identifiers.
- Requested action, normalized parameters, risk decision, and reason codes.
- Idempotency key and broker request/result identifiers.
- Broker-confirmed state, timestamps, latency, and error codes.

Never log passwords, bearer tokens, bridge secrets, or full credential-bearing payloads.

## 8. Required verification before activation

Activation is blocked until all of the following are demonstrated:
1. Unit and integration tests for every allowed action and forbidden action.
2. Positive Exness Demo account-mode verification and negative Live-account rejection.
3. Owner-vs-foreign-tenant isolation tests for every read and write path.
4. Risk boundary tests, missing/stale-data fail-closed tests, and kill-switch tests.
5. Duplicate request/idempotency and retry/reconciliation tests.
6. Broker error, timeout, partial fill, and disconnect recovery tests.
7. Security review of Backend Policy, MCP tool registry, execution adapter, and Bridge.
8. End-to-end runtime proof on the dedicated Exness Demo account.
9. Exact-head CI and deployment verification for the reviewed commit.

Until these gates pass, the existing MT5 Bridge and MCP endpoints remain read-only and all execution flags remain false.

## 9. Explicit disabled capabilities

The following remain prohibited:
- Live/real-money trading.
- Deposits, withdrawals, and transfers.
- Arbitrary terminal command execution.
- Any bypass of Backend Policy or Risk Engine.
- AI-generated execution code or unbounded tool arguments.

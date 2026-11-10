# Exness Demo Automated Execution Policy

**Status:** Owner-approved policy intent; implementation and runtime activation are NOT yet approved as complete.  
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

### Owner-selected per-trade ceiling

**Maximum risk per trade: 1% of current account Equity, calculated in USD.**

For this policy, risk per trade means the estimated maximum monetary loss if the initial Stop Loss is executed, including estimated spread, commission, swap where applicable, and slippage, divided by the latest verified current Equity converted to USD. It does **not** mean 1% of notional position value, margin used, or order volume.

The 1% value is a hard upper bound, not a target or recommended default. The Risk Engine must size volume from the stop distance, instrument contract specifications, account denomination, and currency conversion; it must never infer volume directly from the 1% percentage. Risk must be recalculated against fresh Equity and broker metadata immediately before submission. If a valid Stop Loss or reliable cost/contract/currency calculation is unavailable, reject the order.

### Canonical currency and reporting policy

**USD is the canonical internal currency for all risk calculations and cross-account comparisons. THB is an additional reporting currency only.** The broker-native account currency and denomination remain authoritative for broker-facing values and order parameters.

The currency service must:
- Read account currency and authoritative account/terminal denomination metadata from the authenticated MT5 session. Read contract size, tick size, tick value, profit currency, margin currency, and volume constraints from broker symbol metadata.
- Convert broker-native account-currency values into USD for risk decisions using a validated, timestamped FX conversion source. Convert USD reporting values into THB for display using a separately identified, timestamped USD/THB rate.
- Keep risk calculations in USD consistently: Equity, balance, free/used margin, realized and unrealized P&L, commission, swap, spread/slippage estimates, stop-loss loss, daily loss, and aggregate exposure. If a trading instrument's profit or margin currency differs from the account currency, resolve the full conversion path with validated rates.
- Display broker-native amount and currency, USD-normalized amount, and THB indicative amount together where applicable. Show denomination classification, FX pair/rate, source, timestamp, and conversion status so the operator can audit each figure.
- Treat THB as reporting-only: THB display conversion must never change order size, risk authorization, daily-loss decisions, or broker-native order parameters.
- Use decimal-safe arithmetic and explicit currency/unit metadata. Do not use binary floating-point for money or silently assume that one displayed cent-account unit equals a fixed fraction of a standard-account unit.
- Never infer cent/micro scale from account name, UI preference, or a user-entered multiplier. If denomination cannot be verified, fail closed.
- Preserve broker-native values for all broker requests. Never send USD/THB normalized reporting units as broker price, volume, contract, or order fields.
- Recompute normalization from fresh account/symbol metadata and FX rates before each risk-increasing action. Persist the metadata, rate, source, timestamp, and conversion algorithm/version used in the decision audit.
- Reject risk-increasing actions when any required FX rate or denomination input is missing, stale, inconsistent, outside configured tolerance, or unavailable. A THB-only reporting-rate failure may suppress THB display but must not corrupt or silently alter USD risk calculations.

Automated account normalization is a risk-critical component, not a cosmetic display conversion. It must be independently tested for standard, micro, and cent account fixtures; multiple account currencies; instruments with differing profit/margin currencies; multi-hop FX conversion; USD and THB reporting; rounding boundaries; stale/missing rates; and broker metadata changes. A mismatch or ambiguous unit must reject new risk-increasing actions.

### Owner-selected daily loss ceiling

**Maximum daily loss: 10% of current account Equity (dynamic/current-Equity basis), with all risk values normalized to USD.**

Daily loss must be measured as the net decline from the captured start-of-day Equity, including realized and unrealized P&L attributable to the current broker trading day. At every risk check, compare that USD-denominated loss amount against 10% of the latest verified current Equity converted to USD. The threshold therefore changes as current Equity changes; it is not 10% of the beginning-of-day Equity. Use a consistent FX valuation convention for the start-of-day snapshot and current valuation, and retain both broker-native and USD values for audit.

The trading-day boundary and start-of-day Equity snapshot must use a single explicitly configured broker-server timezone/day boundary, be persisted and auditable, and must not be reset by restarting NOVA, reconnecting, changing tenants, or changing strategy. If the snapshot, timezone, current Equity, P&L inputs, denomination, or required FX inputs are missing, stale, inconsistent, or cannot be reconciled, reject new risk-increasing actions and fail closed. Once the daily limit is reached, block new entries and all risk-increasing modifications for the remainder of that broker trading day. Risk-reducing actions may remain available through the separately scoped emergency policy.

Because 1% per trade and 10% daily loss are aggressive ceilings, aggregate open risk must be independently capped. **The aggregate open-risk limit, maximum drawdown, position count, and order-rate thresholds remain unspecified and are activation blockers.** Do not interpret the per-trade ceiling as permission to stack unlimited simultaneous 1% risks.

Before every new order or risk-increasing modification, the Risk Engine must evaluate at least:
- Per-trade risk not exceeding 1% of current Equity in USD, calculated to initial Stop Loss including estimated costs.
- Daily loss not exceeding 10% of latest current Equity in USD, measured from the persisted start-of-broker-day Equity snapshot.
- Aggregate open risk and exposure by symbol/direction, subject to a separately approved cap.
- Maximum concurrent positions and pending orders, subject to approved limits.
- Maximum drawdown, subject to an approved limit.
- Spread, slippage, quote freshness, and market/session conditions.
- Stop-loss presence and validity; reject unbounded-risk entries.
- Margin sufficiency and broker volume/price constraints in broker-native units.
- Duplicate/idempotency protection and order-rate limits.
- Strategy/model eligibility, data freshness, and kill-switch state.

Risk-increasing actions must be rejected if any required metric is unavailable, stale, invalid, or outside configured bounds. Risk-reducing actions (cancel pending order, reduce exposure, close position) may use a separate narrowly scoped emergency policy, with audit logging and Demo-account verification.

Automated execution must remain disabled until the complete owner-approved risk configuration is present, validated, versioned, and covered by tests.

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
- Native account currency/denomination, USD conversion rate/source/time, optional THB reporting rate/source/time, and normalization version.
- Idempotency key and broker request/result identifiers.
- Broker-confirmed state, timestamps, latency, and error codes.

Never log passwords, bearer tokens, bridge secrets, or full credential-bearing payloads.

## 8. Required verification before activation

Activation is blocked until all of the following are demonstrated:
1. Owner approval of aggregate open-risk, maximum drawdown, concurrency, and order-rate limits.
2. Unit and integration tests for every allowed action and forbidden action.
3. Positive Exness Demo account-mode verification and negative Live-account rejection.
4. Owner-vs-foreign-tenant isolation tests for every read and write path.
5. Risk boundary tests at, below, and above the 1% per-trade and 10% daily-loss ceilings; missing/stale-data fail-closed tests; and kill-switch tests.
6. Standard, micro, cent, multi-currency, instrument profit-currency, USD normalization, THB reporting, and FX-staleness/rounding tests.
7. Duplicate request/idempotency and retry/reconciliation tests.
8. Broker error, timeout, partial fill, and disconnect recovery tests.
9. Security review of Backend Policy, MCP tool registry, execution adapter, normalization service, and Bridge.
10. End-to-end runtime proof on the dedicated Exness Demo account.
11. Exact-head CI and deployment verification for the reviewed commit.

Until these gates pass, the existing MT5 Bridge and MCP endpoints remain read-only and all execution flags remain false.

## 9. Explicit disabled capabilities

The following remain prohibited:
- Live/real-money trading.
- Deposits, withdrawals, and transfers.
- Arbitrary terminal command execution.
- Any bypass of Backend Policy or Risk Engine.
- AI-generated execution code or unbounded tool arguments.

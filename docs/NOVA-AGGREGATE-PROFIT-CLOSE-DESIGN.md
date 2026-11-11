# NOVA Aggregate Profit Close — Configurable Target Design

Status: design proposal; disabled by default. No broker execution is implemented or authorized by this document.
Baseline main: dad49ccbd6e69a02c6bb5c248657d6e12a421fe3
Feature branch: feat/aggregate-profit-close-100usd-20261111

## User configuration
- Setting: Aggregate Profit Target (USD), editable by an authorized NOVA owner.
- Default: 100.00 USD, preserving the initially requested value.
- Input: positive decimal amount, normalized to two decimal places. Reject zero, negative, NaN, infinity, malformed values, and values outside the configured safety maximum.
- Scope: all NOVA-owned open positions across registered NOVA symbols and strategies; never all account positions.
- Display: current target, current eligible net basket P/L, remaining amount to target, calculation freshness, active basket cycle, and whether the target change is pending.
- Persist every setting version with actor, timestamp, old value, new value, account binding, and reason. Never store credentials in this record.

## Change semantics
- Target changes are allowed only for an authorized owner and while no close cycle is TRIGGERED, CLOSING, or RECONCILING.
- If a basket cycle is already active, stage the new target for the next cycle. Do not mutate the immutable target snapshot of the active cycle.
- Every basket cycle snapshots target amount, currency, scope, account/server, owner/tenant, eligible position identifiers, calculation inputs, and configuration version.
- Changing the target must not itself submit a close request. The monitor evaluates the new target only after the setting is saved and a fresh complete calculation is available.

## Trigger calculation
- Target default is 100.00 USD; configurable amount is the threshold for the cycle.
- Initial implementation requires USD account deposit currency. Non-USD accounts or missing/stale conversion data fail closed.
- Sum current floating profit and swap for each eligible open NOVA position; subtract attributable entry/partial-close commissions and conservative estimated exit costs where reliably available.
- Do not count historical realized P/L from closed positions. If commission attribution, exit cost, ownership, account identity, or quote freshness is incomplete, do not trigger.
- Trigger when complete net basket P/L is greater than or equal to the snapshotted target.
- This is a close-request threshold, not a guarantee of realized profit; slippage, spread, gaps, partial fills, rejection, and fees can reduce realized results.

## Ownership and isolation
- Eligible positions must match authenticated account login/server, Demo environment for initial validation, tenant/owner binding, registered NOVA magic-number namespace, and stable position identifier.
- Exclude manual trades, magic 0, foreign EA positions, other tenants/accounts, unknown ownership, and pending orders.
- Scope=all means all qualifying NOVA positions only; it never means all positions in the broker account.

## State machine and idempotency
- DISABLED (default), MONITORING, TRIGGERED, CLOSING, RECONCILING, COMPLETED, PARTIAL_OR_BLOCKED.
- Persist close intent before submission. Idempotency key includes account binding, basket cycle ID, position identifier, and close-intent version.
- Never blindly retry timeout/unknown outcomes. Reconcile broker state first; retry only if the position remains open and prior execution is proven absent.
- Do not mark COMPLETED until broker reconciliation confirms no captured positions remain. Preserve per-position status and broker reason codes.
- Block new NOVA entries while flattening. Positions opened after the immutable snapshot must not be silently added to the batch.

## Safety invariants
- Feature disabled by default; initial executable validation Demo-only.
- Current read-only MT5 Bridge remains GET/OPTIONS-only and unchanged. No close endpoint may be added to it.
- Any future close operation requires a separately reviewed Demo execution adapter/EA path, explicit typed capability, authenticated owner/tenant/account checks, and server-side safety gates.
- Preserve existing per-trade risk, aggregate exposure, daily loss, drawdown, stop-loss, kill-switch and risk rejection behavior. Profit close cannot override loss controls.
- liveTradingEnabled=false, ordersEnabled=false, executionEnabled=false remain invariant.
- No entries, reverse/hedge, pending-order cancellation, auto-promotion, model training, production deployment, or live-account operation are authorized.

## Required tests
- Default target 100.00 USD; configurable values including decimals; exact boundary; below/above boundary.
- Reject zero, negative, malformed, NaN, infinity, excess precision, and over-maximum input.
- Authorization, audit history, immutable cycle snapshot, and target-change deferral during active close cycle.
- Multi-symbol/multi-strategy NOVA basket; exclude manual/foreign/other-tenant/account positions and pending orders.
- Net P/L includes swap, attributable commissions, conservative exit costs; no double counting or closed-position realized P/L.
- Missing costs, stale quotes, non-USD account, stale conversion, and ambiguous ownership fail closed.
- Idempotency, duplicate events, timeout reconciliation, partial fills, broker rejection, disconnect/reconnect, and completion proof.
- Kill switch/risk rejection precedence; Demo-only enforcement; all live/order/execution flags remain false; read-only Bridge mutation rejection.
- Exact-head CI, native EA compilation, and isolated Exness Demo lifecycle evidence before any Demo activation.

## Repository assessment at baseline
- integrations/mt5-readonly-bridge/bridge.py is a read-only GET/OPTIONS API; preserve it.
- integrations/mt5-readonly-bridge/bridge_relay_client.py allowlists read-only routes; do not widen it.
- workers/execution/README.md describes a disabled worker without a broker adapter.
- integrations/mt5/MTRADERS_All_In_One_v1.01.mq5 has permissive input defaults and placeholder OnTick logic; it is not evidence of a verified safe execution engine.
- Therefore this change is configuration and safety design only. A real close path remains blocked pending a separate Demo adapter and proof.

## Delivery gates
1. Review and approve semantics and configurable target bounds.
2. Implement pure basket calculation, input validation, settings persistence/audit, ownership classifier, and tests.
3. Implement Demo-only close coordinator behind disabled capability boundary; preserve read-only Bridge.
4. Add adapter contract tests for idempotency, partial fills, reconciliation, and risk precedence.
5. Complete native EA compilation and isolated Demo close lifecycle tests.
6. Submit implementation PR for review; do not merge or deploy automatically.
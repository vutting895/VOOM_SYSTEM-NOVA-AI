# NOVA + MTRADERS EA Integration — Phase 1

## Status

This change establishes a fail-closed source baseline and a pure intent-validation contract. It does **not** implement broker order submission and does not certify the 30 strategy modules.

## Repository baseline

- Main was read from `refs/heads/main` immediately before this branch was created.
- Base SHA: `3105ad79990fa6596d1e210e7a645b0b0e12e5fa`.
- Existing read-only MT5 Bridge remains GET-only and is not modified.
- The EA source in the repository previously had trading enabled by default, 5% base risk, 10% single-trade cap, 30% aggregate risk, 30 positions and 35% daily loss. These values conflicted with the current NOVA safety policy and the safe local copy.

## Changes

- Restore safe defaults: trading disabled; 1% per trade; 1% single-trade cap; 9% aggregate open risk; maximum 5 total exposure orders (open positions + pending orders); 10% daily loss; bounded minimum lot disabled.
- Make initialization fail closed if the legacy trade-enable input is manually switched on. This is intentional until the command channel, execution adapter and Demo proof are complete.
- Add a pure Python NOVA intent contract enforcing Exness Demo, USD account, exact account and tenant binding, allowlisted symbols, NOVA Magic Number range, short-lived unique command IDs, quote freshness, SL/TP geometry, 1% per-trade risk, 9% aggregate risk, 10% daily loss and a hard cap of 5 total exposure orders, counting all account-wide open positions plus active pending orders across all symbols.
- Add deterministic unit tests for the contract.

## Non-goals / explicit blockers

- No order-send or position-close API is added.
- No changes to the read-only Bridge or Relay.
- No credentials, account identifiers, or secrets are embedded.
- No Live account support; no production deployment.
- No claim that MQL5 has compiled or that the 30 strategy modules work. Native MetaEditor compilation and Strategy Tester/Exness Demo lifecycle tests are still required.

## Next implementation stage

1. Confirm the actual local `.mq5` and repository source are reconciled; preserve the user's safe local copy.
2. Implement a separate authenticated Demo-only command transport and MQL5 execution adapter.
3. Add broker-side idempotency, ownership-only close, SL/TP validation, and full reconciliation.
4. Compile in MetaEditor on Windows and test on Exness Demo with order execution disabled until all gates pass.

## Maximum order-count safety cap (2026-11-12)

- Hard maximum: **5 total exposure orders per MT5 account**.
- Count = `PositionsTotal + OrdersTotal`; positions and active pending orders are combined.
- Count is account-wide across all symbols and Magic Numbers. Do not allocate independent limits to strategy modules.
- A new order must be rejected when the current combined count is already 5.
- Python intent validation uses the broker/account exposure snapshot and rejects negative or malformed counts.
- MQL5 exposes the same hard constant and account-wide count helper; the EA remains non-executing.

### Concurrency limitation / release blocker

A count-then-submit sequence is not atomic. Multiple EA instances or command workers could all observe four existing orders and each accept a new request. The future execution adapter must implement a shared, account-scoped atomic reservation/lock, reconcile reservations against broker positions and pending orders, and release or expire reservations safely after broker outcomes. The current helper is only a snapshot and is **not** evidence that concurrent execution is protected. No order submission is enabled by this change.

## Account-wide five-order cap and reservation design (2026-11-12)

- Confirmed policy: no more than **5 total items per MT5 account**, across all symbols, all Magic Numbers, and all NOVA strategy modules.
- Exposure = authenticated broker open positions + authenticated broker active pending orders.
- Added a private-schema reservation ledger and service-role-only RPCs. A per-account row lock serializes reservation decisions across concurrent backend workers.
- A new reservation is accepted only when broker exposure + all outstanding reservations is below 5. Broker snapshots older than five seconds are rejected. Unconfirmed reservations have a bounded 30-second lease (configurable 1–60 seconds).
- A successful broker submission is confirmed with its broker ticket and remains reserved until a fresh broker snapshot includes that ticket; a confirmed failed submission can release its reservation.
- The migration is repository-only at this stage. It has **not** been applied to the Supabase production project, and no Supabase branch was created.
- The SQL integration test is authored but has not been executed against a disposable database.
- Runtime bridge wiring is not complete. The Python contract's count check and the MQL5 PositionsTotal()+OrdersTotal() helper are preliminary gates; neither is proof of atomic cross-process reservation. No broker order submission is enabled.

## Read-only exposure snapshot transport (2026-11-12)

- Added tenant-authenticated `GET /api/exposure` to the existing local MT5 Bridge.
- Snapshot includes account login/server, total open-position count, total active pending-order count, and broker ticket IDs for both sets.
- The handler fails closed if either `positions_get()` or `orders_get()` returns unavailable (`None`); an empty tuple is a valid zero count.
- Added the route to the allowlisted outbound WSS relay and its query-free request validator. It remains GET-only and carries no order mutation capability.
- This provides the broker-snapshot input required by the account-capacity reservation service. It does not call Supabase, reserve capacity, or submit broker orders yet.
- Snapshot reads are sequential MT5 API reads under the bridge process lock, not an atomic broker transaction. External/manual account activity can still occur between reads; the reservation service must fail closed on stale snapshots and reconcile against subsequent snapshots.

## Customer proxy exposure path and migration correction (2026-11-12)

- Added `/api/exposure` to the authenticated customer MT5 proxy allowlist; the proxy still verifies the Supabase user session and owner-scopes `broker_connections` before forwarding to the tenant-specific relay.
- Added a proxy test asserting the account-wide exposure request reaches only the authenticated user's dedicated relay route, with the broker bridge token and tenant header; the connection_id is not forwarded to the relay.
- Exposure `as_of` now records the time immediately before the first MT5 read (conservative freshness bound); `snapshot_completed_at` records the end of the sequential positions/orders reads.
- Corrected the release RPC's PL/pgSQL dollar quoting and added static migration safety tests. SQL integration test comments now correctly state that it is sequential, not a parallel-session test.
- Static checks are not a PostgreSQL execution proof. The SQL integration script and multi-session concurrency test remain unexecuted.
- Supabase project `Voom_system` was inspected read-only and is ACTIVE_HEALTHY. Its applied migration list does not include `202611120001_nova_account_order_capacity_reservations`; no production migration was applied.
- The reservation RPC is still not invoked by any deployed backend. The customer proxy only returns broker exposure; it does not reserve capacity or authorize an order.

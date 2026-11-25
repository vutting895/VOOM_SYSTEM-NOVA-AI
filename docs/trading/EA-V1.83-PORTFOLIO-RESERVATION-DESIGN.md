# NOVA EA v1.83 — Portfolio Reservation and Multi-Instance Safety Design

Status: DESIGN / NOT IMPLEMENTED. This document records the required control before any Demo order execution. It does not certify runtime safety.

## 1. Verified source condition

The current research candidate builds `gRoot` from account login, `InpMagicBase`, and a hash of the chart symbol. `OnInit()` then opens `gRoot + "_instance.lock"` without `FILE_COMMON` and retains the handle until `OnDeinit()`. This is a per-symbol instance lock, not an account-wide portfolio coordinator.

The candidate's `OpenRiskMoney()` includes broker-visible managed positions and pending orders across symbols, but its in-flight reservations are read from the current instance's `gState[]`. Two chart instances can therefore both read the same broker exposure, both see available headroom, and both reserve risk locally before either order becomes visible.

## 2. Safety requirement

For a managed account scope, every new entry must be serialized through one authoritative reservation decision. The decision must atomically consider:

- Broker-visible managed positions across all symbols.
- Broker-visible managed pending entry orders across all symbols.
- All unexpired in-flight reservations from every participating EA instance.
- The account equity snapshot and the configured single-trade / aggregate risk caps.
- The maximum total and strategy-specific exposure counts.

A local read followed by a separate write is not sufficient. The check-and-reserve operation must be atomic.

## 3. Recommended deployment boundary

### Phase A — conservative single-host guard

Until a distributed coordinator exists, restrict the EA to one authorized MT5 terminal host per broker account + NOVA magic scope. On that host, use a shared `FILE_COMMON` account-scope lock/ledger so separate MT5 terminal instances on the same Windows machine cannot independently claim the same scope. A second EA instance must fail closed before it can enter any entry path.

This is an operational restriction, not a distributed lock. MQL5 terminal Global Variables are terminal-local; `FILE_COMMON` is shared only by terminals on the same machine. Neither mechanism coordinates two different computers/VPSs.

### Phase B — multi-host account coordination

If the same broker account may be used from multiple computers/VPSs, require a central coordinator (for example, an authenticated NOVA service with a strongly serialized per-account transaction). The coordinator must atomically issue a reservation token, enforce account/magic scope, record lease expiry, and reconcile uncertain broker outcomes. If it is unavailable, stale, unauthenticated, or returns an ambiguous result, the EA must not submit a new entry.

Do not claim multi-host safety from a local file lock, terminal Global Variable, heartbeat, or best-effort polling.

## 4. Reservation lifecycle

1. Read a fresh broker snapshot and verify account identity, account currency, equity, positions, pending orders, and symbol contract metadata.
2. Acquire the account-scope coordinator lock with a bounded wait. Lock acquisition failure means WAIT / no entry.
3. Under the lock, reload the ledger, expire only leases whose expiry and reconciliation policy permit removal, and reconcile reservations against broker-visible orders/deals/positions.
4. Recompute aggregate risk and counts using `OrderCalcProfit()` for each symbol and each proposed entry. Unknown SL, invalid volume, invalid contract data, currency conversion failure, or failed profit calculation is an infinite-risk / fail-closed condition.
5. Atomically create a unique reservation ID with owner instance ID, account scope, symbol, magic, strategy, volume, entry, SL, risk in account currency, created-at, lease expiry, and state.
6. Release the short-lived ledger mutex. Submit only while holding a valid reservation token.
7. On confirmed rejection, atomically release the reservation. On confirmed acceptance, reconcile it to the broker order/deal/position before releasing the reserved risk.
8. On timeout, connection loss, or unknown retcode, keep the reservation in an UNCERTAIN state. Do not release merely because the local call returned. Reconcile against broker history and open orders; if uncertainty persists, block new entries in that scope.
9. On process restart, recover the ledger and reconcile before allowing any entry. Never clear all reservations just because the EA restarted.

## 5. Lease and crash semantics

- The lease must be longer than the maximum expected request/reconciliation interval and renewed only by the reservation owner.
- Lease expiry alone is not proof that an order was not accepted. An expired UNCERTAIN reservation must first pass broker-history reconciliation.
- A crashed owner must not leave a permanent mutex. Use an OS-released short-lived lock for ledger mutation, separate from the durable reservation record.
- Use monotonically unique reservation IDs; do not use timestamp-only IDs.
- All ledger writes must be atomic or recoverable using a versioned journal / dual-slot commit protocol with checksum and generation.
- A corrupt, truncated, or incompatible ledger must block entries; do not silently reset it.

## 6. Mandatory test matrix

| Test | Setup | Required result |
|---|---|---|
| Same-terminal race | Two chart instances request the final risk slot simultaneously | Exactly one reservation succeeds |
| Different terminal, same host | Two MT5 terminals share the same account scope | Exactly one reservation succeeds |
| Different host | Two computers attempt same account scope without central coordinator | Both are operationally blocked by deployment policy; local locks are not accepted as proof |
| Coordinator unavailable | Timeout / 5xx / auth failure | No broker entry request |
| Crash after reserve, before send | Kill EA after durable reservation | Reservation remains until safe expiry/reconciliation |
| Crash after send, before response | Simulate uncertain acceptance | Reservation remains UNCERTAIN; new entries blocked until reconciled |
| Accepted pending order | Broker confirms pending order | Reservation reconciles to pending exposure exactly once |
| Filled order | Broker fills while reconciliation runs | No double count and no exposure gap |
| Rejected order | Broker returns confirmed rejection | Reservation released exactly once |
| Missing SL / invalid contract | Position or order risk cannot be computed | Aggregate risk treated as infinite; entry blocked |
| Cent account | Account currency USC/cent and XAUUSDm contract | Risk and caps use account-currency amounts correctly; no USD/USC unit mix |
| Hedging and netting | Run both account modes | Supported mode is explicit; unsupported mode fails initialization |
| Ledger corruption | Truncated record / invalid checksum / schema version | Fail closed; no auto-reset |
| Restart and lease expiry | Restart around expiry boundary | Broker reconciliation precedes release |

## 7. Required implementation gates

- [ ] Choose and enforce single-host restriction or implement central multi-host coordinator.
- [ ] Implement atomic account-scope reservation and durable ledger.
- [ ] Integrate reservation acquisition/release into Core, Sniper, Recovery, and every other entry path.
- [ ] Reconcile pending orders, partial fills, timeouts, connection loss, and restart recovery.
- [ ] Add deterministic concurrency tests and MT5 multi-instance runtime tests.
- [ ] Add account-currency / USC contract fixtures and broker-specific XAUUSDm checks.
- [ ] Prove zero trade requests while `NOVA_PHASE2_EXECUTION_DISABLED=true`.
- [ ] Recompile exact candidate and rerun all tests on the exact PR head.

## 8. Explicit non-claims

This design is not implemented by PR #417. No concurrency, crash-recovery, multi-host, or Demo execution safety is claimed. The candidate remains research-only, compile-time execution-disabled, and not approved for chart installation or trading.

# EA v1.83 — Shared Portfolio Coordinator Implementation

Status: implementation committed to the research branch; runtime and release gates remain open.

## Implemented

- Added NOVA_PortfolioCoordinator.mqh using FILE_COMMON and an exclusive lock file keyed by account login, broker-server hash, and InpMagicBase. This coordinates charts and terminal instances on the same Windows host only.
- Added an append-only binary ledger with signature, schema version, request sequence, request ID, account scope, magic, symbol hash, order ticket, risk amount, creation time, broker-day marker, and checksum.
- Added reservation states: PREPARED, DISPATCHING, ACCEPTED, UNCERTAIN, RELEASED, and RECONCILED.
- Core, Sniper MTF, and Recovery entry paths reserve under the shared lock, persist DISPATCHING before broker transport, then finalize accepted/rejected/uncertain outcomes.
- Account exposure is recalculated while the lock is held and combines managed open positions, pending entry orders, and active ledger reservations. Per-instance gState inflight risk is no longer added a second time.
- Reconciliation checks active order tickets, tagged comments, and order-to-deal-to-position identifiers. Unresolved dispatches remain risk-consuming; they are not expired merely because a lease elapsed.
- Added NOVA_BrokerAdapter.mqh. All eight candidate OrderSend call sites and the CTrade.PositionModify call site route through this adapter.
- The adapter records attempted, blocked, and transport-call counters. Its runtime self-test expects two blocked test calls and zero transport calls with the compile-time hard-disable enabled.

## Recovery semantics

1. PREPARED is a write-ahead reservation before dispatch. It remains active for 30 seconds; only stale PREPARED records are released because protocol order guarantees no broker request was sent yet.
2. DISPATCHING is persisted before calling the broker API. After a crash it becomes UNCERTAIN and remains risk-consuming until broker history/active exposure proves the outcome.
3. ACCEPTED is reconciled into broker-visible exposure by order ticket, tagged comment, or deal-to-position mapping.
4. Rejected/cancelled/expired outcomes are released. A filled order with no remaining open position is released only after history reconciliation.
5. A malformed, truncated, oversized, or checksum-invalid ledger fails closed. The implementation does not silently reset or overwrite a corrupt ledger.

## Validation evidence

- Windows Node source/fixture suite: 23 passed, 0 failed. This includes a deterministic 64-instance reference-model concurrency test and source-wiring assertions; it is not a substitute for MT5 runtime concurrency.
- Candidate MetaEditor X64 Regular compile: 0 errors, 2 deprecated POSITION_COMMISSION warnings, 10,435 ms.
- Candidate source SHA-256: BA7BCE4997CC6501A72A8944D6AFA502DBCA239D000F453E66642403A7B81E4D.
- Candidate EX5 SHA-256: AF539345C41C248B9B21DB13DE67D5755E2540C5CE142B3E01E04056EA07F800.
- Broker adapter runtime self-test script compile: 0 errors, 0 warnings.
- Portfolio coordinator harness compile: 0 errors, 0 warnings.
- Both MQL5 test scripts were loaded through a portable terminal startup configuration, but no OnStart PASS output was captured. Therefore neither MQL5 runtime test is marked passed.

## Known limitations / release blockers

- FILE_COMMON is a same-host shared-folder mechanism, not a distributed coordinator. Multi-host coordination is not implemented.
- Actual simultaneous multi-terminal execution, process-kill crash/restart, and real chart contention have not yet been evidenced.
- The MQL5 harness source covers exclusive lock failure, persistence/restart state, rollover retention, and corrupt-ledger fail-closed behavior, but its runtime has not been captured.
- USC/XAUUSDm contract values are not verified against the connected Exness account. The USC test remains a mathematical fixture only.
- Dynamic broker-adapter counters are implemented, but a completed runtime log proving zero transport calls has not been captured.
- CircleCI config has been added to this branch to address the prior missing-config condition. Provider activation, runner assignment, and exact-head job logs remain unverified.
- Real Tick, sealed OOS, walk-forward, Monte Carlo, and Demo Forward are not started. They remain blocked until runtime safety and broker-contract gates pass.

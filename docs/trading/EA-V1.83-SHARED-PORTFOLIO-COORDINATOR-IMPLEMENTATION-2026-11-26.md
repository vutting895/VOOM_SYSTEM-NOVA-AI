# EA v1.83 — Shared Portfolio Coordinator Implementation

Status: implemented in the research branch; compiled and source-tested. Runtime safety and broker validation gates remain open.

## Implemented

- `NOVA_PortfolioCoordinator.mqh` uses `FILE_COMMON` and an exclusive lock keyed by account login, broker-server hash, and `InpMagicBase`. This supports cooperating charts/terminal instances on the same Windows host, not multi-host coordination.
- **Scope constraint:** all participating charts/terminals must use the same `InpMagicBase`. Different bases create separate ledger files and do not share a single risk budget. The current implementation does not aggregate arbitrary unrelated EAs or external magic ranges.
- Binary ledger records carry signature, schema version, sequence/request ID, account scope, magic, symbol hash, order ticket, risk amount, creation time, broker-day marker, and checksum.
- State machine: PREPARED → DISPATCHING → ACCEPTED / UNCERTAIN → RECONCILED / RELEASED.
- Core, Sniper MTF, and Recovery entry paths use the same reserve → persist DISPATCHING → broker adapter → finalize boundary.
- Exposure is recalculated while the shared lock is held and combines managed open positions, pending entry orders, and active ledger reservations. Per-instance `gState[].inflight_risk_money` is not double-counted.
- Reconciliation checks active order tickets, tagged comments, and order-to-deal-to-position identifiers. Unresolved DISPATCHING/UNCERTAIN requests remain risk-consuming.
- All eight candidate `OrderSend` call sites and the `CTrade.PositionModify` call site route through `NOVA_BrokerAdapter.mqh`.
- Adapter counters track mutation attempts, blocked calls, and transport calls. The self-test expects two blocked calls and zero transport calls with the compile-time hard-disable enabled.
- Ledger compaction now runs under the exclusive lock at 512 records. It writes a temporary snapshot containing the latest active record per request and a high-sequence watermark, then replaces the ledger. This prevents normal append growth from reaching the 16,384-record load limit.

## Recovery semantics

1. PREPARED is a write-ahead reservation before dispatch. It remains active for 30 seconds; only stale PREPARED records are released because protocol order guarantees no broker request was sent yet.
2. DISPATCHING is persisted before calling the broker API. After a crash it becomes UNCERTAIN and remains risk-consuming until broker history/active exposure proves the outcome.
3. ACCEPTED is reconciled into broker-visible exposure by order ticket, tagged comment, or deal-to-position mapping.
4. Rejected/cancelled/expired outcomes are released. A filled order with no remaining open position is released only after history reconciliation.
5. Malformed, truncated, oversized, or checksum-invalid ledgers fail closed. The implementation does not silently reset or overwrite a corrupt ledger.

**Compaction caveat:** temporary-snapshot replacement is compiled and source-tested, but process termination at each file-operation boundary has not been injected. Atomicity/durability of the replacement sequence is therefore not yet proven. Do not treat compaction crash recovery as passed until a process-kill fault-injection run verifies old-ledger recovery or a fail-closed result at every boundary.

## Validation evidence — 2026-11-26

- Windows Node suite: **24 passed, 0 failed**, 328.0457 ms. Includes 64-instance JavaScript reference-model concurrency, source wiring, hard-disable wrapper, and compaction source assertions. The concurrency model is not a live MQL5 lock test.
- Candidate exact-source MetaEditor X64 Regular compile: **0 errors, 2 pre-existing deprecated `POSITION_COMMISSION` warnings**, 12,640 ms.
- Candidate source SHA-256: `2A39EE9CDB2587AE5CF2810207F77EFA39EFDA8F076153B22F5EA5B2159AE604`.
- Candidate EX5 SHA-256: `AF01ABCC5DFE50A9A30AFA53BEC19EB32058C416637D46F5933578070926DD82`.
- Broker adapter self-test script compile: **0 errors, 0 warnings**.
- Portfolio coordinator harness compile: **0 errors, 0 warnings**.
- Compile logs: `C:\\MT5\\logs\\NOVA-v183-candidate-compaction.log`, `NOVA-broker-selftest-compaction.log`, and `NOVA-portfolio-harness-compaction.log`.
- MQL5 test `OnStart` receipts have **not** been captured. No runtime PASS is claimed.

## Known limitations / release blockers

- Actual simultaneous multi-chart and multi-terminal execution, process-kill restart, rollover, lock failure and corrupt-ledger runtime fault injection are not yet evidenced.
- Dynamic broker-adapter counters are implemented, but the runtime log proving `attempts > 0`, `blocked = attempts`, and `transport = 0` has not been captured.
- USC/XAUUSDm contract values are not verified against the connected Exness account. USC tests remain mathematical fixtures.
- CircleCI provider activation, pipeline 2123 logs, runner assignment and exact-head execution remain unverified. No CircleCI root cause is asserted.
- Real Tick, sealed OOS, walk-forward, Monte Carlo and Demo Forward have not started. They remain blocked until runtime safety and broker-contract gates pass.
- Keep PR #417 Draft and keep `NOVA_PHASE2_EXECUTION_DISABLED=true`.

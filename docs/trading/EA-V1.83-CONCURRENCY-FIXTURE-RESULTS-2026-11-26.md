# NOVA EA v1.83 — Concurrency and Broker Risk Fixture Results

Date: 2026-11-26
Scope: research candidate `Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`.
Status: **24 Node tests PASS; MQL compile PASS; terminal runtime tests NOT VERIFIED.**

## Exact candidate identity

- Source SHA-256: `2A39EE9CDB2587AE5CF2810207F77EFA39EFDA8F076153B22F5EA5B2159AE604`.
- EX5 SHA-256: `AF01ABCC5DFE50A9A30AFA53BEC19EB32058C416637D46F5933578070926DD82`.
- Compile-time gate: `NOVA_PHASE2_EXECUTION_DISABLED=true`.

## Node test execution

Command:
```powershell
node --test tests\\nova-ea-v183-source-integrity.test.mjs tests\\nova-ea-v183-concurrency-runtime-fixtures.test.mjs
```

Result: **24 passed, 0 failed**, 328.0457 ms.

Coverage:
1. 64 concurrent chart-instance requests competing for the final portfolio risk slot: exactly one reservation succeeds in a deterministic JavaScript reference model.
2. Missing SL / invalid risk cannot reserve.
3. UNCERTAIN request remains risk-consuming after lease expiry until reconciliation.
4. Accepted pending exposure is reconciled idempotently in the reference model.
5. Cross-symbol positions and pending orders share one modeled account risk cap.
6. USC amounts remain in account currency in a mathematical fixture; this is not broker verification.
7. Candidate explicitly rejects NETTING and requires HEDGING.
8. Missing SL / failed OrderCalcProfit paths fail closed in candidate source.
9. Compile-time hard-disable and mutation guards are source-checked.
10. All eight candidate OrderSend call sites and one CTrade PositionModify call site route through the adapter.
11. Core, Sniper MTF and Recovery use the same durable reservation boundary.
12. FILE_COMMON lock, checksummed ledger, DISPATCHING/UNCERTAIN states and corruption fail-closed logic are source-checked.
13. Ledger compaction retains latest active reservations and a monotonic sequence watermark (source assertions only).
14. Broker adapter self-test counters and zero-transport condition are source-checked.
15. Pending cancellation and partial-close wrappers are independently source-checked.
16. Archived source SHA-256, byte identity, read-only mode, hard-disable, daily Entry Lock Only, portfolio caps, SMC closed-bar logic and cross-symbol risk tests pass.

## MQL5 compile evidence

- Candidate: **0 errors, 2 deprecated POSITION_COMMISSION warnings**, 12,640 ms.
- Broker adapter self-test script: **0 errors, 0 warnings**.
- Portfolio coordinator harness: **0 errors, 0 warnings**.
- Logs are under `C:\\MT5\\logs\\` with names `NOVA-v183-candidate-compaction.log`, `NOVA-broker-selftest-compaction.log`, and `NOVA-portfolio-harness-compaction.log`.

## Critical interpretation

The 64-instance concurrency test is a deterministic JavaScript reference model. It does not prove MQL5 cross-chart or cross-terminal atomicity. The Node source assertions do not execute the broker adapter or ledger implementation.

The MQL5 test programs compile, but their `OnStart` PASS receipts were not captured. Therefore:
- Dynamic broker interception proving `attempts > 0`, `blocked = attempts`, `transport = 0`: **NOT VERIFIED**.
- Real multi-chart and multi-terminal lock contention: **NOT VERIFIED**.
- Process-kill restart, rollover, lock failure, and corrupt-ledger runtime fault injection: **NOT VERIFIED**.
- Ledger compaction crash-boundary durability: **NOT VERIFIED**.

## Broker and strategy gates not run

- Live Exness USC / XAUUSDm broker contract metadata verification.
- Real Tick Strategy Tester.
- Sealed OOS from the frozen date.
- Walk-forward, Monte Carlo, and Demo Forward.

No profitability, runtime-safety, broker-compatibility, or execution-readiness claim is made. Keep PR #417 Draft and execution hard-disabled.

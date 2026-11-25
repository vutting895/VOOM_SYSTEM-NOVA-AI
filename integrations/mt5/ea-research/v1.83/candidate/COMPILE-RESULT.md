# Phase 2 Candidate — Compile Evidence

- Source: `Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`
- Source SHA-256 (isolated Windows staging): `AD54D093FBBC94957E11E8A78699CFFD6FFAF2D70EE072DBDC42E176FAFD042F`
- Generated local EX5 SHA-256: `E9DFB6B3D007F2FDAB39D8FCA4B56973FF24D3AC9B0FD941ED86F0F4DE2F761F`
- EX5 size: 415,188 bytes
- Compiler: `C:\MT5\metaeditor64.exe`
- Target: X64 Regular
- Result: **0 errors, 3 warnings**
- Duration reported: 9,908 ms

Warnings:
1. Line 3393: `POSITION_COMMISSION` is deprecated.
2. Line 3577: `POSITION_COMMISSION` is deprecated.
3. Line 7770: possible loss of data converting `long` to `double`.

## Fail-closed execution gate

- Compile-time constant `NOVA_PHASE2_EXECUTION_DISABLED=true`.
- 9 broker-mutating API calls detected: 8 `OrderSend()` calls and 1 `CTrade.PositionModify()` call.
- Early disable guards verified in the permission gate and all 9 functions containing the identified mutating calls.
- EX5 was generated only in the isolated research workspace; it has not been installed or attached to an MT5 chart.

## NOVA risk-policy candidate changes

- Daily loss threshold: 10% of broker-day starting equity.
- Daily action: sets the daily entry lock; it does not set the flatten request.
- Core and Sniper entry paths reject entries while daily-locked.
- Recovery entry path rejects new exposure while daily-locked.
- Aggregate open-risk cap: 9% across all account symbols for positions and pending orders belonging to NOVA core magic range and separate Sniper magic.
- Pending orders without a valid bounded SL, or whose risk cannot be calculated, fail closed and block new exposure.
- Concurrent exposure cap: 5, counting NOVA positions, pending orders and local in-flight reservations.
- Core, Sniper and Recovery category counts include their own positions and pending orders across symbols.
- Recovery money/percentage Trigger, Target and Hard Stop use the lower threshold (first-hit semantics).

## Test evidence

- `tests/nova-ea-v183-source-integrity.test.mjs`: **9 passed, 0 failed**.
- Tests cover five immutable source hashes, byte-identical WORKING/REPAIRED files, SAFE_READONLY gate, unsafe WORKING defaults, candidate hard-disable guards, Entry Lock Only, portfolio-wide positions/pending orders, Sniper/Recovery caps, and Recovery first-hit threshold semantics.

## Limitations

Compile and static tests are not runtime proof that zero broker requests are emitted. No MT5 Strategy Tester request-interception, Demo forward, broker fault-injection, restart/day-rollover integration test, or OOS performance test has been run. The candidate remains compile-time disabled and is not production-approved.

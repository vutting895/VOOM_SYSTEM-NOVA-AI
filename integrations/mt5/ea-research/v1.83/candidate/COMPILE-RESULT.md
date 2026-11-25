# Phase 2 Candidate — Compile Evidence

- Source: `Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`
- Source SHA-256: `E29FC5008B5AE128710CB14C6A5853D9AD00AF3562DDDC62276A5A51BB6784F8`
- Generated local EX5 SHA-256: `E28E6D3580BB6161D238BE951CE543CAEEDBF2F3918DAC7649ECF60417E66615`
- Compiler: `C:\MT5\metaeditor64.exe`
- Target: X64 Regular
- Result: **0 errors, 3 warnings**
- Duration reported: 9,600 ms

Warnings:
1. Line 3363: `POSITION_COMMISSION` is deprecated.
2. Line 3547: `POSITION_COMMISSION` is deprecated.
3. Line 7708: possible loss of data converting `long` to `double`.

## Fail-closed execution gate

- Compile-time constant `NOVA_PHASE2_EXECUTION_DISABLED=true`.
- 9 broker-mutating API calls detected: 8 `OrderSend()` calls and 1 `PositionModify()` call.
- Early disable guards verified in the permission gate and all 9 functions containing the identified mutating calls.
- No EX5 has been installed or attached to an MT5 chart.

## NOVA risk-policy candidate changes

- Daily loss threshold: 10% of broker-day starting equity.
- Daily action: sets the daily entry lock; it does not set the flatten request.
- Main loop cancels pending orders while daily-locked, but calls `CloseAllOwn()` only when an independent flatten request exists.
- Core and Sniper entry paths reject entries while daily-locked.
- Recovery entry path rejects new exposure while daily-locked.
- Aggregate open risk cap: 9%.
- Concurrent position cap: 5.
- Sniper's separate magic number is included in aggregate open-risk and total-position counting.
- Recovery and Sniper entry paths now check the shared aggregate risk and position caps.

## Test evidence

- `tests/nova-ea-v183-source-integrity.test.mjs`: **7 passed, 0 failed**.
- Tests cover five immutable source hashes, byte-identical WORKING/REPAIRED files, SAFE_READONLY gate, unsafe WORKING defaults, candidate hard-disable guards, risk policy defaults/entry-lock behavior, and inclusion of Sniper/Recovery in portfolio limits.

## Limitations

Compile and static tests are not runtime proof that zero broker requests are emitted. No MT5 Strategy Tester, Demo forward, broker fault-injection, restart/day-rollover integration test, or OOS performance test has been run. The candidate remains compile-time disabled and is not production-approved.

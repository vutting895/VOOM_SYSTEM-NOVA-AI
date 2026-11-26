# Phase 2 Candidate — Compile Evidence

- Source: `Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`
- Source SHA-256 (isolated Windows staging): `117922854A349331074549A0015178E061820B512AD6778F50621E2742DDA283`
- Generated local EX5 SHA-256: `CA0693620C4182383C1E731691D456A699A3E4D330C1B635AADF9BCE7D417161`
- EX5 size: 418,412 bytes
- Compiler: `C:\MT5\metaeditor64.exe`
- Target: X64 Regular
- Result: **0 errors, 3 warnings**
- Duration reported: 10,721 ms

Warnings:
1. Two deprecated `POSITION_COMMISSION` references.
2. One possible loss of data converting `long` to `double`.

## Fail-closed execution gate

- Compile-time constant `NOVA_PHASE2_EXECUTION_DISABLED=true`.
- 9 broker-mutating API calls detected: 8 `OrderSend()` calls and 1 `CTrade.PositionModify()` call.
- Early disable guards verified in the permission gate and all 9 functions containing the identified mutating calls.
- EX5 generated only in the isolated research workspace; not installed or attached to an MT5 chart.

## NOVA risk-policy candidate changes

- Daily loss threshold: 10% of broker-day starting equity; action is Entry Lock Only, no automatic flatten.
- A shared broker-day baseline file is keyed by account login, broker server, NOVA magic scope and broker day, so instances on different symbols use one baseline.
- If no trusted baseline exists and the first attach is later than 60 seconds after broker-day start, new entries remain locked until the next broker day.
- Shared baseline file locking retries for up to one second; inability to read/lock or an invalid record fails closed.
- Aggregate open-risk cap: 9% across all account symbols for NOVA core and separate Sniper magic.
- Pending NOVA orders are included in risk and total exposure counts. Missing SL or uncomputable risk blocks new exposure.
- Concurrent NOVA exposure cap: 5, counting positions, pending orders and local in-flight reservations.
- Core, Sniper and Recovery category counts include positions and pending orders across symbols.
- Recovery money/percentage Trigger, Target, Hard Stop and worst-case hard cap use the lower threshold (first-hit semantics).

## Test evidence

- `tests/nova-ea-v183-source-integrity.test.mjs`: **10 passed, 0 failed**.
- Tests cover archived source hashes, variant identity, read-only gate, unsafe WORKING defaults, hard-disable guards, Entry Lock Only, account-wide positions/pending orders, Sniper/Recovery caps, Recovery first-hit semantics, and shared broker-day baseline fail-closed logic.

## Limitations

Compile and static tests are not runtime proof that zero broker requests are emitted. No MT5 Strategy Tester request-interception, Demo forward, broker fault-injection, restart/day-rollover integration test, or OOS performance test has been run. The candidate remains compile-time disabled and is not production-approved.


## Request Audit update — 2026-11-26

- Candidate MQ5 SHA-256: 73D0F395F2F4A81C3543306587BDACDDE48628DBCD2191B00862FFE32214445B.
- Request Audit wrappers added: all 8 former OrderSend call sites route through NovaAuditOrderSend; the sole raw OrderSend call is inside that adapter.
- CTrade.PositionModify routes through NovaAuditPositionModify; the sole raw PositionModify call is inside that adapter.
- Ten hard-disable guards emit structured NOVA_REQUEST_AUDIT BLOCKED events; OnDeinit prints per-instance counters.
- Recompile with MetaEditor X64 Regular: 0 errors, 3 warnings. The two deprecated POSITION_COMMISSION warnings and one long-to-double conversion warning remain.
- Combined Node suite: 23 passed, 0 failed. Host-side concurrency/failure fixtures are not MT5 runtime proof.
- See evidence/runtime-gate-20261126/ for compiler log, test output, request-audit contract, runtime report and SHA-256 manifest.

**Runtime acceptance remains BLOCKED:** Candidate has not been loaded in an isolated MT5 terminal/Strategy Tester. No actual terminal Request Audit log exists. FILE_COMMON concurrency, real terminal restart/rollover, broker fault injection, USC broker account and Demo read-only integration remain untested.

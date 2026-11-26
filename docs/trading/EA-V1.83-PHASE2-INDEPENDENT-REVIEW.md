# NOVA EA v1.83 — Independent Phase 2 Review

**Date:** 2026-11-25  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Main baseline:** `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Review branch:** `audit/ea-v183-phase1-2-20261125`

## Reproduced evidence

- Candidate compiled in isolated Windows research workspace, outside the MT5 Experts installation directory.
- Candidate source SHA-256: `117922854A349331074549A0015178E061820B512AD6778F50621E2742DDA283`.
- Generated EX5 SHA-256: `CA0693620C4182383C1E731691D456A699A3E4D330C1B635AADF9BCE7D417161`, size 418,412 bytes.
- MetaEditor `C:\MT5\metaeditor64.exe`, target X64 Regular: **0 errors, 3 warnings**, 10,721 ms.
- Warnings: two deprecated `POSITION_COMMISSION` references; one possible `long` to `double` conversion.
- Expanded source-integrity suite: **10 passed, 0 failed**.
- Static scan: 8 `OrderSend()` call sites and one `CTrade.PositionModify()` call. The compile-time execution disable constant and early guards remain present at all identified mutating paths.

## Repairs completed on this branch

1. `OpenRiskMoney()` aggregates NOVA core and Sniper positions account-wide across symbols.
2. Pending NOVA orders are included in aggregate exposure count and risk calculation. Missing SL or uncomputable risk returns a fail-closed sentinel.
3. Global and category position caps count pending orders and aggregate across symbols.
4. Recovery Trigger, Target, Hard Stop and worst-case hard cap use `MathMin()`, matching comments that specify "whichever threshold is reached first".
5. Daily equity baseline is shared across chart symbols through a `FILE_COMMON` record keyed by account login, broker server, NOVA magic scope and broker day.
6. A late first attach (more than 60 seconds after broker-day start) without an existing trusted baseline locks new entries until the next broker day. File lock failures and malformed records fail closed.
7. Static tests cover the above policy and fail-closed source contracts.

## Remaining blocking evidence

1. **Runtime fail-closed proof is missing.** Compile-time guards and static tests do not prove zero broker requests during MT5 runtime. No Strategy Tester request-interception, Demo read-only integration test or broker fault-injection has been evidenced.
2. **Shared-file concurrency is unverified at runtime.** The code retries an exclusive common-file open and fails closed, but actual simultaneous multi-instance behavior has not been exercised.
3. **Persistence/rollover tests are missing.** Daily lock persistence across terminal restart and broker-day rollover baseline reset have not been exercised.
4. **Recovery execution reconciliation is unverified.** Partial close, hedge, averaging, slippage, stop-out and partial execution need deterministic Strategy Tester fixtures.
5. **Performance is unproven.** No valid OOS, walk-forward or Demo-forward evidence is included. Compile success is not strategy validation.
6. **Three compiler warnings remain.** They do not block code generation, but should be triaged before production release.

## Safety state

- `NOVA_PHASE2_EXECUTION_DISABLED=true` remains compiled into the candidate.
- Source and EX5 remain in an isolated research workspace, not the installed Experts directory.
- No EA was attached to a chart.
- No Demo or Live orders were submitted.
- Main was not modified.

## Exit decision

**Phase 1:** source archive, provenance hashes and integrity tests are in place; exact mapping of every historical EX5 binary to its originating source remains incomplete.  
**Phase 2:** **CODE REPAIRS + COMPILE + STATIC TESTS COMPLETE; RUNTIME ACCEPTANCE BLOCKED.**

Do not enable execution or merge as production-ready until runtime request interception, common-file concurrency, restart/rollover, fault-injection and strategy validation evidence is attached.

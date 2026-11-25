# NOVA EA v1.83 — Independent Phase 2 Review

**Date:** 2026-11-25  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Main baseline:** `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Review branch:** `audit/ea-v183-phase1-2-20261125`

## Reproduced evidence

- Candidate compiled in isolated Windows research workspace, outside the MT5 Experts installation directory.
- Candidate source SHA-256: `AD54D093FBBC94957E11E8A78699CFFD6FFAF2D70EE072DBDC42E176FAFD042F`.
- Generated EX5 SHA-256: `E9DFB6B3D007F2FDAB39D8FCA4B56973FF24D3AC9B0FD941ED86F0F4DE2F761F`, size 415,188 bytes.
- MetaEditor `C:\MT5\metaeditor64.exe`, target X64 Regular: **0 errors, 3 warnings**, 9,908 ms.
- Warnings: two deprecated `POSITION_COMMISSION` references; one possible `long` to `double` conversion.
- Expanded source-integrity suite: **9 passed, 0 failed**.
- Static scan: 8 `OrderSend()` call sites and one `CTrade.PositionModify()` call. The compile-time execution disable constant and early guards remain present at all identified mutating paths.

## Repairs completed on this branch

1. `OpenRiskMoney()` now aggregates NOVA core and Sniper positions account-wide across symbols.
2. Pending NOVA orders are included in the aggregate exposure count and their downside risk is calculated from order symbol, volume, entry and SL. Missing SL or uncomputable risk returns a fail-closed sentinel.
3. Global and category position caps now include pending orders and aggregate across symbols.
4. Recovery Trigger, Target, Hard Stop and worst-case hard cap now use `MathMin()`, matching the source comments' "whichever threshold is reached first" semantics.
5. Static tests cover the account-wide aggregation, pending-order inclusion, fail-closed cases and Recovery threshold semantics.

## Remaining blocking evidence

1. **Runtime fail-closed proof is missing.** Compile-time guards and static tests do not prove zero broker requests during MT5 runtime. No Strategy Tester request-interception, Demo read-only integration test or broker fault-injection has been evidenced.
2. **Persistence/rollover tests are missing.** Daily lock persistence across terminal restart and broker-day rollover baseline reset have not been exercised.
3. **Recovery execution reconciliation is unverified.** Partial close, hedge, averaging, slippage, stop-out and partial execution need deterministic Strategy Tester fixtures.
4. **Performance is unproven.** No valid OOS, walk-forward or Demo-forward evidence is included. Compile success is not strategy validation.
5. **Three compiler warnings remain.** They do not block code generation, but should be triaged before a production release.

## Safety state

- `NOVA_PHASE2_EXECUTION_DISABLED=true` remains compiled into the candidate.
- Source and EX5 remain in an isolated research workspace, not the installed Experts directory.
- No EA was attached to a chart.
- No Demo or Live orders were submitted.
- Main was not modified.

## Exit decision

**Phase 1:** source archive, provenance hashes and integrity tests are in place; exact mapping of every historical EX5 binary to its originating source remains incomplete.  
**Phase 2:** **CODE REPAIRS + COMPILE + STATIC TESTS COMPLETE; RUNTIME ACCEPTANCE BLOCKED.**

Do not enable execution or merge as production-ready until the remaining runtime, persistence, fault-injection and strategy validation evidence is attached.

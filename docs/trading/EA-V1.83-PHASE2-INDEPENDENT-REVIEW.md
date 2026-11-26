# NOVA EA v1.83 — Independent Phase 2 Review

**Date:** 2026-11-25  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Main baseline:** `821db357d70d3613b0ca61520eaae5c5307e8fd4`  
**Review branch before this report:** `audit/ea-v183-phase1-2-20261125` at `dbadff8082f796d0b5310e283887b33eef5dfd8b`  
**Branch relation:** 5 commits ahead of main, 0 behind. Main was not modified.

## Reproduced evidence

- Candidate source was fetched from the review branch and staged under `C:\\NOVA_EA_RESEARCH\\phase2\\`, outside the MT5 Experts installation directory.
- Candidate source SHA-256: `E29FC5008B5AE128710CB14C6A5853D9AD00AF3562DDDC62276A5A51BB6784F8`.
- MetaEditor `C:\\MT5\\metaeditor64.exe`, target `X64 Regular`: **0 errors, 3 warnings**, 9,564 ms.
- Warnings: two deprecated `POSITION_COMMISSION` references; one possible `long` to `double` conversion.
- Generated research EX5 SHA-256: `AF958C9816A091DF998AC2F44D068E71225D26A9047A6EB0ADD06E415301A864`, size 414,996 bytes. It was generated in the isolated research folder and was not installed or attached to a chart.
- Re-ran `node --test tests/nova-ea-v183-source-integrity.test.mjs` against the branch files staged in the isolated research workspace: **7 passed, 0 failed**.
- Static scan found 8 `OrderSend()` call sites and one `CTrade.PositionModify()` call. The candidate has compile-time execution disable guards in the identified mutating paths. This is static evidence, not runtime interception evidence.

## Review findings — still blocking Phase 2 completion

1. **The 9% open-risk cap is symbol-scoped, not account-wide.** `OpenRiskMoney()` filters positions to `_Symbol`. Separate EA instances on other symbols are therefore outside this calculation. If the intended NOVA contract is portfolio/account-wide, this does not satisfy it.
2. **The five-position cap excludes pending orders.** `V177_CountOpenTotal()` counts positions for the current symbol; it does not include pending orders from `OrdersTotal()`. The implementation therefore does not enforce a total active exposure/order cap of five across positions and pending orders.
3. **Pending-order risk is not included in aggregate open risk.** `OpenRiskMoney()` sums open positions and module in-flight reservations, but does not calculate risk for pending orders. A pending order can later add exposure beyond the stated cap.
4. **Recovery threshold semantics remain unresolved.** Recovery trigger, target, and hard-stop calculations still use `MathMax()`. This must be resolved by explicit per-threshold semantics and tests; a blanket replacement is not justified.
5. **Runtime fail-closed proof is missing.** Compile-time guards and static tests do not prove that zero broker requests are emitted during MT5 runtime. No Strategy Tester interception, Demo read-only integration test, broker fault-injection, restart, or broker-day rollover test has been evidenced.

## Safety state

- `NOVA_PHASE2_EXECUTION_DISABLED=true` remains compiled into the candidate.
- No EA source or EX5 was copied into the installed Experts directory.
- No EA was attached to a chart.
- No live trading or Demo order execution was enabled.
- Main remains unchanged.

## Exit decision

**Phase 1:** source archive and hash-integrity checks are in place; EX5-to-source provenance mapping is still incomplete.  
**Phase 2:** **IN PROGRESS — NOT ACCEPTED**. Compile and static tests pass, but portfolio scope, pending-order risk/counting, Recovery semantics, and runtime zero-request proof remain blocking.

Next repair should define the account-wide scope and pending-order contract, then implement the shared portfolio aggregator and test it before any execution path is enabled.

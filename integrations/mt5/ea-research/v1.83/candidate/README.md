# NOVA EA v1.83 Phase 2 Read-only Candidate

This is a derived research candidate copied from the archived WORKING source. It is not the installed EA and must not be deployed.

A compile-time constant `NOVA_PHASE2_EXECUTION_DISABLED` is set to true. An early return was inserted into the centralized permission function and all 9 functions containing detected broker-mutating API calls (8 `OrderSend` calls and 1 `PositionModify` call). This candidate is intended only to verify that the code compiles with all identified trade-mutating paths fail-closed.

It does **not** yet implement the complete NOVA risk contract (10% daily Entry Lock Only, 9% aggregate open risk, maximum 5 positions). Recovery semantics, Learning, journal grouping, CSV schema, and OOS validation remain outstanding.

Compile evidence: see `COMPILE-RESULT.md`. The generated EX5 and raw compiler log are local artifacts and are intentionally excluded from Git.

# Phase 2 Candidate — Compile Evidence

- Source: `Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`
- Source SHA-256: `96F17FA0C5B9A185D94F286A8B19BA260E7CFA18A046049580909DCE5A092A9C`
- Generated local EX5 SHA-256: `31284E97407A28E928F5FA886175F6294EFAD33726A143FE90DE278B7E03A3DC`
- Compiler: `C:\MT5\metaeditor64.exe`
- Target: X64 Regular
- Result: **0 errors, 3 warnings**
- Duration reported: 10,334 ms

Warnings:
1. Line 3355: `POSITION_COMMISSION` is deprecated.
2. Line 3533: `POSITION_COMMISSION` is deprecated.
3. Line 7688: possible loss of data converting `long` to `double`.

Static gate audit:
- 9 broker-mutating API calls detected: 8 `OrderSend`, 1 `PositionModify`.
- 10 early compile-time disable guards verified: the permission gate plus all 9 functions containing those API calls.
- Functions guarded: `TradePermission`, `SendClose`, `ModifySL`, `Trail_SendPartialClose`, `RecoverySend`, `RecoveryPartialClose`, `ProcessCandidate`, `CancelOwnPending`, `SniperMTF_Check`, `MoveToBreakeven`.

This is compile and static-source evidence only. It is not proof of zero broker requests at runtime, not an MT5 Strategy Tester result, not Demo forward evidence, and not production approval. The EX5 remains local and has not been installed or attached to a chart.

# NOVA EA v1.83 Safety Acceptance Matrix

Status: Static code and compile checks pass; runtime acceptance remains blocked.

| ID | Scenario | Expected result |
|---|---|---|
| SAFE-001 | Market buy in read-only mode | Rejected before broker API; zero requests |
| SAFE-002 | Market sell in read-only mode | Rejected before broker API; zero requests |
| SAFE-003 | Modify SL/TP in read-only mode | Rejected before broker API |
| SAFE-004 | Close or partial close in read-only mode | Rejected before broker API |
| SAFE-005 | Pending order, cancel, hedge, recovery | Rejected before broker API |
| SAFE-006 | Timer/UI/retry bypass attempt | Fail closed |
| RISK-001 | Daily loss reaches 10% | Entry lock activates |
| RISK-002 | Existing position while locked | Daily guard does not flatten it |
| RISK-003 | Restart while locked | Lock state persists |
| RISK-004 | Broker day rollover | Baseline resets once at broker boundary |
| RISK-005 | New entry breaches 9% account-wide NOVA risk | Entry rejected across symbols |
| RISK-006 | Sixth concurrent NOVA position/order | Entry rejected |
| RISK-007 | Pending order has no SL or uncomputable risk | New NOVA exposure rejected |
| RISK-008 | Separate Sniper magic on another symbol | Included in account-wide count and risk |
| REC-001 | Money threshold reached first | Lower money threshold is used |
| REC-002 | Percentage threshold reached first | Lower percentage threshold is used |
| REC-003 | USC vs USD account | Equivalent normalized risk |
| EXEC-001 | First leg succeeds, second fails | Reconcile actual state; no false success |
| EXEC-002 | Timeout/requote/duplicate response | No duplicate exposure |
| DATA-001 | Entry and exit deals | One grouped closed-position outcome |
| DATA-002 | Partial close | Correct aggregate volume, P/L, and risk |
| BUILD-001 | Target MetaEditor build | Zero errors; warnings triaged |

Acceptance requires source commit, compiler and terminal builds, account mode, symbol, timeframe, fixtures, assertion output, and logs. Any untested order-mutating path blocks release. Demo/read-only only; no profitability claim.

## Execution record — 2026-11-25

- Archived source integrity suite: **9 passed, 0 failed**. Covers five immutable source hashes, WORKING/REPAIRED byte identity, SAFE_READONLY gate, unsafe WORKING defaults, compile-time mutating-path guards, 10% Entry Lock Only, account-wide 9% NOVA risk, positions and pending orders, separate Sniper magic, Recovery path and first-hit threshold semantics.
- Candidate MetaEditor compile (X64 Regular): **0 errors, 3 warnings**, 9,908 ms.
- Candidate source SHA-256: `AD54D093FBBC94957E11E8A78699CFFD6FFAF2D70EE072DBDC42E176FAFD042F`.
- Generated local research EX5 SHA-256: `E9DFB6B3D007F2FDAB39D8FCA4B56973FF24D3AC9B0FD941ED86F0F4DE2F761F`.
- Remaining runtime tests SAFE-001..006, RISK-003..004, REC-003, EXEC-001..002 and strategy OOS/walk-forward are not executed. The test matrix is not yet accepted.

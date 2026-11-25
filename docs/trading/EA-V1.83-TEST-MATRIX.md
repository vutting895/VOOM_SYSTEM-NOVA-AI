# NOVA EA v1.83 Safety Acceptance Matrix

Status: Specification only. No tests have been executed or passed.

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
| RISK-005 | New entry breaches 9% aggregate risk | Entry rejected |
| RISK-006 | Sixth concurrent position/order | Entry rejected |
| REC-001 | Money threshold reached first | Agreed trigger semantics applied |
| REC-002 | Percentage threshold reached first | Agreed trigger semantics applied |
| REC-003 | USC vs USD account | Equivalent normalized risk |
| EXEC-001 | First leg succeeds, second fails | Reconcile actual state; no false success |
| EXEC-002 | Timeout/requote/duplicate response | No duplicate exposure |
| DATA-001 | Entry and exit deals | One grouped closed-position outcome |
| DATA-002 | Partial close | Correct aggregate volume, P/L, and risk |
| BUILD-001 | Target MetaEditor build | Zero errors; warnings triaged |

Acceptance requires source commit, compiler and terminal builds, account mode, symbol, timeframe, fixtures, assertion output, and logs. Any untested order-mutating path blocks release. Demo/read-only only; no profitability claim.

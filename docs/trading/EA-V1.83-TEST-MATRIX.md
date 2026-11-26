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
| RISK-004 | Broker day rollover | Shared baseline resets once at broker boundary |
| RISK-005 | New entry breaches 9% account-wide NOVA risk | Entry rejected across symbols |
| RISK-006 | Sixth concurrent NOVA position/order | Entry rejected |
| RISK-007 | Pending order has no SL or uncomputable risk | New NOVA exposure rejected |
| RISK-008 | Separate Sniper magic on another symbol | Included in account-wide count and risk |
| RISK-009 | Multiple chart instances start on same broker day | One shared opening-equity baseline is used |
| RISK-010 | First attach after 60-second grace with no baseline | Entries stay locked until next broker day |
| RISK-011 | Shared baseline file lock/read/write failure | Fail closed |
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

- Archived source integrity suite: **10 passed, 0 failed**. Covers five immutable source hashes, WORKING/REPAIRED byte identity, SAFE_READONLY gate, unsafe WORKING defaults, compile-time mutating-path guards, 10% Entry Lock Only, account-wide 9% NOVA risk, positions and pending orders, separate Sniper magic, Recovery path/first-hit semantics, and shared broker-day baseline fail-closed logic.
- Candidate MetaEditor compile (X64 Regular): **0 errors, 3 warnings**, 10,721 ms.
- Candidate source SHA-256: `117922854A349331074549A0015178E061820B512AD6778F50621E2742DDA283`.
- Generated local research EX5 SHA-256: `CA0693620C4182383C1E731691D456A699A3E4D330C1B635AADF9BCE7D417161`.
- Runtime request interception, common-file concurrency, restart/day-rollover, broker fault-injection, Demo integration and strategy OOS/walk-forward are not executed. The test matrix is not accepted.


## Evidence update — 2026-11-26

- Request Audit instrumentation added to the isolated candidate: 8 OrderSend call sites and 1 PositionModify call are routed through audited adapters; ten entry guards emit BLOCKED events.
- Host-side contract harness: 23 tests passed, 0 failed.
- Multi-instance fixtures: 16 concurrent Risk Slot claimants produced one winner; 24 concurrent symbol instances shared one simulated daily baseline.
- Restart, rollover, lock failure, corrupted baseline, multi-symbol risk, USC/USD normalization, partial-close reject/timeout and broker reject/timeout fixtures passed in the host harness.
- MetaEditor X64 Regular compile: 0 errors, 3 warnings.

**Important:** these are host-side simulations, not MT5 Strategy Tester or MT5 FILE_COMMON runtime results. The actual terminal request log is not yet generated. SAFE/RISK/REC runtime acceptance remains BLOCKED pending isolated MT5 execution and fault-injection evidence.

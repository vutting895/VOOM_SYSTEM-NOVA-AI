# NOVA EA v1.83 - Runtime Safety Harness Evidence

Date: 2026-11-26
Candidate: Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5
Execution policy: NOVA_PHASE2_EXECUTION_DISABLED=true
Branch target: audit/ea-v183-phase1-2-20261125
PR: #416 (Draft; do not merge)

## Request Audit instrumentation
- Added structured NOVA_REQUEST_AUDIT events to the candidate terminal Experts log.
- Instrumented the ten identified hard-disable entry guards.
- Routed all eight former OrderSend call sites through NovaAuditOrderSend.
- Routed CTrade.PositionModify through NovaAuditPositionModify.
- Raw API references remain only inside the two audit adapters.
- Per-instance counters: attempts, blocked, API calls, accepted, rejected; summary emitted on OnDeinit.
- Because the candidate has not been loaded in MT5, no actual terminal Request Audit log has yet been generated. This change is instrumentation, not runtime proof.

## Automated harness results
- Node tests: 23 passed, 0 failed.
- 16-process shared Risk Slot race: exactly one winner, 15 losers.
- 24-process shared baseline initialization: one baseline value and one creator.
- Restart persistence fixture: daily lock survives reload.
- Broker-day rollover fixture: next-day baseline created once.
- Lock acquisition failure: fail closed.
- Corrupt/truncated baseline: fail closed.
- Multi-symbol portfolio fixture: aggregate risk across symbols.
- USC/USD normalization fixture: cent-to-USD normalization.
- Partial-close rejection: actual broker volume retained; no optimistic reduction.
- Partial-close timeout: reconciliation required and new entries locked.
- Broker reject/timeout fixtures: no assumed success.

## Compile
MetaEditor X64 Regular: 0 errors, 3 warnings.
Warnings: two deprecated POSITION_COMMISSION references; one possible long to double conversion.
See metaeditor-compile.log.

## Critical limitations
The multi-process harness is a host-side deterministic simulation of the lock and state contracts. It is not MT5 FILE_COMMON runtime evidence.
No MT5 Strategy Tester, terminal restart, broker-day rollover, broker fault-injection, USC broker account, or Demo integration run was performed.
No broker request was intentionally sent. The EA remains compile-time hard-disabled and was not installed in Experts or attached to a chart.
OOS and walk-forward are not part of this safety-harness result.

## Decision
Automated host-side harness and compile pass. MT5 Runtime Safety Gate remains BLOCKED.
Do not enable execution, Demo forward, merge, or release based on this evidence alone.

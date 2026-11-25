# Phase 2 Candidate — Compile Evidence

**Updated research candidate — exact-source compile re-run completed.**

- Repository branch: research/ea-v183-evidence-smc-20261125
- Source path: integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5
- Source SHA-256 (Windows research workspace): E23FB5D0CD51A5792976C5684852413962CD5BC0F4118771FEBB33D8F283F67D
- Generated EX5 SHA-256 (Windows research workspace): E449D96B99F6ECC639D0889A06A0DC0B7943B4BD7197FFB445DF3108791740EF
- Compiler: C:\\MT5\\metaeditor64.exe
- Target: X64 Regular
- Result: **0 errors, 2 warnings**
- Duration: **9,618 ms**
- Compile log: C:\\NOVA_EA_RESEARCH\\phase3\\metaeditor-compile-next.log
- Research source / EX5 output directory: C:\\NOVA_EA_RESEARCH\\phase3\\ (outside MT5 Experts installation)

Warnings:
1. Line 3392: POSITION_COMMISSION is deprecated (legacy commission aggregation).
2. Line 3576: POSITION_COMMISSION is deprecated (legacy recovery/overlap P/L aggregation).

The prior possible long-to-double conversion warning was corrected with an explicit cast. No new compiler warnings were introduced by the SMC research path.

## Static tests

- Command: node --test tests/nova-ea-v183-source-integrity.test.mjs
- Result: **9 passed, 0 failed** (re-run after the design update; 130 ms)
- Coverage includes immutable source hashes, byte identity, hard-disabled execution paths, daily Entry Lock Only, portfolio caps, strict SMC mode, completed-bar H1 filter, confirmed prior-swing logic, and pending-order exposure aggregation.

## Safety / remaining validation

- NOVA_PHASE2_EXECUTION_DISABLED=true remains compiled into the candidate.
- The EX5 was generated only in C:\\NOVA_EA_RESEARCH\\phase3\\; it was not copied to the installed Experts folder and was not attached to a chart. The exact Experts-path check returned false.
- MT5 runtime zero-broker-request interception: **NOT RUN**.
- Multi-symbol pending-order fixtures, cross-chart concurrency, hedging/netting, USC/USD conversion and broker fault-injection: **NOT RUN**.
- Strategy Tester real-tick backtest, OOS, walk-forward, Monte Carlo and Demo forward test: **NOT RUN**.
- Cross-chart in-flight reservations remain instance-local and block execution enablement. The separate portfolio reservation design document is a specification only, not implementation.

Compile and static-test success do not establish strategy profitability or runtime safety.

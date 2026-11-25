# Phase 2 Candidate — Compile and Test Evidence

Status: research-only. Execution hard-disable remains compiled in. This is not a release approval.

## Current exact candidate build — 2026-11-26

- Branch: `research/ea-v183-evidence-smc-20261125`
- Source: `integrations/mt5/ea-research/v1.83/candidate/Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5`
- Source SHA-256: `2A39EE9CDB2587AE5CF2810207F77EFA39EFDA8F076153B22F5EA5B2159AE604`
- EX5 SHA-256: `AF01ABCC5DFE50A9A30AFA53BEC19EB32058C416637D46F5933578070926DD82`
- Compiler: MetaEditor X64 Regular, `C:\\MT5\\metaeditor64.exe`
- Result: **0 errors, 2 warnings**, 12,640 ms.
- Compile log: `C:\\MT5\\logs\\NOVA-v183-candidate-compaction.log`
- Candidate output: `C:\\MT5\\MQL5\\Scripts\\NOVA_Research\\` (research workspace; not installed under Experts and not attached).

Warnings are the two pre-existing deprecated `POSITION_COMMISSION` usages (legacy commission/P&L aggregation). No new compiler warnings were introduced by the coordinator compaction change.

## Harness compilation

| Harness | Result | Log |
|---|---:|---|
| Broker adapter self-test | 0 errors, 0 warnings | `C:\\MT5\\logs\\NOVA-broker-selftest-compaction.log` |
| Portfolio coordinator harness | 0 errors, 0 warnings | `C:\\MT5\\logs\\NOVA-portfolio-harness-compaction.log` |

The MQL5 harnesses were compiled, but their `OnStart` functions have **not** been executed with captured receipts. These are compile receipts only.

## Node test suite — 2026-11-26

Command:
```powershell
node --test tests\\nova-ea-v183-source-integrity.test.mjs tests\\nova-ea-v183-concurrency-runtime-fixtures.test.mjs
```

Result: **24 passed, 0 failed**, 328.0457 ms. This includes:
- 64-way concurrency in a deterministic JavaScript reference model (one reservation wins).
- Source wiring assertions for Core, Sniper MTF and Recovery.
- Broker adapter routing and hard-disable guard assertions.
- Ledger compaction source assertions.
- Archived source SHA-256 and read-only/hard-disable invariants.

These are local Node tests. They do not execute MQL5 code or prove terminal-level concurrency or zero broker requests.

## Safety and remaining gates

- `NOVA_PHASE2_EXECUTION_DISABLED=true` remains compiled into the candidate.
- No Main modification, merge, deployment, EA installation under Experts, chart attachment, broker order, or Live Trading.
- Dynamic broker interceptor `OnStart` receipt: **NOT RUN / NOT VERIFIED**.
- Actual multi-chart and multi-terminal contention: **NOT RUN / NOT VERIFIED**.
- Process-kill restart, rollover, lock failure and corrupt-ledger fault injection against a live FILE_COMMON ledger: **NOT RUN / NOT VERIFIED**.
- USC and XAUUSDm contract/tick-value/commission/swap/margin fixtures against Exness account metadata: **NOT VERIFIED**.
- CircleCI pipeline 2123 provider logs and exact-head run: **NOT VERIFIED**.
- Real Tick, sealed OOS, walk-forward, Monte Carlo and Demo Forward: **NOT RUN**.

Compile and Node test success do not establish runtime safety, broker compatibility, or strategy profitability. Keep PR #417 Draft and keep execution disabled.

# NOVA EA v1.83 — Strategy Validation Data Preflight

Date: 2026-11-26
Status: **BLOCKED — real-tick coverage not established; no strategy backtest run on this candidate.**

## Local Exness-MT5Trial7 history inventory

- Terminal data instance: `E23367DD11DBEB0EF97D08185EAB7295`.
- Server data folder: `bases/Exness-MT5Trial7`.
- XAUUSDm bar-history directory contains annual `.hcc` files for 2020–2026.
- XAUUSDm tick-history directory currently contains only `ticks.dat` (123,312 bytes) and **zero monthly `.tkc` files**.
- This confirms cached bar history exists; it does not confirm real tick coverage.

MetaQuotes documents that Model=4 means “Every tick based on real ticks” and that downloaded real ticks are stored by month as TKC files under `bases/[server]/ticks/[symbol]/`. See:
- https://www.metatrader5.com/en/terminal/help/start_advanced/start
- https://www.metatrader5.com/en/terminal/help/algotrading/tick_generation

## Existing tester-log audit

- The latest local Tester log dated 2026-11-23 contains a v1.83 REPAIRED run on XAUUSDm M15 for 2026-11-20 through 2026-11-23.
- The tester explicitly logged **`every tick generating`**, 799,185 generated ticks, 92 bars. This is generated-tick evidence, not real-tick evidence.
- Other historical tests in the same log use older v1.83 REPAIRED / TEST_DAILY20_MAX10 binaries. They do not validate the current research candidate.
- A local `tester_nova_v183_safe_readonly.ini` exists with `Model=4`, but no corresponding report/run evidence was found. An INI setting alone is not proof of execution.

## Preflight attempt

- Created a separate tester INI for 2026-07-01 through 2026-07-03 using the already-installed SAFE_READONLY EA, with `InpTradeEnabled=false` and `InpLiveEnabled=false`.
- The connected terminal process was already running from 2026-11-23. The config launch did not produce a new Tester log or a report file, so the preflight is **NOT RUN / NOT VERIFIED**.
- No research candidate EX5 was installed or attached. No broker operation was performed.

## Decision

Do not report Real Tick, OOS, walk-forward, or Demo Forward results from the existing generated-tick log. Do not run profitability tests on the candidate until:

1. Real XAUUSDm tick coverage is retrieved from the correct Exness server and its monthly TKC coverage is verified for the target dates.
2. The current candidate has a safe Strategy Tester-only execution adapter that permits simulated tester trades without enabling external broker requests.
3. Account-wide atomic reservation and runtime zero-mutation proof pass.
4. The final OOS boundary remains sealed at 2026-07-01; no tuning on the final OOS segment.

A missing real-tick history month must be marked missing, not silently accepted as generated ticks. Strategy performance remains unproven.

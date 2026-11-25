# Phase 2 Candidate — Compile Evidence

> **Superseded:** The compile evidence below applies to the earlier candidate source SHA only. It does NOT apply to the updated source on branch research/ea-v183-evidence-smc-20261125. The updated source has not yet been compiled.

- Earlier source: Nova_EA_v1_83_PHASE2_READONLY_CANDIDATE.mq5
- Earlier source SHA-256: E29FC5008B5AE128710CB14C6A5853D9AD00AF3562DDDC62276A5A51BB6784F8
- Earlier generated local EX5 SHA-256: E28E6D3580BB6161D238BE951CE543CAEEDBF2F3918DAC7649ECF60417E66615
- Earlier compiler: C:\MT5\metaeditor64.exe
- Earlier target: X64 Regular
- Earlier result: **0 errors, 3 warnings**
- Earlier duration reported: 9,600 ms

Earlier warnings:
1. Line 3363: POSITION_COMMISSION is deprecated.
2. Line 3547: POSITION_COMMISSION is deprecated.
3. Line 7708: possible loss of data converting long to double.

## Current candidate changes — compile pending

The research branch adds:
- Opt-in strict SMC research mode (default OFF).
- Closed-H1-bar EMA(50) direction filter.
- Strict Sweep + Displacement + CHoCH confirmation.
- Structural SL beyond sweep wick, minimum max(0.50 ATR, 3x spread), fixed 2R target.
- No AI score lot boost in research mode; skip if calculated volume is below broker minimum.
- Account-wide managed position and pending-order risk aggregation.
- Account-wide position/order count limits.

## Current validation state

- Static Node test suite was extended; exact-branch execution is pending.
- MetaEditor compile of the updated source: **NOT RUN**.
- MT5 runtime zero-request interception: **NOT RUN**.
- Multi-symbol pending-order risk fixtures: **NOT RUN**.
- Demo forward and OOS performance: **NOT RUN**.
- Global compile-time execution disable remains enabled in source.

Do not use the earlier compile result as evidence for the updated source. Do not install or attach this candidate.
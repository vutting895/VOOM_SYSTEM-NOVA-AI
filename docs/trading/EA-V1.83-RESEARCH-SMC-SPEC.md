# NOVA EA v1.83 — Strict SMC Research Mode Specification

**Branch:** `research/ea-v183-evidence-smc-20261125`
**Base:** `96c18e5b6a0d13bfbca049d91fe73fd84aec05e5`
**Status:** Implemented in source as an opt-in research path; NOT compiled or accepted.

## State machine

1. **Context:** H1 completed-bar EMA(50) close and slope must agree with trade direction. Insufficient H1 history => no signal.
2. **Liquidity event:** M15 shift-2 bar takes the preceding shift-3 low (buy) or high (sell).
3. **Reclaim + displacement + structure:** M15 shift-1 completed bar closes back beyond the sweep level, has body > 0.6 × ATR, and closes beyond the sweep candle high/low. All three checks must pass.
4. **Timing:** retain existing M15 EMA20 pullback check and bounded pending expiry. Research mode uses the configured GMT London/NY killzone windows.
5. **Risk geometry:** SL beyond sweep extreme by 0.10 × ATR, with minimum distance max(0.50 × ATR, 3 × spread). TP = 2 × actual entry-to-SL distance.
6. **Sizing:** risk budget = equity × InpSniperMTF_RiskPercent; loss computed by OrderCalcProfit(). No score multiplier. If computed volume is below broker minimum, skip.
7. **Portfolio gate:** account-wide managed open positions and pending orders count toward the 5-position and 9%-risk caps. An exposure without SL or invalid profit calculation blocks new exposure.
8. **Global safety:** NOVA_PHASE2_EXECUTION_DISABLED=true remains compiled in. The strategy is not executable in this candidate.

## Defaults

| Input | Default | Purpose |
|---|---:|---|
| InpResearchSMC_Mode | false | Research path off by default |
| InpResearchSMC_MinStopATR | 0.50 | Minimum stop distance |
| InpResearchSMC_SweepBufferATR | 0.10 | Buffer beyond sweep wick |
| InpResearchSMC_RewardRisk | 2.0 | Fixed reward/risk target |
| InpSniperMTF_RiskPercent | 0.12% | Existing Sniper risk budget |
| InpSniperMTF_SpreadMaxPoints | 30 | Existing spread ceiling |
| InpMaxOpenRiskPct | 9.0% | Existing aggregate risk ceiling |
| InpMaxPositions | 5 | Existing concurrent exposure ceiling |
| InpDailyLossPct | 10.0% | Broker-day Entry Lock Only |

## Non-goals

- Does not replace Core strategy or enable it.
- Does not promote XGBoost/LSTM/ONNX models.
- Does not add a standalone liquidity-sweep trade.
- Does not enable martingale, averaging or recovery.
- Does not enable broker writes, Demo order execution, or Live Trading.
- Does not claim positive expectancy or profitability.
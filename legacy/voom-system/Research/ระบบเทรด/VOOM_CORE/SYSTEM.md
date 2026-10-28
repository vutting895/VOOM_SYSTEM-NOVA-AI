# VOOM Core — Elliott Wave + Supply/Demand Confirmation

**Version:** 0.1.0  
**Status:** research — NOT approved for live trading  
**Purpose:** research baseline for VOOM AI SNIPER. AI may retrieve this file to analyze the strategy, suggest improvements and design reproducible tests.

## Core concept
Combine Elliott Wave structure with Demand/Supply zone confirmation. Candidate analysis may consider market structure (BOS/CHOCH), liquidity sweeps, Fair Value Gaps (FVG), Order Blocks (OB), ATR-based stop placement, reward-to-risk filters and strict position/risk limits.

## Required deterministic rules before production
- swing/pivot definition and Elliott Wave invalidation rules;
- objective Demand/Supply zone construction, freshness and invalidation;
- exact entry trigger and candle-close requirements;
- stop-loss, take-profit, trailing and break-even rules;
- spread, commission, swap, slippage, symbol contract and volume-step handling;
- position limits, daily/weekly loss locks, duplicate-order prevention and stale-data behavior.

Do not let the language model invent missing values and treat them as validated strategy rules. Missing values must be marked TBD and tested as candidate parameters.

## AI permissions
Allowed: retrieve documents, compare research, explain evidence, generate candidate rule sets, propose code changes in a separate branch, create tests, evaluate backtest reports and summarize uncertainty.

Not allowed by this catalog: place live orders, enable live trading, alter hard risk limits, overwrite the approved version, or self-approve a strategy. Live trading remains disabled until explicit human approval and demo forward validation.

## Evidence and status
The general Research playbooks are available as supporting knowledge. This specific strategy has **not** been verified here with a reproducible full-cost backtest, walk-forward validation, broker-specific checks and demo forward test. Do not claim profitability or production readiness.

## Sources
See Research documents referenced by manifest.json. Any newly discovered claims must include source URL, date checked, evidence grade and whether they have been independently reproduced.

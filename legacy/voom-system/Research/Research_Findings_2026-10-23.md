# Research Findings — 2026-10-23

## Finding 1 — Institutional execution is a cost/risk trade-off
CFA Institute's 2026 Trade Strategy and Execution reading describes selecting execution based on urgency, liquidity, volatility, risk aversion and trade objective. It covers arrival price, VWAP, TWAP and transaction-cost analysis. Application to VOOM: log intended versus filled price and measure execution quality; signal win rate alone is not a complete system metric.
Source: https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/trade-strategy-execution

## Finding 2 — Algorithmic controls need staged deployment and testing
The FCA's 2025 review describes pre/post-trade controls and conservative, phased deployment with scrutiny. FCA technical standards describe testing methodology, approvals, separated testing environments and predefined limits. Application to VOOM: keep backtest, demo and live configurations separated; document approval for material changes.
Sources:
- https://www.fca.org.uk/publications/multi-firm-reviews/algorithmic-trading-controls-high-level-observations
- https://handbook.fca.org.uk/technical-standards/s119c1039/s119c1039s369

## Finding 3 — 2026 supervisory guidance highlights AI governance
ESMA published a supervisory briefing on algorithmic trading on 2026-02-26. Its announcement addresses pre-trade controls, governance, testing frameworks, outsourcing and AI considerations. Application to VOOM: AI must not bypass deterministic validation; record input freshness, model output, reason and downstream veto/accept decision.
Source: https://www.esma.europa.eu/press-news/esma-news/esma-issues-supervisory-briefing-algorithmic-trading

## Finding 4 — existing research baseline is negative and limited
The project's Backtest/research_report.json reports -2.42% holdout return, 2.46% max drawdown, 87 trades and profit factor 0.68 for an illustrative EMA/RSI/ATR baseline. It is not the production model and omits important execution details. Conclusion: do not deploy it; improve simulation and test the actual strategy separately.
Evidence: ../Backtest/research_report.json

## Finding 5 — existing safety report needs fresh execution
Backtest/safety_regression_report.json records successful daily-loss blocking and fail-closed behavior when deal history is unavailable. This does not prove every live integration path works. Re-run in the trusted development environment and extend to stale quotes, duplicate requests, API timeout, malformed AI response, broker rejection, restart reconciliation and emergency stop.
Evidence: ../Backtest/safety_regression_report.json

## Evidence boundary
These are findings from official sources and existing project reports, not claims that a particular bank's proprietary entry strategy has been discovered. Elliott Wave, FVG, OB and liquidity sweeps remain testable hypotheses.

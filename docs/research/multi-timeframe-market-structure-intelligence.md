# Multi-Timeframe Market Structure Intelligence

**Knowledge ID:** NOVA-MTF-001  
**Status:** Research hypothesis; not a validated trading rule  
**Added:** 2026-11-11  
**Source provenance:** User-provided Thai summary of an educational video. Original video URL, full transcript, instrument, session, and test data were not supplied. Treat the source as a secondary summary, not independently verified evidence.

## 1. Objective

Teach NOVA to interpret lower-timeframe price action in the context of higher-timeframe market structure. The intended benefit is better classification of trend continuation, pullback, reversal, and consolidation—not automatic prediction that lower timeframes must follow the higher timeframe.

This document is a research/knowledge artifact. It does not authorize model fitting, strategy activation, order generation, risk-policy changes, broker writes, or Live Trading.

## 2. Multi-timeframe roles

Use a top-down hierarchy, subject to instrument and trading-horizon configuration:

| Timeframe | Analytical role | Questions |
|---|---|---|
| D1 | Higher-timeframe context / regime | Trend, range, major swing structure, key zones, volatility regime? |
| H4 | Intermediate structure | Swing sequence, impulse/pullback, structure break, liquidity context? |
| H1 | Setup context | Is price accepting/rejecting a zone? Is the pullback weakening or extending? |
| M15 | Setup formation | Is there a defined trigger with invalidation and sufficient room to target? |
| M5 | Execution refinement | Is the entry trigger confirmed without contradicting the setup? |

Higher timeframes provide context; they do not dictate every lower-timeframe candle. A lower timeframe can trend counter to D1 during a pullback, news impulse, regime transition, or genuine reversal.

## 3. Required market-state classification

NOVA should classify the current state before producing a directional thesis:

1. **TREND_CONTINUATION** — swing structure and price acceptance support continuation.
2. **PULLBACK** — countertrend movement remains within a still-valid higher-timeframe structure.
3. **REVERSAL_CANDIDATE** — evidence of structural failure/transition exists; confirmation is still required.
4. **CONSOLIDATION** — price is rotating within a range without directional acceptance.
5. **BREAKOUT_CANDIDATE** — price is testing or moving beyond a defined range/structure boundary; acceptance and retest must be evaluated.
6. **UNCLASSIFIED** — data, structure, or evidence is insufficient. Fail closed; do not force a label.

Do not label every countertrend move a pullback. A pullback thesis is invalidated when its structural invalidation condition is met. Do not label a wick-only breach as a confirmed structure break without a configured close/acceptance rule.

## 4. Top-down analysis sequence

1. Validate data provenance, timestamp timezone, candle completeness, OHLC consistency, and timeframe alignment.
2. Determine D1 regime using explicit swing definitions (e.g. confirmed higher highs/higher lows, lower highs/lower lows, or range boundaries). State the swing algorithm and confirmation delay.
3. Mark relevant D1 support/resistance or supply/demand zones using reproducible criteria: prior swing reactions, repeated tests, displacement/acceptance, and zone age. Avoid subjective labels such as "strong" without a measurable definition.
4. Read H4 structure relative to the D1 thesis: continuation, pullback, range, or possible transition.
5. Use H1 to assess whether the setup is approaching a pre-defined decision zone and whether the thesis remains valid.
6. Require an M15 setup and M5 trigger only when the configured strategy uses those execution timeframes.
7. Define entry, invalidation/stop, target, spread/slippage assumptions, and position risk before any hypothetical trade evaluation.
8. If timeframes conflict or data is stale/incomplete, reduce confidence or return NO_TRADE/UNCLASSIFIED.

## 5. The H4 six-candle 2-2-2 idea

The video summary proposes grouping six H4 candles in a day into:
- first two candles: formation / initial positioning;
- middle two candles: base / consolidation;
- final two candles: expansion / "shoot".

Record this only as a **testable intraday timing hypothesis**. It is not a universal market cycle, and the final two candles are not inherently more likely to expand. The six-candle grouping depends on the broker's candle boundary, timezone, daylight-saving/session conventions, and the instrument's trading calendar.

Before testing, define the broker/server timezone and daily anchor. Compare the proposed groups against:
- all six candle positions separately;
- session-of-day and weekday baselines;
- volatility-normalized range and realized volatility;
- trend and range regimes separately;
- scheduled news and market closures;
- out-of-sample periods and transaction costs.

Do not encode "2-2-2" as a deterministic entry rule or infer a directional signal from candle position alone.

## 6. Support/resistance and stop placement

- A zone is a context, not a guaranteed turning point.
- Define zones algorithmically and measure touches, rejection/acceptance, penetration, age, and subsequent excursion.
- Avoid a fixed universally short stop. Equally, do not widen stops arbitrarily to avoid being stopped out.
- Place a hypothetical stop at a strategy-defined structural invalidation level, then evaluate whether the distance is compatible with volatility, spread, slippage, and the approved risk budget.
- If the structurally valid stop makes position sizing or reward/risk unacceptable, the correct output is NO_TRADE—not an artificially tight stop.
- Any ATR buffer, swing buffer, minimum stop distance, or target rule must be versioned and tested, not improvised by the model.

## 7. Evidence and confidence policy

Separate:
- **Observed facts:** values and structures computed from verified bars.
- **Interpretation:** the state label and reasoning derived from those observations.
- **Hypothesis:** expected continuation, timing, or expansion.
- **Unknown:** missing data, ambiguous structure, unverified feed, or insufficient sample.

Confidence must be calibrated against out-of-sample outcomes; it must not be a decorative percentage. Every output should identify the data window, symbol, timeframe, timezone, feature/algorithm version, and evidence supporting the label.

## 8. Suggested structured output contract

```json
{
  "knowledge_id": "NOVA-MTF-001",
  "symbol": "string",
  "as_of_utc": "ISO-8601 timestamp",
  "data_status": "VERIFIED | INCOMPLETE | UNVERIFIED",
  "timeframe_context": {
    "D1": {"state": "string", "structure": "string", "key_zones": []},
    "H4": {"state": "string", "structure": "string", "relation_to_D1": "string"},
    "H1": {"state": "string", "setup_context": "string"},
    "M15": {"setup": "string"},
    "M5": {"trigger": "string"}
  },
  "market_state": "TREND_CONTINUATION | PULLBACK | REVERSAL_CANDIDATE | CONSOLIDATION | BREAKOUT_CANDIDATE | UNCLASSIFIED",
  "thesis": "string",
  "invalidation": "string",
  "evidence": [],
  "counter_evidence": [],
  "hypotheses": [],
  "decision": "RESEARCH_ONLY | NO_TRADE",
  "confidence": null,
  "limitations": []
}
```

The schema is illustrative and must be adapted to the existing NOVA contracts before implementation. Do not populate fields with invented market values.

## 9. Validation plan before promotion

1. Obtain the original video URL/transcript and record source metadata if available.
2. Implement deterministic, unit-tested swing/zone/state definitions in an isolated research branch; do not wire them to execution.
3. Build labelled examples from provenance-backed historical bars. Human-review ambiguous labels; do not create synthetic candles or labels.
4. Compare a D1-only baseline against D1+H4, D1+H4+H1, and the full D1/H4/H1/M15/M5 hierarchy.
5. Test the H4 2-2-2 hypothesis separately against position-of-day and session baselines.
6. Use chronological train/validation/test splits, purge overlapping labels, prevent look-ahead and candle-close leakage, and keep a final untouched OOS period.
7. Report sample counts, coverage, class balance, confusion matrix, precision/recall, calibration, expectancy, profit factor, drawdown, costs, and baseline comparison. Include confidence intervals where feasible.
8. Require independent review and exact-head CI evidence before any merge or downstream model consumption.

## 10. NOVA safety boundary

- Research/knowledge only. No strategy deployment or model promotion.
- Do not treat this document as proof of model learning or training completion.
- Do not alter Risk Policy, broker integration, execution permissions, or account mode.
- Keep Live Trading OFF; `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- Until data and evaluation gates pass, the output is an analytical hypothesis only and must not generate broker actions.

## 11. Source-summary concepts captured

The supplied summary describes: D1 as the primary trend context; lower-timeframe movement as potentially being a pullback rather than a new trend; a proposed six-H4-candle 2-2-2 rhythm; strong support/resistance; avoiding arbitrarily tight stops; and prioritizing market structure over isolated entry patterns. The test requirements and safety boundaries above are NOVA's validation controls, not claims made by the video.

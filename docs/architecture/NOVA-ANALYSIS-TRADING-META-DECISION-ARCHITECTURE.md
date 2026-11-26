# NOVA Analysis & Trading — Independent Strategies / Meta Decision Architecture

**Status:** Draft architecture baseline  
**Base:** `main` at `0cceaf5d1d32b4323bcf72f9f26877c6d75886ff`  
**Safety invariant:** READ-ONLY; Live Trading OFF; no broker execution path.

## 1. Design decision

Keep the two strategy families independent and let a Meta Decision Layer compare their research signals. Do not force them to share entry logic, indicator thresholds, stop placement, or trade frequency.

- **Strategy A — SMC Mean Rejection:** H4 market bias and structure, M5 rejection/entry candidate. The implementation must use only information available at the decision timestamp.
- **Strategy B — NOVA EA Core:** H1/H4 alignment, M15 closed-bar setup and confirmation. The MT5 module remains signal-only.
- **Meta Decision Layer:** normalizes, scores, de-duplicates and arbitrates candidates. It may select A, select B, reject both, or mark a conflict as NO_TRADE.
- **Shared Risk Governor:** applies account-level limits after candidate selection. It is not allowed to change strategy signals to manufacture a pass.

## 2. Runtime boundaries

1. Market Data / Canonical Timebase
2. Feature & Market Structure Services
3. Strategy A adapter
4. Strategy B adapter
5. Meta Decision Layer
6. Shared Risk Governor
7. Signal Journal / Research Evaluator
8. MT5 Read-only Bridge

The analysis and research services must not import or call broker order APIs. The MT5 integration in this phase may read account/market state and publish candidate signals only. No order placement, modification, close, pending-order mutation, withdrawal, or transfer functionality is permitted.

## 3. Candidate contract

Every strategy candidate must include:

- strategy_id and strategy_version
- symbol, direction, timeframe and decision timestamp (UTC)
- source bar close timestamp and data snapshot/provenance ID
- entry reference, invalidation/stop reference, target reference and estimated R multiple
- structure/context features and explicit rejection reasons
- model/config hash and code commit SHA

Candidates without complete provenance, closed-bar confirmation, valid prices, or synchronized timestamps are rejected.

## 4. Meta Decision policy

The first release is deterministic and explainable, not an ML model that can place trades.

1. Validate schema, provenance, freshness and closed-bar status.
2. Evaluate each strategy independently against its own frozen rules.
3. Normalize candidate quality into a documented score with calibrated components; do not compare raw indicator values across strategies.
4. Apply hard vetoes: stale data, conflicting direction without explicit arbitration policy, invalid stop distance, spread/volatility guard failure, duplicate exposure, or missing evidence.
5. Choose the highest-ranked eligible candidate only when it clears a pre-registered threshold; otherwise return NO_TRADE.
6. Persist both selected and rejected candidates with reason codes.

Initial weights/thresholds are research parameters and must be frozen before each OOS evaluation. Do not tune them on final OOS.

## 5. Risk Governor

The Risk Governor is independent of strategy scoring and owns portfolio/account constraints, including:

- daily loss lock based on broker-day starting equity
- aggregate open-risk cap
- maximum open order/position count
- spread, volatility, margin and data-health guards
- symbol/account exposure and duplicate-signal checks

The current NOVA policy baseline remains read-only and Live Trading OFF. Risk calculations may be simulated and logged; they must not submit broker instructions.

## 6. Research integrity / backtest requirements

The existing SMC research implementation is not production evidence. Before using its metrics, fix and test:

- **Swing confirmation:** centered pivots require future bars to confirm. A pivot may become available only after the right-side confirmation window has elapsed; never backdate its availability.
- **OB/FVG lifecycle:** generate zones incrementally at the time their source structure becomes knowable. Never build a full-period zone list and query it while simulating earlier timestamps.
- **HTF alignment:** use only the most recently fully closed H4/H1 bar at the M5/M15 decision timestamp. Define timezone and bar-boundary semantics explicitly.
- **Entry timing:** signal on a closed candle; fill no earlier than the first eligible subsequent tick/bar using side-correct Bid/Ask.
- **Intrabar ambiguity:** if SL and TP are both touched and tick ordering is unavailable, use a conservative deterministic rule or finer-grained data; never assume the favorable order.
- **Costs:** include spread, commission, swap where applicable, and a documented slippage model.
- **Position lifecycle:** continue evaluating exits outside entry sessions; session filters constrain entries only unless explicitly specified otherwise.
- **Accounting:** size from contract specifications, tick value/size, account currency and lot constraints—not price-distance alone.

Required tests include synthetic fixtures for no-look-ahead pivots, no-future-zone access, HTF bar closure, next-tick fills, same-bar SL/TP, session exit handling, and transaction costs.

## 7. Model integration

XGBoost, LSTM/deep learning and other models are advisory feature/scoring providers only. They do not independently authorize trades. Training must use time-ordered splits, point-in-time features, leakage-safe labels, frozen preprocessing and reproducible model artifacts. Any learned Meta Decision policy must be evaluated separately from deterministic baselines.

## 8. Validation gates

- Keep the final OOS untouched by feature, strategy, stop, threshold or model selection.
- The historical OOS start date of 2026-07-01 is not automatically valid: first audit whether any data from that interval influenced prior model/stop decisions. If contaminated, reserve a later untouched interval.
- Require at least 30 closed OOS trades, positive net P&L after costs, PF > 1.0, baseline-relative classification performance where applicable, and walk-forward robustness.
- Report trade count, PF, expectancy, max drawdown, exposure, long/short breakdown, regime/session breakdown, cost sensitivity and confidence intervals.
- A passing aggregate PF alone is insufficient; investigate concentration by period, direction, regime and strategy.

## 9. Delivery sequence

1. Build a leakage-safe event-driven research engine and synthetic regression tests.
2. Re-run Strategy A independently; preserve Strategy B's existing safety boundary.
3. Define candidate schema and deterministic Meta Decision policy.
4. Add shared Risk Governor simulation and portfolio-level overlap/exposure tests.
5. Add model advisory outputs only after deterministic baselines are reproducible.
6. Run paper/read-only shadow evaluation on MT5 data.
7. Keep all execution capabilities disabled until a separately approved production safety gate exists.

## 10. Acceptance criteria for this architecture slice

- Strategy A and B can emit, reject and explain candidates independently.
- Meta Decision can choose A, B, or NO_TRADE without modifying either strategy.
- Every decision is replayable from immutable data/config/code identifiers.
- Risk Governor vetoes are explicit and auditable.
- Tests prove no future information is visible to a historical decision.
- No live or demo broker order API is invoked by this architecture slice.

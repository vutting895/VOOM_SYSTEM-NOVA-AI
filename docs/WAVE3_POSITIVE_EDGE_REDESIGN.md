# Wave3 Positive-Edge Redesign — Research Architecture (Draft)

**Status:** research design only; no strategy activation, broker orders, deployment, or change to the frozen v6.2.6.3 contract.  
**Baseline source:** `main` at `a2acfd8ec9b598e6593413549bef760e8f596a72` (verified before branch creation).  
**Existing benchmark:** PR #66 / `feature/wave3-hybrid-backtest-20261029`. This redesign is isolated on a new branch and does not alter PR #66.

## 1. Objective and non-negotiable rules

The objective is to discover whether any causally valid XAUUSDm M15 strategy has positive, repeatable net expectancy after spread, commission, slippage, and execution assumptions. Positive profit is an empirical acceptance criterion, not a promised outcome.

Keep v6.2.6.3 as an immutable benchmark:
- Wave3/Fib, SMC >=85, XGB BUY >=75%, LSTM BUY >=80%, ensemble >=85%, and all existing RSI/momentum/volume/trend/ATR/spread/news gates remain unchanged.
- Existing simulator risk assumptions and final OOS boundary remain unchanged for benchmark reproduction.
- Never weaken a gate, alter weights/lookbacks/thresholds to manufacture signals, or select a model based on final OOS.
- No broker order code, no live trading, no deployment.

A challenger may explore a genuinely distinct, preregistered setup definition (not a relaxed copy of the benchmark). It must be evaluated separately and cannot inherit a claim of success from benchmark metrics.

## 2. What current evidence says

The calendar-filtered benchmark artifact for run #2 (commit `817b0d328d49e2cd80de139fe08183ada8c7cd29`, artifact #12974688556) reports:
- Final OOS 7,942 rows; accuracy 41.3246% versus 45.9708% majority baseline; balanced accuracy 39.1057%; macro-F1 37.6761%.
- All five walk-forward folds are below their fold-specific majority baselines.
- 7,421/7,942 OOS bars are news-safe; 521 are blocked.
- Zero closed trades, $0 net profit, PF unavailable.
- Direction labels: train short/hold/long = 23,193 / 43,363 / 26,459; OOS actual = 2,198 / 3,651 / 2,093; predictions = 3,567 / 3,239 / 1,136. Long recall is 16.5313%.
- Raw direction probabilities are not calibrated trade-win probabilities; no Brier score, ECE, or reliability curve exists yet.

SMC diagnostics show 34 Wave3 trigger rows and maximum score 75 on those rows. The SMC >=85 score requires all four unchanged components (BOS20 30, three confirmed higher lows + green candle 20, qualifying OB 25, FVG refill 25). Only 1/34 triggers had a valid bullish OB within $5 and none were inside the OB zone; FVG refill occurred on 7/34. These marginals do not establish which component causally prevents same-bar confluence. Structural CHoCH is distinct from the higher-lows-plus-green scoring rule.

## 3. Redesign workstreams

### A. Evidence and data integrity (P0 gate)
1. Make every dataset immutable by content hash; record source, symbol, timeframe, UTC range, closed-bar policy, row count, schema version, and export provenance.
2. Add independent SHA-256 preflight for candle and news CSV bytes; compare against metadata and exact run inputs before training.
3. Bind every report and model manifest to commit SHA, workflow run ID, artifact ID/digest, dataset hashes, calendar hash, feature schema hash, code version, and random seeds.
4. Fail closed on mismatch, missing news data, non-UTC/naive timestamps, duplicate bars/events, incomplete coverage, or unclosed bars.
5. Preserve the verified Exness calendar scope 2022-07-21 through 2026-10-30 UTC and the existing +/-30-minute blackout. Never synthesize missing calendar rows.

### B. Label redesign (P1 research, not a gate relaxation)
The current 12-bar direction label does not represent the actual fixed-SL/TP trade outcome. Build a separate research target using a causal triple-barrier / first-hit event label:
- Entry only at the next executable bar after a fully closed signal bar.
- Record whether stop, target, or time barrier is hit first; include same-bar ambiguity with conservative stop-first handling.
- Deduct spread, commission, slippage and financing where applicable; retain gross and net outcomes.
- Avoid overlapping labels or explicitly model overlap; purge at least the maximum label horizon and apply embargo at fold boundaries.
- Store realized R multiple, net expectancy, MAE/MFE, holding time, and outcome class.
- Keep the existing 12-bar direction task as a diagnostic comparator, not a proxy for win probability.

### C. Causal SMC audit (P1)
Create candidate-level traces on closed signal bars with source candle indices and timestamps:
- BOS20 versus structural BOS and structural CHoCH as separate fields.
- Three-higher-lows-plus-green rule with pivot confirmation time (not future-known pivot data).
- OB origin candle, interval, range %, distance, validity, close-through invalidation time, and whether price is inside/outside the zone.
- FVG creation candle, interval, first refill, full mitigation, invalidation, and age under the existing 48-bar rule.
- Same-bar availability matrix for all four scored components.
- Add tests proving no component uses a pivot or candle not yet confirmed at signal time.
Do not alter the scoring weights, lookbacks, or >=85 threshold in the frozen benchmark.

### D. Predictive modeling and calibration (P2)
1. Establish simple baselines first: always-hold, class prior, regularized logistic, and a small tree model.
2. Compare XGBoost and LSTM against baselines using identical chronological folds and the same candidate universe.
3. Fit any calibrator (Platt/isotonic/temperature scaling) only on inner chronological validation predictions; never calibrate on outer test or final OOS.
4. Report Brier score, log loss, ECE, reliability bins, class-wise precision/recall, balanced accuracy, macro-F1, and confusion matrices.
5. Use feature importance only as a diagnostic; add permutation/ablation tests within training/validation folds. Investigate time-of-day and volume dominance, regime drift, and long-class underprediction.
6. Prefer a simpler model if it matches or exceeds the complex ensemble out of sample.

### E. Strategy and execution research (P2)
- Separate signal quality from execution quality. Replay entry timing, spread, slippage, commission, stop/target ordering, gaps, and one-position constraints.
- Calculate expectancy in R, profit factor, win rate, average win/loss, max drawdown, exposure, turnover, and trade count per fold.
- Require stability across chronological folds and market regimes; report uncertainty intervals and sensitivity to plausible cost increases.
- A no-trade result is valid evidence. Do not force a minimum trade count by lowering gates.

## 4. Validation protocol

1. Use training data and inner chronological validation for all feature selection, hyperparameters, calibration, and challenger selection.
2. Use nested walk-forward with a 12-bar purge at minimum; increase purge to cover the maximum outcome-label horizon if longer.
3. Keep final OOS (starting 2026-07-01) untouched until the research design, feature set, thresholds, model, and execution assumptions are frozen and versioned.
4. Run one final evaluation per frozen candidate. If it fails, do not tune against that final OOS; collect new future data or establish a newly preregistered holdout.
5. Acceptance requires >=30 closed OOS trades, positive net profit after costs, PF >1.0 (development target >=1.2), accuracy above the appropriate baseline where classification accuracy is relevant, all benchmark gates intact, and no material fold/regime collapse. Also report confidence intervals; 30 trades is a minimum floor, not strong statistical proof.
6. If the frozen benchmark cannot generate 30 trades, report insufficient evidence rather than relax its conditions.

## 5. Phased implementation and deliverables

- **P0 — Provenance:** independent byte-hash preflight, immutable run manifest, artifact/report binding, fail-closed tests.
- **P1 — Causal diagnostics:** candidate-level SMC traces and no-lookahead tests; produce a diagnostic report without changing signal logic.
- **P2 — Outcome labels and baselines:** build first-hit net-outcome labels and chronological baseline evaluation.
- **P3 — Model comparison:** XGB/LSTM/simple models, inner-fold calibration, ablation and drift analysis.
- **P4 — Execution validation:** realistic cost stress tests and fold-level expectancy analysis.
- **P5 — Untouched OOS:** only after sign-off on methodology; one frozen evaluation, then report whether the edge exists.

Each phase must land as a small reviewable commit with tests and an artifact. Do not merge this draft or PR #66, and do not deploy until the user separately approves after every performance gate passes.

## 6. Required report schema

Every run should include:
- source commit, workflow run, artifact ID/digest;
- candle/news SHA-256, coverage, schema, row counts, UTC and closed-bar validation;
- label definition and horizon, purge/embargo, fold boundaries;
- candidate counts and causal component traces;
- baseline and model metrics per fold and aggregate;
- calibration diagnostics and class distributions;
- closed trades, gross/net P&L, costs, PF, expectancy in R, drawdown, win rate;
- frozen-rule fingerprint and explicit confirmation that no benchmark gate changed;
- final OOS access flag proving whether the holdout was untouched.

## 7. Safety and release status

Research-only. Order Submission OFF. Live Trading OFF. Deployment OFF. No secrets in repository or logs. No claim of positive performance until supported by a reproducible untouched OOS artifact. This document is a research architecture proposal, not evidence of profitability.


## Implementation status update — 2026-10-31

P0 has a first implementation on the separate benchmark branch in [Draft PR #66](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/66):
- `tools/verify_wave3_news_calendar.py` independently hashes the raw bytes of the canonical Git-tracked news CSV and fails closed against the pinned 64-character SHA-256.
- The Wave3 training workflow runs this check before schema, coverage, and model-training steps.
- A focused regression test covers the canonical input, modified bytes, and malformed expected digest; SMC/Wave3 CI now includes it.
- The downloaded run #3 artifact (#13028341403) confirms the same canonical CSV digest in both report and model manifest.

This does **not** close terminal-source provenance: the old PR description's terminal digest is only 58 hex characters and the claimed terminal byte count differs from the canonical Git file. Raw MT5 Common Files CSV and Experts log verification remains required. P0 should be considered partially implemented until this terminal evidence is reconciled and exact-head CI passes.

Run #3 remains a failed strategy-performance evaluation (41.3246% accuracy vs 45.9708% majority baseline, 0 closed trades, $0 net, PF unavailable). No benchmark gate or strategy parameter was changed. PR #147 remains design-only and Draft; P1 causal SMC traces, P2 outcome labels, P3 calibration/model comparison, P4 execution-cost robustness, and P5 untouched OOS are still pending.

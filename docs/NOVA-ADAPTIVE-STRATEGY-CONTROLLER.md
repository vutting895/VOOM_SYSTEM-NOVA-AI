# NOVA Adaptive Strategy Controller — Phase 1

**Status:** Draft / research-only / stacked on PR #308  
**Policy:** Reuse existing engines; fail closed; no broker execution  
**Base chain:** main 1604dab1083e6eedc21d23dfc959b79991e90636 → PR #308 head 492cc33a6187c8a1f4d736e900f4e119de46a522 → this branch

## 1. Audit findings and reuse decisions

| Existing component | Current evidence | Decision |
|---|---|---|
| Wave3 v6.2.6.3 | PR #66 is Draft; recorded Final OOS has 0 closed trades, accuracy below majority baseline and no demonstrated edge | Preserve as frozen benchmark; registry status BLOCKED |
| Wave3 positive-edge work | PR #147 is separate research/challenger work | Keep separate; do not fold into this controller |
| SMC Mean Rejection | New causal research plugin in PR #308; exact-head CI currently reports CircleCI error and Netlify preview failure | Reuse as first research adapter only; do not claim validated performance |
| XGBoost / PyTorch LSTM | Wave3 branch research models; calibration not verified | Supporting diagnostics only; no standalone vote or ensemble weighting |
| Quant Engine | Main has deterministic OHLCV/hash/split/experiment primitives; PR #308 carries newer SMC integration | Reuse; do not create a second dataset or walk-forward framework |
| Strategy Registry | Existing PR #118 is stacked on old PR #94; both branches are 252 commits behind current main in the latest compare | Port the registry concept to the current PR #308 lineage rather than merge stale stacked branches |
| NOVA QUANTUM EA | PR #310 is a safe source scaffold; empty OnTick, no signal pipeline, no compile/Strategy Tester evidence | Keep separate from Python research controller; no EA execution integration in Phase 1 |

The controller is not a new strategy engine. It is a policy layer that chooses whether an existing, registered research adapter is eligible for a given market, timeframe and externally supplied regime.

## 2. Registry lifecycle

- RESEARCH-ONLY: an adapter exists and may be selected for offline research analysis/simulation after data gates pass.
- BLOCKED: an adapter must never be selected until its evidence blockers are explicitly resolved.
- CATALOG-ONLY: a placeholder without a tested adapter; it is not runnable.

Initial registry:
- smc-mean-rejection: RESEARCH-ONLY, XAUUSDm, H4 bias + M5 entry, trend/transition regimes.
- wave3-v6.2.6.3: BLOCKED; keep all frozen rules and Final OOS artifacts unchanged.
- ai-market-scout: CATALOG-ONLY.
- XGBoost and PyTorch LSTM are supporting models only. signal_vote_enabled=false until calibration and independent OOS evidence pass.

## 3. Adaptive selection policy

Version: rule-based-regime-eligibility.v1

1. Accept research mode only. Any live/execute mode is rejected.
2. Require PASS data quality, canonical SHA-256, closed bars only, and freshness within the supplied maximum age.
3. Match exact instrument and timeframe contract.
4. Match a regime label produced by a separately validated feature pipeline. The controller does not infer regimes from raw candles.
5. Exclude BLOCKED and CATALOG-ONLY strategies.
6. Select by stable registry priority only. Priority is a deterministic tie-break, not a performance ranking.
7. If no candidate passes, return NO_ELIGIBLE_STRATEGY; never force a signal.
8. Return no signal, no position size and no risk budget. Execution/order/live flags are hard-coded false.

**Important limitation:** with the initial registry, SMC Mean Rejection is the only eligible adapter. This is a controlled integration baseline, not evidence of multi-strategy optimization. Adaptive weighting, XGBoost/LSTM voting and strategy fusion are intentionally deferred until calibrated OOF evidence and independent walk-forward/OOS tests exist.

## 4. Architecture boundary

Verified OHLCV + immutable manifest
             |
             v
Quant data-quality / SHA / closed-bar gates
             |
             v
Validated market context + regime label
             |
             v
Strategy Registry ---- Supporting Model Registry
             |                   |
             v                   v
Adaptive Eligibility       XGB/LSTM diagnostics only
             |
       +-----+------+
       |            |
   SMC eligible   No eligible adapter
       |            |
       v            v
Research analysis  Abstain / no signal
       |
       v
Simulation + evidence report

Broker / MT5 / EA execution: NOT CONNECTED

## 5. Test matrix

| ID | Scenario | Expected result |
|---|---|---|
| REG-01 | Valid registry schema and unique IDs | PASS |
| REG-02 | Any order/live flag set true | Reject catalog |
| REG-03 | Duplicate strategy/model ID | Reject catalog |
| SEL-01 | XAUUSDm, H4/M5, trend, valid closed data | Select SMC research candidate |
| SEL-02 | XAUUSDm, H4/M5, transition | Select SMC research candidate |
| SEL-03 | Range regime | Abstain |
| SEL-04 | Unsupported symbol or timeframe | Abstain |
| SEL-05 | Wave3 lifecycle BLOCKED | Reject Wave3 |
| SEL-06 | AI Market Scout CATALOG-ONLY | Reject Scout |
| DATA-01 | Quality status not PASS | Reject request |
| DATA-02 | Invalid SHA-256 | Reject request |
| DATA-03 | Forming/unconfirmed candle present | Reject request |
| DATA-04 | Data age exceeds maximum | Reject request |
| MOD-01 | XGBoost/LSTM uncalibrated | No model votes |
| SAFE-01 | Mode is live/execute | Reject request |
| SAFE-02 | Any controller result | No signal/risk sizing/orders/execution |
| DET-01 | Identical input repeated | Identical output |

The synthetic tests validate policy behavior only. They are not a market backtest and cannot establish expectancy, profitability or live readiness.

## 6. Required next validation

- Run the 15 unit tests on this exact PR head.
- Verify PR #308 exact-head SMC tests and hosted checks; current base-head status is CircleCI ERROR and Netlify preview FAILURE.
- Reconcile PR #66 and #147 against current main without combining their benchmark/challenger histories.
- Add regime classifier only after its causal feature definitions and timestamp alignment are tested.
- Add model adapters only after OOF probability calibration, cost-aware walk-forward, untouched Final OOS and baseline comparisons pass.
- Keep Exness Demo read-only. Do not add an order path or connect this controller to NOVA QUANTUM execution.

## 7. Acceptance gates

Phase 1 is accepted only when registry/controller unit tests pass on the exact head and code review confirms fail-closed behavior. Research performance approval is a separate gate. Production, EA integration and trading authorization are out of scope and remain disabled.

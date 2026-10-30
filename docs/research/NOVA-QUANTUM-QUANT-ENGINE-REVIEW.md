# NOVA Quantum Quant Engine — research and implementation review

**Review date:** 2026-10-31  
**Operating boundary:** Read-only + AI Analysis. No broker order submission, pending order creation, or live trading.

## Executive decision

Adopt a **classical-first hybrid architecture**. Use a trained classical classifier (initially regularized logistic regression) as the production baseline. Keep PennyLane VQC as an optional research backend. Do not describe the submitted risk formula as QAOA: QAOA needs an explicit combinatorial objective/cost Hamiltonian, mixer Hamiltonian, parameterized alternating circuit and optimization loop. The supplied code has none of these; it divides a fixed risk budget by a hard-coded pip-value assumption.

Quantum methods are relevant research candidates in finance, but relevance is not evidence of a practical speedup. A 2023 Nature Reviews Physics article surveys candidate applications and resource constraints. A 2026 systematic QML review recommends comparison with tuned classical models and full resource accounting; it reports parity at best and frequent classical superiority for supervised learning on classical data under such comparisons.

## Audit of the supplied implementation

| Area | Finding | Correction |
|---|---|---|
| Input data | Forecast uses a constant four-number vector. | Require caller-supplied, validated features. |
| Training | Random circuit weights are never fitted. | Require labelled data and chronological holdouts. |
| Reproducibility | Global, unseeded NumPy randomness. | Use seeded initialization. |
| Feature shape | Four features fail when qubit count differs. | Enforce configured feature count. |
| Fallback | Missing PennyLane returns a fabricated bullish regime. | Use trained classical model or return unavailable. |
| Risk formula | Assumes $10 pip value per lot and USD account currency. | Require broker loss in account currency or explicit account-currency pip metadata. |
| Minimum volume | Forcing 0.01 lots can violate risk cap. | Floor to broker step; reject below minimum. |
| Instrument rules | No conversion currency, contract size, tick size/value or non-FX handling. | Do not infer pip rules; consume broker metadata. |
| Trade decision | Always emits BUY_STOP without signal/entry/stop validation. | Separate forecast and sizing; authorize no direction or order. |
| QAOA label | No QUBO, Hamiltonian, mixer, circuit or optimizer exists. | State QAOA is not used. |

## VQC versus classical baseline

| Dimension | Classical baseline | VQC research backend |
|---|---|---|
| Input | Standardized numeric features | Same features need an encoding map |
| Training | Conventional numerical optimization | Hybrid quantum-classical parameter optimization |
| Runtime | CPU-friendly and easy to profile | Simulation can be expensive; hardware adds shots, queue, noise and connectivity costs |
| Reproducibility | Seeded initialization; deterministic numerical path | Fixed simulator settings can be reproducible; hardware sampling adds variance |
| Evaluation | Chronological split, leakage controls, tuned baselines | Same checks plus qubits, circuit depth, shots and full execution cost |
| Role | Default production candidate | Shadow/research candidate only |

### Benchmark gate

Use identical point-in-time features, labels, chronological train/validation/test windows, purge/embargo when target horizons overlap, and the same candidate universe. Tune inside training folds only. Report balanced accuracy, macro-F1, Brier score/calibration, log loss, inference latency, training time, simulator/hardware time, circuit depth, qubits, shots, seed variance and confidence intervals. Evaluate trading outcomes separately using spread, fees, slippage, realistic fills and unchanged risk controls. Preserve an untouched final OOS period and require a pre-registered acceptance margin versus the best tuned classical baseline. Training accuracy or one favorable seed is not quantum advantage.

## Risk-sizing contract

Provide exactly one of:

1. loss_per_lot_account_ccy: broker-calculated loss for one lot from actual side, symbol, entry and stop prices, already in account currency. Preferred. MetaTrader 5 exposes order_calc_profit to estimate P&L in account currency.
2. pip_value_per_lot: pip value already converted to account currency, paired with stop distance in pips. Caller must know instrument pip convention and conversion; the module does not convert currencies.

Account currency and broker minimum/maximum/volume-step metadata are mandatory. Volume is floored to broker step and capped at broker maximum. Values below minimum are rejected, never rounded up. Estimated stop loss must remain at or below account balance times risk percent; requested risk cannot exceed the 2.0% cap.

The estimate excludes gaps, commissions, swaps, slippage and feed/execution failures unless included in the broker-derived loss estimate. A stop may fill beyond its nominal price in a gap. The legacy risk_usd key is populated only for USD accounts; use risk_budget_account_ccy and estimated_stop_loss_account_ccy.

## Integration recommendation

- Add the engine under workers/quantum/; do not overwrite integrations/nova-ai-mcp-full-clean/workers/data_ingestion/main.py, an unrelated ingestion entry point.
- Invoke sizing only after tenant authorization, broker metadata, data freshness, signal and stop checks.
- Keep execution outside this module. Responses state order_submission_enabled=false and live_trading_enabled=false.
- Unit tests need no broker session, credentials, secret or production setting.

## Verification plan

1. Run python -m unittest discover -s tests -p 'test_quantum_quant_engine.py'.
2. Run Python compile/import checks under supported versions.
3. When PennyLane is installed, run a seeded simulator smoke test and benchmark against the classical baseline on identical chronological splits.
4. Add tests using actual broker volume constraints and currencies for FX, metals, indices and crypto CFDs; prove each sizing result stays within budget.
5. Do not call production-ready until broker metadata, conversion, fee/slippage treatment, stale-data blocking and NOVA policy integration are verified.

## References

- PennyLane Variational classifier (updated 2026-04-17): https://pennylane.ai/demos/tutorial_variational_classifier
- PennyLane Intro to QAOA (updated 2026-04-21): https://pennylane.ai/demos/tutorial_qaoa_intro
- PennyLane QAOA cost module: https://docs.pennylane.ai/en/stable/_modules/pennylane/qaoa/cost.html
- MetaQuotes order_calc_profit Python API: https://www.mql5.com/en/docs/python_metatrader5/mt5ordercalcprofit_py
- MetaTrader 5 Market Watch instrument properties: https://www.metatrader5.com/en/terminal/help/trading/market_watch
- Quantum computing for finance, Nature Reviews Physics (2023): https://www.nature.com/articles/s42254-023-00603-1
- Doosti et al., review of quantum ML for financial services (2026-04-08): https://doi.org/10.1088/2632-2153/ae51df
- 2026 systematic review of quantum ML: https://www.sciencedirect.com/science/article/pii/S0957417426010407


## 2026-10-31 requested capability coverage and delivery roadmap

The current PR is a **VQC research prototype**, not yet the complete three-pillar Quantum Engine requested for NOVA. Keep the following distinctions explicit.

| Requested capability | Current evidence in this PR | Status / next gate |
|---|---|---|
| Quantum time-series forecasting (QLSTM / PQC) | A four-wire PennyLane VQC classifier with angle embedding and trainable RY/CNOT layers. It is evaluated on `default.qubit`. | **Partial.** No recurrent hidden state, LSTM gates, temporal sequence input, approved feature schema, or market-data experiment exists. First prove the VQC on point-in-time features against classical logistic/XGBoost/LSTM baselines; only then prototype a genuine recurrent QLSTM cell. |
| Portfolio / risk optimization (QAOA / VQE) | The current `run_qaoa_risk_filter` is explicitly a compatibility alias for deterministic arithmetic sizing and reports `qaoa_executed=false`. | **Not implemented.** Do not call this QAOA/VQE. Define an explicit constrained portfolio objective and QUBO/Ising mapping, then implement a small QAOA/VQE simulator experiment and compare with exact enumeration plus strong classical solvers. |
| Quantum reinforcement learning (QRL) | No policy network, environment, reward function, critic, replay/trajectory store, or RL training loop is present. | **Not implemented.** Start with a classical RL baseline and offline simulation. A VQC policy is a separate research plugin; it must not output live lot sizes or invoke broker tools. |

### Ordered implementation phases

**Q0 — Preserve the existing NOVA Quant foundation.**  
Treat PR #94 (dataset quality, hashes, chronological splits and walk-forward windows), PR #98 (overlap/purge/gap hardening), PR #96 (umbrella research tracker), PR #97/#99 (Deep Research Core), and this PR as one dependency graph. The Quantum code must consume the same immutable dataset/run contracts and evaluation windows; it must not create an independent ingestion, experiment identity, split, risk, or broker stack. Before merging, reconcile the `workers/quantum/` package with the `workers/quant_engine/` foundation so there is one Quant compute plane and one clearly named Quantum backend boundary.

**Q1 — Approve point-in-time feature and label contracts.**  
The current four numeric inputs are not market features. Define immutable ordered feature IDs, units, transforms, warm-up and null rules, source timestamps, instrument/timeframe identity, and the exact target-label economic meaning and forward horizon. Generate each historical feature only from information available at its `as_of` timestamp. Add look-ahead, future-mitigation, stale-data, gap, duplicate, schema-order and deterministic replay tests. Fit every scaler/transform on the training partition only.

**Q2 — Establish classical parity before quantum experiments.**  
On the same dataset snapshots, run regularized logistic regression and relevant tuned classical comparators (for example gradient-boosted trees and LSTM only where temporal inputs justify them). Use nested/purged chronological walk-forward validation, identical search budgets where feasible, transaction-cost assumptions for any trading simulation, and an untouched final OOS set. Report balanced accuracy, macro-F1, log loss, Brier/calibration, regime-specific confusion, stability across seeds/windows, and confidence intervals. A training-loss reduction is not an acceptance result.

**Q3 — Evaluate the VQC and then QLSTM separately.**  
Label the present `default.qubit` execution as **state-vector simulation**. PennyLane's `AngleEmbedding` maps no more than one feature per wire to RX/RY/RZ rotation angles; this is an encoding operation, not proof that high-dimensional data has been processed faster. Record qubits, circuit depth, gates, simulator/device, shots, optimizer steps, initialization, wall-clock training and inference time. For QLSTM, specify the recurrent state and input/forget/output gate semantics, parameter sharing, sequence window, gradient method and memory cost; compare it against a tuned classical LSTM on the exact same chronological folds. Do not describe the current feed-forward VQC as QLSTM.

**Q4 — Implement QAOA only after the portfolio objective is specified.**  
Define the investment universe and binary/encoded decision variables, expected-return and covariance estimates, risk aversion, budget, cardinality, concentration, sector, turnover and transaction-cost constraints. Document penalty scaling and prove that the QUBO/Ising mapping preserves the intended feasible set. For a first small-universe experiment, compare QAOA (cost Hamiltonian + mixer + parameterized alternating circuit + classical optimizer) and/or VQE against exact enumeration and strong classical quadratic/mixed-integer solvers. Report feasibility rate, objective gap, approximation ratio, solution stability, total end-to-end latency, QPU shots/time and cost. VQE is not automatically a substitute for a correctly formulated QAOA problem.

**Q5 — Prototype QRL offline; do not put it on the execution path.**  
Define the market simulator, observation availability, action space, reward net of fees/spread/slippage, risk constraints, episode boundaries and out-of-sample regime splits. First benchmark PPO/DDPG or another appropriate classical policy. Only then compare a VQC policy using identical state/action/reward contracts and compute budgets. Include seed variance, drawdown, turnover, tail loss and policy stability. The result is a research policy score, never an order or broker authorization.

**Q6 — Private integration only after research acceptance.**  
The existing chat route and Cloudflare Workers do not host this Python package. Keep heavy training/backtests in an isolated Python compute plane; use the existing NOVA System Integration Hub for authentication, tenant ownership, idempotency, job authorization and audit correlation. Choose a private authenticated adapter or reviewed Node inference port through an ADR. Do not add an unauthenticated endpoint, public Python subprocess in an Edge Worker, a second MCP server, or direct browser-to-model access. Missing, stale, malformed or cross-tenant data must fail closed.

### Latency and quantum-advantage policy

Do not claim microsecond lot sizing or a general quantum speedup. The present simulator uses classical state-vector computation; hardware access adds circuit submission, shots, queue/session, measurement, error and classical feedback costs. A 2026 QRL portfolio preprint explicitly identifies cloud infrastructure latency as a practical deployment limitation. Hardware gate time alone is not end-to-end decision latency.

Benchmark separately:
- offline training time;
- local simulator inference;
- hardware circuit execution and shot count;
- queue/session and classical feedback overhead;
- end-to-end feature-to-result latency under realistic load;
- operating cost and reliability.

Only use the terms **quantum advantage** or **faster than classical** after an independently reproducible, statistically supported out-of-sample comparison against tuned classical baselines with equal problem definitions and complete end-to-end resource accounting.

### Safety invariant

All phases remain research-only. The Python package has no broker credentials, broker-write API, order direction, order submission, position mutation or live-trading switch. Any future advisory size must still be recomputed/validated by the independent NOVA risk policy using current broker/account metadata; this package cannot set or relax that policy. Exness Demo remains read-only, `ordersEnabled=false`, `executionEnabled=false`, and Live Trading OFF.

### Additional technical references

- PennyLane AngleEmbedding (feature-to-rotation mapping): https://docs.pennylane.ai/en/stable/code/api/pennylane.AngleEmbedding.html
- PennyLane QNode and differentiation methods (including simulator-only backprop): https://docs.pennylane.ai/en/stable/code/api/pennylane.QNode.html
- Qiskit QAOA algorithm contract (problem Hamiltonian, mixer, circuit repetitions and classical optimizer): https://qiskit-community.github.io/qiskit-optimization/stubs/qiskit_optimization.minimum_eigensolvers.QAOA.html
- 2026 QRL portfolio preprint (notes cloud infrastructure latency limitation): https://arxiv.org/abs/2601.18811
- 2026 QAOA portfolio benchmark study (reports hardware shot/sub-job overhead): https://pmc.ncbi.nlm.nih.gov/articles/PMC13512001/
- 2026 systematic review of QML in finance (discusses NISQ, encoding bottlenecks and lack of broad benchmarking): https://www.sciencedirect.com/science/article/pii/S2666764926000019

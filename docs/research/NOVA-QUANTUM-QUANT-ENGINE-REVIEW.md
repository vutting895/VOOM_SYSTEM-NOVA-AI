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

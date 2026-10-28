# Further Research Backlog

Updated: 2026-10-23

This backlog prioritizes research that can materially improve reliability, test quality and maintainability. Each topic needs a reproducible experiment before adoption.

## Priority 0 — safety and correctness

- **Order lifecycle/state reconciliation:** compare EA local state against broker positions, orders and deal history after restart or reconnect; fail closed if inconsistent.
- **Broker-aware position sizing:** calculate risk using tick size/value, contract size, account currency, stop distance, volume min/max/step and margin checks; test non-FX symbols such as GOLD.
- **Execution quality telemetry:** record intended price, fill price, spread, slippage, latency, retcodes, rejected requests and close reason.
- **API resilience:** timeout, malformed JSON, invalid signature, stale response, retry policy, idempotency key and fail-closed behavior. Never retry an order submission blindly.
- **Secrets and deployment:** keep keys in environment/secret stores; rotate compromised keys; redact credentials from logs; separate demo and live configuration.

## Priority 1 — strategy validation

- **Walk-forward and nested validation:** optimize only inside training windows, use inner validation for selection and reserve a final untouched period.
- **Backtest-overfitting audit:** record all strategy variants tried; evaluate parameter stability rather than selecting the single best run.
- **Regime analysis:** measure performance separately in high/low volatility, trend/range, session, spread and news-sensitive periods.
- **Ablation tests:** compare the same baseline with one feature added at a time (Elliott Wave, FVG, order block, sweep, AI veto) to determine incremental value.
- **Monte Carlo trade-order stress:** resample trades or perturb execution assumptions to estimate drawdown uncertainty; do not mistake it for a substitute for market replay.
- **Cost sensitivity:** stress spread, commission, swap, slippage and missed fills to see whether edge survives plausible deterioration.

## Priority 2 — ML and data quality

- **Label design:** avoid labels that use future bars in feature construction; document entry, horizon, stop/target and overlap rules.
- **Leakage checks:** align features to the exact decision timestamp; use only closed bars where required; test feature/label time boundaries.
- **Probability calibration:** evaluate reliability diagrams, Brier score and threshold performance; do not treat raw model scores as calibrated probabilities.
- **Drift monitoring:** track feature distribution, missingness, signal frequency, calibration and realized outcomes; freeze model promotion if data contracts break.
- **ONNX parity:** compare Python and MQL5 feature vectors and predictions on fixed fixtures within defined numerical tolerances.
- **Simple baselines first:** compare heuristic rules, logistic regression and tree models before larger neural networks or reinforcement learning.

## Priority 3 — platform and dashboard

- **MQL5 code quality:** compile warnings, handle/indicator lifecycle, `CopyBuffer` return counts, series indexing, symbol digits/tick size, trade retcodes and `OnTradeTransaction` event handling.
- **Python quality:** typed configuration, deterministic runs, unit tests, pinned dependencies, structured logs and clear shutdown behavior.
- **Worker/API contracts:** schema validation, authentication, versioning, rate limits, observability and health checks without exposing secrets.
- **Web dashboard:** clear Demo/Live status, risk lockout, stale-data indicator, open exposure, signal explanation, audit trail and explicit confirmation for dangerous actions.
- **Accessibility and responsive UX:** keyboard navigation, sufficient contrast, semantic labels, readable tables and mobile-first risk cards.

## Go/no-go gates

1. No secret appears in tracked files or logs.
2. EA/Python/Worker contract tests pass, including timeout and malformed response cases.
3. Risk sizing and hard stops pass regression tests and fail closed on missing data.
4. Backtest is reproducible and includes realistic costs and broker symbol rules.
5. Performance survives out-of-sample and walk-forward evaluation without tuning on the final test set.
6. Demo forward test shows correct execution/reconciliation before any live deployment decision.

## Reading list

- MQL5 Python integration: https://www.mql5.com/en/docs/python_metatrader5
- MQL5 ML article collection: https://www.mql5.com/en/articles/machine_learning
- MQL5 strategy testing: https://www.mql5.com/en/articles/strategy_tester
- MQL5 walk-forward efficiency: https://www.mql5.com/en/articles/23250
- MQL5 validation and overfitting: https://www.mql5.com/en/articles/21603
- MQL5 execution-quality diagnostic article hub: https://www.mql5.com/en/articles/strategy_tester
- Python testing documentation: https://docs.pytest.org/
- TypeScript handbook: https://www.typescriptlang.org/docs/
- Cloudflare Workers documentation: https://developers.cloudflare.com/workers/
- WCAG 2.2 overview: https://www.w3.org/TR/WCAG22/

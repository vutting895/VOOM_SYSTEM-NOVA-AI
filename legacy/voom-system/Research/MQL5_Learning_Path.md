# MQL5 Learning Path for VOOM AI SNIPER

Updated: 2026-10-23

## Goal
Build a reliable learning pipeline from official MQL5 documentation and carefully evaluated community articles into testable changes for VOOM. Articles are learning material, not proof that a strategy is profitable.

## Recommended study order

1. **MQL5 language and event model** — understand `OnInit`, `OnTick`, `OnTimer`, `OnTradeTransaction`, indicator handles, `CopyBuffer`, symbol properties, and trade result codes. Start with the official Reference: https://www.mql5.com/en/docs
2. **Strategy Tester and execution realism** — compare Every tick based on real ticks where available; account for spread, commission, swap, slippage assumptions, symbol sessions, and broker contract settings. Keep test settings and data range in each report. Reference: https://www.mql5.com/en/articles/strategy_tester
3. **Python integration** — use the official `MetaTrader5` package for bars/ticks, account and symbol metadata, orders, positions, history and order checks. Handle `initialize()` failures, `last_error()`, time zones, missing bars, and `shutdown()`. Reference: https://www.mql5.com/en/docs/python_metatrader5
4. **Machine learning fundamentals** — first prove a simple supervised baseline contains predictive information; compare it against a non-ML baseline before considering deep learning or reinforcement learning. Browse: https://www.mql5.com/en/articles/machine_learning
5. **Overfitting and validation** — use chronological splits, rolling/anchored walk-forward tests, a final untouched holdout, and multiple seeds when training stochastic models. Do not repeatedly tune against the final holdout. Relevant reading: https://www.mql5.com/en/articles/21603 and https://www.mql5.com/en/articles/23250
6. **Model deployment contract** — if exporting ONNX or connecting Python/Worker, version the feature order, units, normalization, label meaning, model version and threshold. Add parity tests proving the live EA calculates the same features as training. Article collection: https://www.mql5.com/en/articles/strategy_tester
7. **Risk controls** — treat risk sizing, max exposure, daily/weekly loss stops, spread/quote-age checks, duplicate-order protection and restart reconciliation as hard controls outside any model's discretion. Reading: https://www.mql5.com/en/articles/17640

## Research lessons worth keeping

- A model cannot create predictive information absent from its inputs. Test a simple baseline first.
- Accuracy alone is not a trading objective. Measure net expectancy after costs, profit factor, drawdown, tail losses, trade count, turnover and stability by regime.
- Every parameter search increases selection risk. Record how many variants were tried; prefer robust parameter regions over one isolated optimum.
- Use purging/embargo when labels overlap in time; ordinary random cross-validation can leak future information in time series.
- Validate on unseen periods and then demo-forward-test. A good historical result is not a promise of live profitability.
- Compare predicted signals with realized execution: spread, entry/exit slippage, latency, rejected orders and differences between tester and broker fills.
- Keep Elliott Wave, FVG, order blocks, liquidity sweeps and SMC rules as explicit hypotheses. Define them mechanically and test whether they add incremental out-of-sample value.

## VOOM-specific implementation priorities

1. Audit EA -> Python adapter -> Worker request/response schemas, timeouts, authentication, and fail-closed behavior.
2. Keep the Worker as a secondary veto only; it must not override EA direction, lot size, SL/TP or hard risk guards.
3. Make signal generation deterministic for a given closed-bar input; log feature values, model/version, veto reason, spread, intended order and broker result.
4. Add unit tests for sizing, invalid stops, lot-step rounding, symbol suffixes, missing data, stale quotes, API timeout, duplicate signals and daily-loss lockout.
5. Run a reproducible baseline and a production-strategy backtest separately; report the exact commit/version and assumptions.
6. Demo forward-test only after compile, regression tests, and data-flow checks pass. Do not enable live trading as part of research.

## Suggested experiment template

- Hypothesis and exact rule definition
- Symbol, timeframe, broker, date range and data source
- Training / validation / final test windows
- Features, labels, parameters, software versions and random seeds
- Costs: spread, commission, swap, slippage and rejected fills
- Metrics: net expectancy, profit factor, max drawdown, Sharpe/Sortino, exposure, trade count, regime breakdown
- Baseline comparison and ablation test
- Failure cases, limitations and go/no-go decision

## Selected MQL5 readings

- Machine-learning article hub: https://www.mql5.com/en/articles/machine_learning
- Python integration reference: https://www.mql5.com/en/docs/python_metatrader5
- Strategy Tester article hub: https://www.mql5.com/en/articles/strategy_tester
- Unified validation against backtest overfitting (13 Mar 2026): https://www.mql5.com/en/articles/21603
- Walk-Forward Efficiency Ratio (9 Jul 2026): https://www.mql5.com/en/articles/23250
- Risk Management integrated into an EA (17 Feb 2026): https://www.mql5.com/en/articles/17640
- RL gold trading pipeline; read for validation methodology, not as evidence of an edge (4 Sep 2026): https://www.mql5.com/en/articles/21314
- Hyperparameter selection audit (8 Oct 2026): https://www.mql5.com/en/articles/24238

## Evidence standard
Label findings as: **Official specification**, **Research method**, **Community implementation**, or **Unverified hypothesis**. Replicate code in an isolated branch and demo/test environment before integrating it. Never paste secrets, API keys, account IDs or passwords into articles, logs, source control or prompts.
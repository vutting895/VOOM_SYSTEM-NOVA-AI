# ACA Optimizer — Initial Research Validation

- Repository baseline: `821db357d70d3613b0ca61520eaae5c5307e8fd4`
- Research branch: `research/aca-optimizer-validation-20261125`
- Article: https://www.mql5.com/en/articles/22525
- Implementation status: reconstructed Python research module; not an MQL5 EA integration.
- Objective direction: maximize fitness. The benchmark objectives below are negative loss.
- Evaluation budget: 10,000 objective calls per run.
- Repeats: 10 deterministic seeds (0–9) per case and population size.
- Parameters: DP=0.5, PC=0.2; population sizes 2, 5, 10, 25.
- Coordinate handling: normalized [-1,1] domain before applying the article's four perturbation scales. This is an explicit engineering adaptation to mixed-unit EA parameters.

## Mean best fitness (higher is better; values closer to zero are better)

| Benchmark | Pop 2 | Pop 5 | Pop 10 | Pop 25 | Uniform random baseline |
|---|---:|---:|---:|---:|---:|
| Sphere 10D | -0.0000394 | -0.0001384 | -0.0005019 | -0.0038950 | -10.837789 |
| Rastrigin 10D | -0.0113773 | -0.3806213 | -1.8664288 | -5.8016857 | -72.034293 |
| Step-rounded 10D | 0.0000000 | 0.0000000 | 0.0000000 | -0.0030000 | -10.893000 |

Each value is the arithmetic mean of the best fitness over 10 independent seeds. ACA consistently outperformed uniform random search on these three synthetic 10D functions. Population 2 was strongest in these particular experiments; this is not evidence that it is universally optimal.

## Unit tests

Five tests passed locally:
- exact objective evaluation budget and bound enforcement;
- deterministic seeded execution;
- rejection of non-finite objective values;
- invalid population and insufficient evaluation budget;
- monotonic best-so-far history.

## Limitations / blockers

1. These are synthetic optimizer benchmarks, not XAUUSDm market tests.
2. No approved historical dataset was loaded; no trading PnL, Profit Factor, drawdown, spread, commission, or slippage was measured.
3. The repository's current MQL5 source `integrations/mt5/MTRADERS_All_In_One_v1.01.mq5` defines `NOVA_READ_ONLY_MODE true` and returns immediately from `OnTick()`; it is not an executable trading-strategy integration point.
4. The article itself says the DP/PC ranking/status mechanism is reconstructed from prior papers, not a verified canonical implementation.
5. No MQL5 compilation or MetaTrader Strategy Tester run was performed in this environment.

## Decision

ACA is a promising research candidate for low-dimensional bounded parameter search. Do not promote its parameters into an EA or use it for live trading. Next gate is an approved, provenance-verified XAUUSDm dataset and a leakage-safe objective evaluator with frozen OOS data.

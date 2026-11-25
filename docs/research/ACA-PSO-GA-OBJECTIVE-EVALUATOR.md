# NOVA Quant Optimizer Integration — Research Gate Report

Status: **IN PROGRESS / MARKET VALIDATION BLOCKED**

## Implemented on research branch

- Added a common optimizer interface for ACA, Particle Swarm Optimization (PSO), Genetic Algorithm (GA), and uniform-random baseline.
- All methods maximize the same finite objective and consume exactly the configured number of objective calls.
- Added a trade-metrics adapter for injected SMC/EA backtest runners. The runner must return closed trades with `net_pnl` after spread, commission, swap and slippage.
- Metrics: closed trades, net profit, profit factor, realized-equity maximum drawdown and win rate.
- Objective hard-gates fewer than 30 closed trades, non-positive net profit, PF <= 1, and drawdown at/above the configured limit (default 20%; research default only, not an approved live-risk policy).
- Added deterministic tests for repeatability, exact budgets, finite objectives, cost attestation, parameter mapping and trade metrics.

## Synthetic optimizer benchmark (not trading performance)

Executed 10 independent seeds (0–9), 10 dimensions, population 10, and exactly 10,000 objective calls per method per seed. Every method consumed 100,000 calls per synthetic objective. Higher (less negative) fitness is better.

| Synthetic objective | ACA mean best | PSO mean best | GA mean best | Random mean best |
|---|---:|---:|---:|---:|
| Sphere 10D | -0.000526 | approximately 0 | -0.214631 | -11.364246 |
| Rastrigin 10D | -1.866429 | -16.814762 | -25.152094 | -72.034293 |
| Step-rounded 10D | 0.000000 | 0.000000 | -0.600000 | -44.700000 |

ACA was strongest on the Rastrigin and step-rounded functions; PSO was strongest on Sphere and tied ACA on step-rounded. This is evidence only about these synthetic objective functions and this implementation/configuration. It does not select a trading optimizer. Full per-seed summaries are in `scripts/research/benchmark_optimizer_algorithms.py` and `docs/research/ACA-PSO-GA-SYNTHETIC-RESULTS.json`.

## Test evidence

Local Python validation: **11/11 tests passed** across ACA, optimizer budget/determinism and objective metrics; `py_compile` passed. Tests use synthetic numeric objectives and synthetic net trade records. They are unit tests only, not market backtests or evidence of trading edge. The local test harness used import shims for unrelated Quant Engine modules because a full repository checkout was unavailable. No full-repository CI run is claimed.

## Historical data candidate found, but not yet usable

- PR #197 is still **OPEN / NOT MERGED**. It contains a candidate-only Exness Demo XAUUSDm M15 dataset manifest: 101,076 bars, 2022-07-21 through 2026-10-29 UTC, CSV size 8,584,488 bytes, expected CSV SHA-256 `7d16e54327bfeabe9bd2c416548ee378f2bdb173827a494af7a7458c113c99d7`.
- The source metadata declares Demo/read-only provenance, spread points per bar, and XAUUSDm symbol specifications. Its metadata bytes hash to `82e8d8a08398358f24cd005a6f9a3ab5370fc6aa6c72553274e91cec083a45e6`, matching the manifest. This verifies the metadata payload and manifest agreement only.
- The CSV entry on the PR branch is a Git LFS pointer (132-byte pointer); the 8.58 MB data object was not available in the checked-out environment. Therefore the CSV SHA, row count, gaps, schema and OHLCV quality have **not** been independently verified here.
- The manifest explicitly labels this export `candidate_only` and states its SHA differs from the separately frozen Wave3 benchmark (`0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`). Do not replace the frozen benchmark or claim the candidate is an approved final-OOS source.
- PR #237 (Learning Engine) is also **OPEN / NOT MERGED**. The saved Colab readiness notebook requires the reviewed trainer, loader and dataset manifest on main, and refuses training if these dependencies are missing. PR #197 and #237 therefore remain upstream gates; no merge was attempted.
- Historical collector PR #269 and bridge PR #275 are also still open. They are a separate future ingestion path, not evidence that a live read/Datacenter receipt has occurred.

## Strategy integrity blocker

- Existing `workers/quant_engine/smc_mean_rejection_backtest.py` obtains BTC-USD data via yfinance at 1H/5M, not Exness XAUUSDm M15, and is not an approved source for this evaluation.
- Its `find_swing_points` scans a symmetric window (`i-lookback:i+lookback+1`) and assigns a swing to the historical center bar. That uses future bars to confirm a past swing and can leak information. In addition, order blocks are precomputed over the entire dataframe and the final 10 are queried for every earlier bar, which introduces further future leakage.
- No runner currently satisfies the causal, cost-inclusive callback contract. The objective adapter is infrastructure only; it has not generated strategy scores.

## Required protocol after data is made available

1. Retrieve the exact LFS object for the candidate dataset; verify byte size and SHA-256 against the manifest, then run `scripts/validate_exness_dataset.py` and independently inspect gaps/session alignment. Preserve the separate frozen Wave3 benchmark.
2. Collect/verify the source and receipt requirements; candidate historical data is not the same as a live Demo read/Datacenter ingestion receipt.
3. Repair and test causal SMC features; define all parameter bounds and discrete/continuous encoding before inspecting validation/OOS outcomes.
4. Use identical data, causal runner, cost assumptions, parameter bounds, seeds and evaluation-call budget for ACA, PSO, GA and random baseline. Suggested first comparison: 10,000 objective calls per method per seed, 10 fixed seeds, population size 10; publish per-seed outcomes. Report ACA population-size sensitivity separately.
5. Use expanding walk-forward folds with purge/embargo derived from maximum forward label/holding horizon. Test folds must not overlap. Keep final OOS beginning 2026-07-01 untouched by optimizer selection, feature selection and threshold tuning.
6. Report closed trades, net profit after all costs, PF, max drawdown, exposure, average trade, win rate, trade count per fold and dispersion across seeds/folds. Require >=30 closed final-OOS trades, positive net profit and PF >1; inspect robustness and drawdown before Demo.
7. Run Demo validation in read-only/monitor mode first. This module adds no broker write/order capability. Live Trading remains disabled.

## Decision

The optimizer and objective-evaluator foundations are implemented and synthetically tested. The candidate dataset manifest exists on an unmerged PR, but its LFS data bytes have not been verified. XAUUSDm M15 strategy comparison, walk-forward and final OOS remain **BLOCKED** until the actual data object, upstream dependencies and a leakage-free causal strategy runner are available. Do not describe the EA as validated or ready for installation.

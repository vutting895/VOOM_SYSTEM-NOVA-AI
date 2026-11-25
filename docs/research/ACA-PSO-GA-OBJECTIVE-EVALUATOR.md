# NOVA Quant Optimizer Integration — Research Gate Report

Status: **IN PROGRESS / MARKET VALIDATION BLOCKED**

## Implemented on research branch

- Added a common optimizer interface for ACA, Particle Swarm Optimization (PSO), Genetic Algorithm (GA), and uniform-random baseline.
- All methods maximize the same finite objective and consume exactly the configured number of objective calls.
- Added a trade-metrics adapter for injected SMC/EA backtest runners. The runner must return closed trades with `net_pnl` after spread, commission, swap and slippage.
- Metrics: closed trades, net profit, profit factor, realized-equity maximum drawdown and win rate.
- Objective hard-gates fewer than 30 closed trades, non-positive net profit, PF <= 1, and drawdown at/above the configured limit (default 20%; research default only, not an approved live-risk policy).
- Added deterministic tests for repeatability, exact budgets, finite objectives, cost attestation, parameter mapping and trade metrics.

## Test evidence

Local Python validation: 6/6 tests passed for the new optimizer/objective modules; `py_compile` passed. Tests use synthetic numeric objectives and synthetic net trade records. They are unit tests only, not market backtests or evidence of trading edge. The ACA module used was the branch source; the local test harness used import shims for unrelated Quant Engine modules because a full repository checkout was unavailable. No full-repository CI run is claimed.

## Data and strategy blockers

- The research branch tree contains no approved XAUUSDm M15 CSV/Parquet market dataset. The only matching data-related file found is source code, not historical market data.
- Historical collection dependencies remain open: PR #269 (bounded tenant-isolated history API) and PR #275 (bridge reconnect/account snapshot) are not merged. Work order WO-2026-11-25-003 requires a real Demo read and Datacenter receipt before collection is considered proven.
- Existing `workers/quant_engine/smc_mean_rejection_backtest.py` obtains BTC-USD data via yfinance at 1H/5M, not Exness XAUUSDm M15, and is not an approved source for this evaluation.
- Its `find_swing_points` scans a symmetric window (`i-lookback:i+lookback+1`) and assigns a swing to the historical center bar. That uses future bars to confirm a past swing and can leak information. Do not use it as an optimization runner until swing confirmation is timestamped at the actual confirmation bar and higher-timeframe features are forward-as-of aligned.
- No runner currently satisfies the causal, cost-inclusive callback contract. The objective adapter is infrastructure only; it has not generated strategy scores.

## Required protocol after data approval

1. Collect Exness Demo XAUUSDm M15 closed bars through the approved read-only bridge path. Preserve UTC, broker symbol, source, collection time, range, bar count, OHLC, tick volume, spread where available, and ingestion receipt. Reject duplicates, out-of-order bars, unexplained gaps and fabricated candles.
2. Freeze dataset manifest and SHA-256; validate quality before optimizer calls.
3. Repair and test causal SMC features; define all parameter bounds and discrete/continuous encoding before inspecting validation/OOS outcomes.
4. Use identical data, causal runner, cost assumptions, parameter bounds, seeds and evaluation-call budget for ACA, PSO, GA and random baseline. Suggested first comparison: 10,000 objective calls per method per seed, 10 fixed seeds, population size 10; publish per-seed outcomes. Report ACA population-size sensitivity separately.
5. Use expanding walk-forward folds with purge/embargo derived from maximum forward label/holding horizon. Test folds must not overlap. Keep final OOS beginning 2026-07-01 untouched by optimizer selection, feature selection and threshold tuning.
6. Report closed trades, net profit after all costs, PF, max drawdown, exposure, average trade, win rate, trade count per fold and dispersion across seeds/folds. Require >=30 closed final-OOS trades, positive net profit and PF >1; inspect robustness and drawdown before Demo.
7. Run Demo validation in read-only/monitor mode first. This module adds no broker write/order capability. Live Trading remains disabled.

## Decision

The software foundation for comparing ACA/PSO/GA/random and scoring a cost-inclusive backtest has been added. XAUUSDm M15 comparison, walk-forward and final OOS remain **BLOCKED** until the historical data receipt and a leakage-free causal strategy runner are available. Do not describe the EA as validated or ready for installation.

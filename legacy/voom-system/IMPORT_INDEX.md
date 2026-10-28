# Legacy import inventory

This folder preserves files from the original private repository [vutting895/Voom_system](https://github.com/vutting895/Voom_system), keeping their former paths below `legacy/voom-system/`. It is an archive for comparison, not an instruction to deploy every legacy component.

- **277 files** are imported under this archive path.
- The original repository remains unchanged for rollback.
- The root `README.md`, `.env.example`, and `.gitignore` were merged into canonical root versions because all three differed from NOVA's versions at initial comparison.
- Large historical datasets, compressed data, and large export bundles below were not copied, to avoid bloating the runtime repository. They remain in the source repository linked below.
- No source-repository files have been deleted. Do not delete or archive the source repo until excluded assets and runtime/deployment dependencies are reviewed.

## Excluded large data and export assets

| Original path | Size | Source |
|---|---:|---|
| `Backtest/data/XAUUSD_M15_external_gap_20211023_20220726.csv` | 1992.9 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/XAUUSD_M15_external_gap_20211023_20220726.csv) |
| `Backtest/data/XAUUSD_M15_hybrid_learning_input.csv` | 6513.1 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/XAUUSD_M15_hybrid_learning_input.csv) |
| `Backtest/data/XAUUSDc_M15_20211023_20261023.csv` | 6090.6 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/XAUUSDc_M15_20211023_20261023.csv) |
| `Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.csv` | 11306.7 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/XAUUSDc_M15_20211023_20261023_hybrid.csv) |
| `Backtest/data/XAUUSDc_M15_20231023_20261023.csv` | 4309.7 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/XAUUSDc_M15_20231023_20261023.csv) |
| `Backtest/data/external_candidates/XAUUSD_M15_EVTL_2021.json.gz` | 707.7 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/external_candidates/XAUUSD_M15_EVTL_2021.json.gz) |
| `Backtest/data/external_candidates/XAUUSD_M15_EVTL_2022.json.gz` | 716.2 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/data/external_candidates/XAUUSD_M15_EVTL_2022.json.gz) |
| `Backtest/results/adaptive_regime_learning_20261024_cycle2/equity_development.csv` | 3560.4 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_learning_20261024_cycle2/equity_development.csv) |
| `Backtest/results/adaptive_regime_learning_20261024_cycle2/equity_out_of_sample.csv` | 1412.0 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_learning_20261024_cycle2/equity_out_of_sample.csv) |
| `Backtest/results/adaptive_regime_learning_20261024_cycle2/equity_validation.csv` | 1414.3 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_learning_20261024_cycle2/equity_validation.csv) |
| `Backtest/results/adaptive_regime_selected_candidate_20261024/equity_development.csv` | 3560.4 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_selected_candidate_20261024/equity_development.csv) |
| `Backtest/results/adaptive_regime_selected_candidate_20261024/equity_out_of_sample.csv` | 1412.0 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_selected_candidate_20261024/equity_out_of_sample.csv) |
| `Backtest/results/adaptive_regime_selected_candidate_20261024/equity_validation.csv` | 1414.3 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_selected_candidate_20261024/equity_validation.csv) |
| `Backtest/results/adaptive_regime_v0_1_20261024/equity_development.csv` | 3286.9 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_v0_1_20261024/equity_development.csv) |
| `Backtest/results/adaptive_regime_v0_1_20261024/equity_out_of_sample.csv` | 1433.1 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_v0_1_20261024/equity_out_of_sample.csv) |
| `Backtest/results/adaptive_regime_v0_1_20261024/equity_validation.csv` | 1044.8 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/adaptive_regime_v0_1_20261024/equity_validation.csv) |
| `Backtest/results/ema12_26_rsi14_20261024/equity_development.csv` | 4372.0 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/ema12_26_rsi14_20261024/equity_development.csv) |
| `Backtest/results/ema12_26_rsi14_20261024/equity_out_of_sample.csv` | 1456.3 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/ema12_26_rsi14_20261024/equity_out_of_sample.csv) |
| `Backtest/results/ema12_26_rsi14_20261024/equity_validation.csv` | 1450.8 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/ema12_26_rsi14_20261024/equity_validation.csv) |
| `Backtest/results/ema12_26_rsi14_20261024/trades.csv` | 528.8 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/ema12_26_rsi14_20261024/trades.csv) |
| `Backtest/results/ema_rsi_divergence_20261024/ema_crossover_rsi_divergence_trades.csv` | 281.4 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/ema_rsi_divergence_20261024/ema_crossover_rsi_divergence_trades.csv) |
| `Backtest/results/ema_rsi_divergence_hybrid_20261024/ema_crossover_rsi_divergence_trades.csv` | 326.4 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Backtest/results/ema_rsi_divergence_hybrid_20261024/ema_crossover_rsi_divergence_trades.csv) |
| `Base44/export-code-system.html` | 210.6 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Base44/export-code-system.html) |
| `Dashboard/learning-control-plane.html` | 1484.8 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/Dashboard/learning-control-plane.html) |
| `nova/frontend/wix-export.html` | 1484.8 KiB | [source](https://github.com/vutting895/Voom_system/blob/main/nova/frontend/wix-export.html) |

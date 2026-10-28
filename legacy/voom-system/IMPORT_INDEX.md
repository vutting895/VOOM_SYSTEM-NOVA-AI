# Legacy import inventory

This folder preserves the text/code/configuration subset imported from the original private repository [vutting895/Voom_system](https://github.com/vutting895/Voom_system), maintaining the former paths below `legacy/voom-system/`. This is an archive for review and rollback, not an instruction to deploy every old component.

- **277 files** were imported under `legacy/voom-system/`; the import index itself is an additional file.
- The original repository remains unchanged.
- The root `README.md`, `.env.example`, and `.gitignore` were merged into canonical root versions because all three differ from NOVA's corresponding files. Those three files are not duplicated under the legacy archive.
- The 25 large historical datasets/export bundles listed below were deliberately not copied, to avoid bloating the runtime repository. They remain available in the source repository.
- No source-repository files have been deleted. Do not delete the source repo until excluded assets and runtime/deployment dependencies have been reviewed.

## Root files merged manually

| Original path | Why it was not imported at its old root path |
|---|---|
| `README.md` | Combined NOVA runtime documentation and legacy migration boundaries |
| `.env.example` | Combined placeholders while keeping secrets absent and trading disabled |
| `.gitignore` | Combined secret/runtime ignore rules for the canonical repository |

## Excluded large datasets and export assets (25)

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

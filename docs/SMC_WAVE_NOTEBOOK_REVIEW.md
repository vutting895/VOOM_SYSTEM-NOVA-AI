# SMC × Wave notebook integration review

Source: [AI_SNIPER_SMC_WAVE_FULL.ipynb](https://gist.github.com/vutting895/a8bab363bf19460b362a026115eaa263)

## Integration policy

- The original Gist is the upstream reference. Do not overwrite it.
- Keep this research integration isolated under `workers/backtest/`; do not connect it to `workers/execution/`, MT5, Alpaca order endpoints, or webhook execution.
- All runs must use historical OHLCV data and return `BACKTEST_ONLY` with `live_trading: false`.
- Do not commit notebook outputs, credentials, API tokens, webhook URLs, account IDs, or secrets.

## Initial source audit findings

The notebook contains repeated package-install/setup cells, Colab/Google Drive-specific paths, duplicated config-print cells, optional deep-learning/Optuna experiments, and broker/notification configuration mixed into the research notebook. These reduce reproducibility and create an unsafe boundary between research and execution.

A credential-like Telegram bot token and a trading webhook URL were present in the source configuration. Treat them as exposed: revoke/rotate them at their respective providers and remove them from any shared copies or execution history. Never paste replacement secrets into source control or chat.

The notebook's sample data and saved cell outputs are not evidence of a valid multi-year backtest. Any reported performance must be rerun from clean, timestamped historical data with transaction costs, slippage, out-of-sample evaluation, and data-quality checks.

## Backtest baseline added

`workers/backtest/smc_wave.py` provides:
- OHLC validation and deterministic EMA/RSI indicators;
- swing points that are marked only on their confirmation bar;
- a one-position historical simulation using next-bar-open entries;
- fees/slippage and conservative stop-first handling when stop and target are both touched;
- explicit `BACKTEST_ONLY` / `live_trading: false` output.

## Important limitations

This is a safe, testable baseline, not a full implementation of every SMC concept or a validated Elliott Wave 1–5/A–B–C counter. The baseline entry logic is EMA/RSI-based. SMC structure breaks, liquidity sweeps, order blocks, FVGs, and Elliott wave labeling must be implemented and separately tested before claims are made about them. Do not use these results for live trading.

## Local test

From the repository root:

```powershell
python -m pip install pandas
python -m unittest discover -s workers/backtest -p "test_*.py" -v
```

No broker credentials or live endpoints are required.

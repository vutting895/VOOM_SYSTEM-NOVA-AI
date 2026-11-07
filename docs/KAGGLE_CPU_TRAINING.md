# Kaggle CPU training

This is the free-CPU training path for NOVA. Import `notebooks/nova_cpu_training.ipynb` into Kaggle, attach one OHLCV dataset with **Add Input**, keep the accelerator set to **None / CPU**, then run all cells.

## Required input schema

A single CSV with timestamp, open, high, low, close, volume columns. Accepted timestamp aliases: `datetime`, `date`, `time`; accepted volume alias: `tick_volume`. Prices and volume must be numeric, timestamps valid and unique, and OHLC bounds consistent. If multiple CSVs are attached, set `DATA_FILE` to the intended file path in the notebook.

## Training behavior

- CPU only; no GPU is requested.
- Chronological split: 70% train, 15% validation, 15% final test.
- Features use past/current candles only; labels use the next 5-bar direction.
- XGBoost is compared with a majority-class baseline.
- A small PyTorch LSTM is enabled by default and uses a scaler fitted only on the training partition.
- Outputs include XGBoost model, optional LSTM weights, metrics, feature importance, and a SHA-256 dataset manifest under `/kaggle/working/nova_training_output`.

## Important limitations

- This is an initial generic directional baseline, not a profitability claim or trading signal.
- No random/mock funding feature is used.
- Elliott Wave 1–5 is not trained here: reliable, independently verified wave labels are required first.
- SMC rules are not treated as model labels. They require separate causal and walk-forward validation.
- A single chronological holdout is only a first gate; run additional walk-forward windows, cost-aware backtests, regime checks, and minimum-trade-count gates before considering promotion.
- Training does not connect to a broker, submit orders, or enable live trading.
- The notebook does not need a Kaggle API token to read a dataset attached through Kaggle's Add Input interface.

## Reproducible run

Record the Kaggle notebook version, attached dataset version, Git commit used for the notebook, and the generated `manifest.json`. Download the output bundle from Kaggle after the run. Do not commit trained weights directly to `main`; submit a reviewed candidate artifact/PR with metrics and provenance.

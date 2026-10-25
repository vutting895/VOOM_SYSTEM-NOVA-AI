# Tuning Worker

Runs a bounded deterministic parameter grid against a caller-provided backtest function. No randomized objective values. Requires historical OHLCV. Use a chronological train/validation/test split; the module does not claim out-of-sample validity unless a separate holdout is tested.
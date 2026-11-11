# NOVA XGBoost Dataset and Training Adapter

Status: deterministic dataset builder and optional XGBoost training adapter; not a validated trading model.

- Replaces the legacy synthetic random funding feature with deterministic OHLCV-only features.
- Builds return, RSI, MACD, volume-ratio and range features at each decision timestamp.
- Excludes the incomplete future-label tail.
- Uses chronological train/validation/test partitions with label-horizon purging.
- Fits XGBoost on train only and uses validation only for early stopping.
- Uses a fixed seed, single-threaded histogram training and conservative tree complexity.
- XGBoost is imported lazily; dataset contract tests do not require it.

Not implemented: broker ingestion, provenance manifest, cost-aware strategy simulation, calibration, OOF predictions, artifact registry or final-OOS evaluation. Do not register this model in Meta Decision until all backend evaluation gates pass.

# NOVA Sequence Training Foundation

Status: research-only data preparation and untrained model architectures.

## Implemented

- Sequence samples use a fixed trailing feature window ending at the decision timestamp.
- Forward-return targets use a strictly future close and discard all samples without a complete label horizon.
- Input timestamps must be timezone-aware and strictly increasing; feature and target values must be finite.
- Chronological train/validation/test partitions purge at least the maximum forward-label horizon at each boundary.
- Feature normalization is fit from training samples only and can then be applied to validation/test samples.
- Optional PyTorch factories provide a unidirectional LSTM and a separate causal dilated temporal CNN baseline. PyTorch is imported lazily.

## Not implemented / not claimed

- No optimizer, training loop, checkpoint, hyperparameter search or calibrated inference adapter is enabled yet.
- No model has been trained on Exness or other live-market data in this change.
- No performance, profitability or predictive edge is claimed.
- The temporal CNN is the distinct Deep Learning candidate for initial ablation against LSTM, not a second vote by default.

## Required next gates

1. Verify dataset provenance, schema, timezone, missingness and SHA-256 manifest.
2. Freeze point-in-time feature schema and label horizon before any training.
3. Add deterministic training loop, seed control, early stopping using validation only, checkpoint metadata and artifact checksum.
4. Record walk-forward fold predictions as OOF evidence; calibrate scores on validation only.
5. Compare against persistence/majority and simple linear baselines after realistic transaction costs.
6. Keep final OOS from 2026-07-01 untouched for model selection and threshold tuning.
7. Register only models with verified backend evaluation records; never accept client-supplied votes as trusted evidence.

## Safety

These modules only prepare research datasets and construct model architectures. They contain no broker write API or order execution path. Live Trading remains OFF.

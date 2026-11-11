# NOVA Model Plugin Contract

Status: research-only plugin framework; no trained model adapters are enabled.

## Contract

Each plugin declares a fixed family, immutable model version and ordered feature-schema SHA-256. It accepts a point-in-time ModelInput containing a timezone-aware decision timestamp, immutable dataset SHA-256, feature schema SHA-256, finite numeric feature values and timeframe.

It returns a ModelOutput containing the same decision timestamp, dataset and feature-schema fingerprints, a strict direction (-1/0/1), a bounded score [0,1], model version and evaluation reference. The registry rejects mismatched metadata, future timestamps, invalid values, unknown plugins and duplicate family/version registrations.

## Security boundary

- Registry is an explicit in-process allow-list; it never imports arbitrary modules or executes user-provided code.
- This contract does not authenticate calibration evidence. The Meta Decision service must resolve evaluation_ref server-side and verify the OOS report and aligned OOF prediction artifact against trusted storage before using the vote.
- Plugin outputs are research evidence only. No broker client, order interface or execution callback exists here.
- No model is enabled merely by implementing this interface. LSTM, Deep Learning, XGBoost and Vision adapters remain disabled until separately trained, validated and registered by a trusted service.

## Model family requirements

- LSTM: causal unidirectional sequence inference; scaler fit only on training folds; fixed sequence boundaries.
- Deep Learning: specify a distinct architecture (recommended initial candidate: temporal convolutional network), task, receptive field, parameter budget and ablation against LSTM.
- XGBoost: deterministic observed features only; drop labels without a full future horizon; chronological/purged walk-forward evaluation; no in-sample score as evidence.
- Vision: chart renderer must be strictly as-of decision timestamp; no future candles, annotations, labels or revised bars; reproducible image manifest and training seed.

## Validation

The contract unit tests exercise registration, metadata matching, timestamp causality, schema integrity, duplicate prevention and fail-closed behavior. Passing these tests does not establish predictive edge.

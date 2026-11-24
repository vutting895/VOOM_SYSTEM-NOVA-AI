# NOVA Learning Orchestrator — leakage-safe research workflow

## Status and boundary
Offline research control plane only. No broker credentials, order APIs, or model-to-execution path. Live trading, orders, and execution remain disabled.

## Required pipeline
1. Validate source provenance, UTC timestamps, OHLCV schema, ordering, duplicates and finite values.
2. Freeze dataset identity and SHA-256 fingerprint.
3. Build causal features using only values available at the decision timestamp.
4. Create chronological train/validation/test partitions. Purge at least the forward-label horizon between partitions.
5. Fit learned preprocessing and model parameters on training data only.
6. Select parameters on validation/walk-forward folds only.
7. Evaluate once on untouched final OOS; never tune against it.
8. Record code revision, dataset hash, seed, feature schema, split boundaries, costs, metrics and artifacts.
9. Keep candidates in review state. Promotion requires explicit human review and independent acceptance gates.

## XGBoost leakage fixes
- Never randomly shuffle time-series rows.
- The final label-horizon rows are unlabeled and must be dropped, not converted to class 0.
- Report train, validation and test metrics separately; training accuracy is not generalization evidence.
- Rolling indicators use past/current bars only; no centered windows or backward filling.
- Fit all learned preprocessing on training data only.
- Exclude future labels/returns and fields unavailable at the decision timestamp.

## Funding feature policy
Synthetic/random funding values are prohibited. Funding is accepted only with a provider/source identifier, an observation timestamp, and an availability timestamp. Enforce observed_at <= available_at <= decision timestamp for every row. If any part of that lineage is missing, reject the funding feature; do not substitute random, constant, or latest-current funding values into historical rows.

## Acceptance gates
- Contract tests prove chronology, duplicate/timezone rejection, purge boundaries and deterministic dataset hashing.
- XGBoost reports train/validation/test metrics separately with exact row ranges.
- Final OOS remains untouched during feature selection and tuning.
- Runs missing dataset identity, source, code revision, dataset SHA or required metrics are rejected.
- Passing unit tests does not prove profitability or production readiness.

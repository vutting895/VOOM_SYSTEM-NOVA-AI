# NOVA Hybrid Continuous Learning Notebook

## Scope
Research-only, multi-asset and multi-timeframe training orchestration on Kaggle Free CPU. Each asset/timeframe is processed as an independent market stream. The notebook uses SHA-bound CSV manifests and human approval receipts; it never downloads broker data, accepts broker credentials, sends orders, promotes models, or changes risk policy.

## Inputs
Kaggle input directory: `/kaggle/input/nova-approved-market-data`.

For each dataset, provide:
- `<name>.csv`
- `<name>.manifest.json`
- `<name>.manifest.approval.json`

The CSV requires `timestamp_utc, asset, timeframe, open, high, low, close, volume, volume_type`. The JSON manifest must bind the exact CSV SHA-256, row count, exact first/last candle timestamps (`start_utc` and `end_utc`), asset, timeframe, explicit `volume_type`, non-empty provenance `source`, 40-character `source_commit_sha`, `completeness_status=PASS`, `training_eligible=true`, and exact `verified_gap_intervals`. All timestamps must include explicit timezone offsets; equivalent UTC encodings such as `Z` and `+00:00` are normalized before comparison.

The approval receipt must set `approved=true` and bind the same dataset SHA-256 and source commit SHA. It is an auditable research sign-off marker, not cryptographic proof of approver identity; production approval must be enforced server-side.

## Data policy
- No synthetic bars or imputed volume.
- Every unexplained gap blocks ingestion. Verified session gaps must be enumerated exactly in the manifest and each gap starts a new segment; rolling features, forward labels and sequence windows cannot cross segments.
- Volume semantics must remain explicit and match the manifest. Examples include MT5 `tick_volume`, MT5 `real_volume`, and exchange-defined base/contract volume; do not compare raw volume magnitudes across unlike semantics.
- Timezone-aware UTC timestamps, unique ordering, exact timeframe cadence, OHLC bounds, non-negative volume, integer-valued MT5 tick volume, source provenance, boundary coverage, manifest hash and row count are mandatory.
- Final OOS begins at `2026-07-01T00:00:00Z`; any training input containing bars at or after that cutoff is rejected.
- Train/validation partitions are chronological. A training row is retained only when its actual `label_end_utc` is strictly earlier than the first validation timestamp; row-count horizon purging alone is not trusted. Walk-forward inputs also require timezone-aware, unique prediction timestamps and label-end timestamps that do not precede their prediction timestamps.

## Models and hybrid decision
XGBoost and PyTorch LSTM are candidate trainers in this notebook. The canonical Quant Engine Meta Decision contract uses five independent model families: `lstm`, `deep_learning` (temporal CNN), `xgboost`, `vision`, and `neural_network` (residual MLP). The OOF bundle validator requires all five families at every (timestamp, asset, timeframe), explicit direction/score/reliability, signed prediction history, shared dataset SHA-256, passing walk-forward OOS calibration metadata, and at least 30 aligned OOS observations per family. In-sample predictions, naïve timestamps, missing families, duplicate votes and sealed Final OOS predictions are rejected.

Wave3 and SMC are strategy/context refinements (separate from the five independent Meta Decision model votes). They must pass their own strategy and dataset-quality gates; they must not be relabeled as substitute model families or counted as independent ML votes. Correlation clustering and consensus/conflict rules remain owned by the canonical Meta Decision implementation.

## Continuous learning
Continuous learning means controlled candidate refresh, not automatic retraining or promotion. A new candidate requires verified new data or a documented drift trigger, then the full data-quality, purged walk-forward, OOF calibration, transaction-cost, baseline, risk and human-approval gates. No model is automatically promoted.

## Safety
`RUN_TRAINING=False`, `PERSIST_ARTIFACTS=False`, `AUTO_PROMOTE=False`. No broker API or credentials are used. Live Trading remains OFF. The maximum five-order constraint remains enforced outside this notebook by the MQL5 EA Safety Gate. Risk policy cannot be modified by a model.

## Current blocker
The previously reviewed Exness XAUUSDm H1 dataset PR #238 is explicitly not training-eligible because it contains a 7,419-hour historical outage and other unresolved gaps. Do not train on it or bypass its manifest. Multi-asset/timeframe training remains blocked until each individual dataset passes the same provenance and completeness requirements.

## Validation
Run `python -m unittest discover -s tests -p "test_nova_hybrid_notebook.py" -v`. Notebook CI validates nbformat, Python syntax and data/OOF contracts. It does not claim that real market training, OOS evaluation, Kaggle execution or profitability has been demonstrated.


## Nested temporal evaluation

The outer walk-forward fold is reserved for one-time candidate evaluation. Fit and early-stopping partitions are created inside the outer training window; fit labels must mature strictly before the inner early-stopping boundary. The outer evaluation fold is never used for early stopping. Outer training labels must also mature strictly before the outer fit cutoff, with a horizon-sized embargo before the evaluation block.

Reported accuracy and log-loss are fold-level candidate diagnostics only. They are not calibrated OOF probabilities, do not populate the five-family Meta Decision evidence bundle, and do not demonstrate trading profitability. This notebook does not fabricate Vision, Temporal CNN or Residual MLP predictions; those families must supply independently trained, calibrated, timestamp-aligned OOF evidence. The OOF validator rejects unexpected families as well as missing families.


## Approved OOF evidence input

The notebook can ingest a separately generated canonical five-family bundle from Kaggle input directory `/kaggle/input/nova-approved-oof` using:
- `nova_meta_oof.csv`
- `nova_meta_oof.manifest.json`
- `nova_meta_oof.manifest.approval.json`

The manifest must bind the CSV SHA-256, integer row count, source provenance, 40-character source commit SHA, evaluator version, `completeness_status=PASS`, and `oof_status=PASS`. The approval receipt must bind the same CSV SHA and source commit. Every CSV row must carry the same evaluator version as the manifest and pass the strict five-family OOF contract. Missing or invalid inputs return a BLOCKED audit; they are never silently accepted.

This is an ingestion path, not an OOF generator. Notebook XGBoost/LSTM outer-fold diagnostics do not supply calibrated five-family OOF evidence. The canonical Quant Engine must separately produce and approve that bundle.


## LSTM sequence context across nested temporal splits

LSTM early-stopping and outer-evaluation targets now reuse only strictly prior feature history as sequence context. Labels are emitted only for rows in the target partition. Sequence windows are segment-local and cannot cross verified session gaps. This preserves the 32-bar lookback at partition boundaries without importing fit labels into early stopping or outer evaluation.


## LSTM lookback across temporal partitions

LSTM sequence construction now accepts separate feature context and target partitions. Historical context can come from earlier fit/early-stop rows, but labels are emitted only for the target partition. The sequence builder requires an explicit timeframe and rejects windows that cross a non-cadence interval or a verified segment boundary. This retains the 32-bar lookback for early-stopping and outer-evaluation targets without leaking future labels or bridging embargo/session gaps.

The tests cover early-stop targets with prior fit context and verify that windows cannot bridge segment boundaries. These tests are committed but remain unexecuted while GitHub Actions jobs fail before exposing runner steps.

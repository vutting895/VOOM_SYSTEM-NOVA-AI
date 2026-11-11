# NOVA Hybrid Continuous Learning Notebook

## Scope
Research-only, multi-asset and multi-timeframe training orchestration on Kaggle Free CPU. Each asset/timeframe is processed as an independent market stream. The notebook uses SHA-bound CSV manifests and human approval receipts; it never downloads broker data, accepts broker credentials, sends orders, promotes models, or changes risk policy.

## Inputs
Kaggle input directory: `/kaggle/input/nova-approved-market-data`.

For each dataset, provide:
- `<name>.csv`
- `<name>.manifest.json`
- `<name>.manifest.approval.json`

The CSV requires `timestamp_utc, asset, timeframe, open, high, low, close, volume, volume_type`. Manifest fields include `asset`, `timeframe`, `sha256`, `row_count`, `source_commit_sha`, `completeness_status=PASS`, `training_eligible=true`, and exact `verified_gap_intervals`. Approval must explicitly set `approved=true` and bind the same dataset SHA-256 and source commit SHA. This is a research receipt, not cryptographic proof of an external approver identity; production approval must be enforced server-side.

## Data policy
- No synthetic bars or imputed volume.
- Every unexplained gap blocks ingestion. Verified session gaps must be enumerated exactly in the manifest and never bridged with synthetic rows.
- MT5 volume must be explicitly typed (normally `tick_volume`); crypto volume must retain its exchange-defined semantics.
- UTC timestamps, unique ordering, OHLC bounds, non-negative volume and manifest hash/row count are mandatory.
- Final OOS begins at `2026-07-01T00:00:00Z`; any training input containing bars at or after that cutoff is rejected.
- Train/validation partitions are chronological and purge the forward-label horizon.

## Models and hybrid decision
XGBoost and PyTorch LSTM are CPU candidate trainers. Wave3 and SMC must provide their own timestamp-aligned OOF evidence from the canonical NOVA Quant Engine; this notebook does not reimplement or claim fidelity to those engines. Meta-Learning must consume aligned OOF predictions, calibration identifiers, model versions and fold identifiers. Highly correlated model families must be clustered and cannot multiply consensus. The canonical Meta Decision implementation and its independent-cluster/conflict gates remain authoritative.

## Continuous learning
Continuous learning means controlled candidate refresh, not automatic retraining or promotion. A new candidate requires verified new data or a documented drift trigger, then the full data-quality, purged walk-forward, OOF calibration, transaction-cost, baseline, risk and human-approval gates. No model is automatically promoted.

## Safety
`RUN_TRAINING=False`, `PERSIST_ARTIFACTS=False`, `AUTO_PROMOTE=False`. No broker API or credentials are used. Live Trading remains OFF. The maximum five-order constraint remains enforced outside this notebook by the MQL5 EA Safety Gate. Risk policy cannot be modified by a model.

## Current blocker
The previously reviewed Exness XAUUSDm H1 dataset PR #238 is explicitly not training-eligible because it contains a 7,419-hour historical outage and other unresolved gaps. Do not train on it or bypass its manifest. Multi-asset/timeframe training remains blocked until each individual dataset passes the same provenance and completeness requirements.

## Validation
Run `python -m unittest discover -s tests -p "test_nova_hybrid_notebook.py" -v`. Notebook CI validates nbformat, Python syntax and safety defaults. It does not claim that real market training, OOS evaluation, Kaggle execution or profitability has been demonstrated.

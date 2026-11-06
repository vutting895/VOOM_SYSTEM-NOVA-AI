# NOVA AI Learning Engine v0.1 — Implementation Note

Status: backend package and verified historical data bridge are implemented on
`feat/learning-engine-v0.1`. The imported historical datasets are on the
separate draft data PR #197 and are not yet available from main.

## Delivered

- SQLAlchemy persistence models for experiences, model versions and audit events.
- Idempotent experience ingestion keyed by originating `event_id`.
- Auditable reward formula with risk and drawdown breach penalties.
- Performance aggregation filterable by strategy and environment.
- Candidate metadata registration and explicit human approval gate.
- FastAPI router with fail-closed approval authorization.
- Market data loaders for the Exness XAUUSDm M15 and Binance BTCUSDT H1
  versioned snapshots, including hash/size checks, metadata consistency,
  UTC/OHLCV validation, gap reporting and candidate-only eligibility.
- Chronological train/validation/reserved-test split helper with label-horizon
  purge and embargo; sequence segments do not cross observed data gaps.
- Unit fixtures for data provenance checks and temporal split behavior.

## Data-source dependencies

- PR #197 contains Exness Demo XAUUSDm M15 (101,076 bars), Binance BTCUSDT H1
  five-year and 500-bar snapshots, plus manifests.
- PR #197 contains review fixes to reconcile manifest hashes/sizes and check
  the Exness source-metadata hash. Its full exact-head GitHub Actions result is
  still required before describing the input collection as fully verified.
- The Exness data is `candidate_only` and differs from the frozen Wave3
  benchmark hash; it cannot replace that benchmark.
- The Binance five-year data includes a reported missing hourly bar. Missing
  observations are not synthesized, and windows may not cross the gap.
- Downloaded Source ZIP archives are code, not training data. In particular,
  the legacy `auto_retrain.py` uses random tensors and hard-coded metrics and
  must not be executed as a training path.

## Not yet complete

- Exact-head dataset workflow validation and approval/merge of PR #197.
- Automated execution of the Learning Engine unit tests in the repository CI.
- Host Core API integration and Alembic migration.
- Authenticated RBAC override and production permission tests.
- LangGraph experience event wiring.
- Approved model feature/label target contract, offline trainer, model artifact
  registry, chronological walk-forward evaluation and drift monitoring.

## Safety

This package has no broker dependency and cannot submit orders. Candidate
approval is metadata-only and does not deploy or activate a model. The final
test partition remains reserved for untouched evaluation. Live trading remains
outside this subsystem.

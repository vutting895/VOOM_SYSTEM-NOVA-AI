# NOVA V1.0 — Data & Training Implementation Blueprint

**Architecture decision:** Hybrid Storage + Hybrid Training + Unified Integration  
**Baseline:** `main` at `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567` (2026-11-18)  
**Implementation branch:** `feature/nova-data-training-foundation-20261118`  
**Status:** Foundation specification and repository scaffold; not a production data/training service.

## 1. Goals and non-goals

### Goals
- Establish one canonical data contract and lineage path for all NOVA research models.
- Keep raw market data immutable and separate from normalized data, features, labels, and model artifacts.
- Use Supabase for metadata and workflow state, Cloudflare R2 for object artifacts, and GitHub for code/contracts only.
- Run training on ephemeral local/Kaggle/Colab compute; keep Cloudflare Workers as a lightweight control plane.
- Support XGBoost, LSTM/PyTorch, Vision, and a Meta Decision Layer without allowing models to submit broker orders.
- Make every dataset, experiment, checkpoint, evaluation, and model release reproducible by immutable IDs and SHA-256 hashes.

### Non-goals for this foundation slice
- No live broker execution, order placement, withdrawals, or account mutations.
- No automatic promotion to live trading.
- No always-on GPU or paid compute dependency.
- No unverified claims that a model has trained or passed OOS evaluation.
- No committing market datasets, checkpoints, credentials, or model binaries to Git.

## 2. Architecture

```text
Sources
  Exness/MT5 read-only | approved public APIs | licensed external datasets | news
       |
       v
Ingestion adapters (allow-list, auth, rate limits, provenance)
       |
       v
Immutable Raw Objects ----------------------> Cloudflare R2
       |                                        (raw / normalized / features /
       v                                         datasets / checkpoints / models)
Validation + normalization
       |
       v
Canonical dataset builder ----> Data manifest + SHA-256
       |                         Supabase metadata/catalog
       v
Feature + label pipeline
       |
       v
Leakage-aware chronological splits / walk-forward / frozen final OOS
       |
       v
Training job API (control plane) ---> ephemeral compute runner
       |                                  local CPU / Kaggle / Colab
       |                                  XGBoost / PyTorch / Vision
       v
Experiment + evaluation records <--- metrics, logs, checkpoint hashes
       |
       v
Model Registry: candidate -> evaluated -> approved -> demo_shadow
       |
       v
Meta Decision Layer (OOF evidence only; can abstain)
       |
       v
NOVA System Core / dashboard / human approval
```

**Boundary:** Cloudflare Workers handle authentication, routing, job state, and signed upload/download coordination. They do not run model training or large dataset transformations. Heavy work runs in a separate Python process with short-lived credentials and bounded resources.

## 3. Storage decision

| Data class | Canonical location | Git policy |
|---|---|---|
| Source code, schemas, configs, tests | GitHub NOVA repository | Commit |
| Raw candles, ticks, news, broker history | R2 immutable object prefixes | Never commit |
| Cleaned/normalized Parquet | R2 | Never commit |
| Feature tables and labels | R2 | Never commit |
| Train/validation/test/OOS datasets | R2 | Never commit |
| Dataset/experiment/model metadata | Supabase Postgres | Schema/migrations in Git; records not in Git |
| Checkpoints and trained model artifacts | R2 | Never commit |
| Temporary training workspace | Local/Kaggle/Colab ephemeral disk | Never treat as canonical |
| Optional operator export | Google Drive | Secondary copy only; not source of truth |

Use Supabase for small metadata and job state, not bulk OHLCV or model binaries. R2 is the canonical artifact store. Register an object in Supabase only after upload completion and server-side checksum verification. A reconciliation job must identify orphaned objects and metadata records. Keep credentials out of manifests and logs.

**Cost guard:** R2, Supabase, Kaggle, and Colab have quotas and changing terms. “Hybrid” does not guarantee zero cost. Enforce storage/egress/compute budgets and stop jobs before exceeding configured limits.

## 4. Canonical data contract

Every dataset manifest must record:
- `schema_version`, immutable `dataset_id`, source/provider, source symbol and canonical instrument;
- timeframe, timezone (UTC), timestamp semantics (bar-open or bar-close), price basis, and volume semantics (tick or real);
- object URI, file format, byte size, row count, start/end timestamps, SHA-256;
- ingestion time, source/license/provenance, adapter version, normalization version;
- quality result, warnings, gap counts, duplicate count, and explicit approval state;
- feature/label versions and split/purge policy when the dataset is training-ready.

Do not silently map Exness `XAUUSDm` to another provider's `XAUUSD`. Contract size, suffix, spread, session, timezone, and volume semantics must be explicitly mapped. Do not fabricate missing candles or infer session gaps as ordinary missing intervals.

## 5. Data lifecycle

1. Ingest allow-listed sources with bounded time ranges and rate limits.
2. Store source payloads as immutable raw objects; calculate SHA-256.
3. Parse and normalize timestamps to UTC without changing source values.
4. Validate schema, finite numeric values, OHLC relationships, strict chronology, duplicates, interval gaps, and symbol/timeframe identity.
5. Quarantine invalid or incomplete data; do not promote it into approved datasets.
6. Build normalized Parquet partitions by instrument/timeframe/date.
7. Generate features and labels with explicit version IDs and look-ahead declarations.
8. Build immutable dataset snapshots and manifests.
9. Approve snapshots only after provenance and quality checks pass.

## 6. Training lifecycle

- **Hybrid execution:** local CPU for unit tests, smoke tests, and small baselines; Kaggle/Colab for bounded batch training when suitable resources are actually available.
- **Continuous learning meaning:** continuous data capture and feedback collection, followed by scheduled/event-triggered batch retraining. Do not perform uncontrolled online weight updates.
- Each run pins dataset SHA, feature schema SHA, code commit, config SHA, seed, runtime/dependency versions, model family, and evaluation plan.
- Training must consume only approved datasets. Validation selects checkpoints; test evaluates the frozen candidate; final OOS is a one-time holdout and must never be used for tuning, feature selection, calibration, or threshold changes.
- Meta Decision Layer receives only calibrated out-of-fold / walk-forward predictions and explicit context. Missing or conflicting evidence must result in abstention.
- A candidate is never promoted automatically. Require human approval and Demo/Shadow validation.

### Required trading research gates
- Final OOS start: 2026-07-01 (frozen; no tuning on this period).
- At least 30 closed OOS trades.
- Net profit > 0 and Profit Factor > 1.0 after realistic spread, commission, swap, and slippage assumptions.
- Classification metrics must be compared with a declared baseline.
- Walk-forward robustness and per-fold metrics are mandatory.
- Record drawdown, exposure, trade count, expectancy, and confidence intervals; do not rely on accuracy alone.
- Passing these gates is research evidence, not authorization for live trading.

## 7. Unified service contracts

Version all contracts under `/api/v1`. Initial logical endpoints:
- `POST /api/v1/data/ingestions` — create an allow-listed ingestion job.
- `GET /api/v1/data/ingestions/{job_id}` — inspect status and validation report.
- `GET /api/v1/datasets/{dataset_id}` — retrieve manifest and approval state.
- `POST /api/v1/training/runs` — create a run referencing an approved dataset and immutable config.
- `GET /api/v1/training/runs/{run_id}` — inspect run state, logs, and metrics.
- `POST /api/v1/models/{model_id}/evaluations` — attach signed evaluation evidence.
- `POST /api/v1/models/{model_id}/approval` — human-only promotion decision.

API handlers must validate tenant/user authorization, payload size, date range, supported symbols/timeframes, and idempotency keys. The compute runner must use a short-lived job token scoped to one run and object prefix. Never expose R2 credentials or broker secrets to notebooks.

## 8. Repository layout

```text
data/
  README.md
  schemas/
    ohlcv.schema.json
    dataset-manifest.schema.json
  manifests/README.md
  quality/README.md
  raw/                 # runtime objects in R2; not committed
  processed/           # runtime objects in R2; not committed
  features/            # runtime objects in R2; not committed
  datasets/            # runtime objects in R2; not committed
training/
  README.md
  configs/default.yaml
  pipelines/           # next implementation slice
  runners/             # next implementation slice
  evaluation/          # next implementation slice
model_registry/README.md
learning/README.md
workers/data-ingestion/ # existing adapter prototype; evolve behind contracts
workers/quant_engine/   # existing validation/split/experiment primitives
```

Do not duplicate existing quant-engine logic. Reuse `workers/quant_engine/quality.py`, `splits.py`, and experiment validation; first replace the mock behavior in `training.py` before claiming real training.

## 9. Implementation phases and acceptance criteria

### Phase A — Contracts and repository scaffold (this branch)
- Add versioned OHLCV and dataset-manifest schemas.
- Document data, training, registry, and learning ownership.
- Make Git ignore bulk data and artifacts while allowing schemas/docs.
- No production secrets, datasets, checkpoints, or live execution code.

### Phase B — Data catalog and object adapter
- Add Supabase migrations for dataset, ingestion-job, artifact, and quality-report metadata.
- Add R2 adapter with checksum verification, immutable keys, bounded uploads, and reconciliation.
- Acceptance: duplicate ingestion is idempotent; bad schema/gaps are quarantined; manifest hash matches object bytes.

### Phase C — Dataset and feature pipeline
- Add source adapters, UTC normalization, symbol mapping registry, Parquet writer, feature/label versioning.
- Acceptance: deterministic dataset build; no fabricated candles; provenance can be traced to raw source.

### Phase D — Real training runner
- Replace mock training utility with actual XGBoost/PyTorch implementations behind a common interface.
- Add reproducible seeds, checkpoints, early stopping, resource limits, run telemetry, and dependency lock.
- Acceptance: a small approved fixture trains end-to-end; checkpoint reload reproduces predictions; failed runs cannot be marked successful.

### Phase E — Evaluation and registry
- Add walk-forward evaluator, cost model, frozen OOS policy, model registry, signed evidence, manual approval.
- Acceptance: leakage tests pass; OOS is not available to tuning code; failed candidates cannot be promoted.

### Phase F — Learning feedback and dashboard
- Connect Demo journal outcomes and error analysis to retraining queue.
- Acceptance: feedback is versioned and labeled; no self-modifying model deployment; human approval remains required.

## 10. Safety invariants

- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false` remain enforced.
- Data/training services have no broker order or account mutation credentials.
- No notebook may place orders or modify broker settings.
- Model output is research evidence only; risk engine and human approval remain separate.
- Rollback means reverting the model registry pointer to a previously approved artifact, not deleting immutable evidence.

## 11. Known baseline gaps

- `workers/data-ingestion` is explicitly marked scaffold/prototype.
- `workers/quant_engine/training.py` currently returns mock checkpoint bytes; it is not a real trainer.
- The latest committed Kaggle notebook records internet/DNS failure, no configured data sources, and no GPU accelerator. It is not evidence of a successful training run.
- Existing OHLCV validation, fingerprinting, chronological splits, walk-forward windows, and Meta Decision Layer should be reused and tested, not duplicated.

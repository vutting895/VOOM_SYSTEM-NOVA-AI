# NOVA Data Layer

This directory contains versioned data contracts and documentation only. Bulk market data is stored in Cloudflare R2, not Git.

## Runtime object layout (R2)
- `raw/{provider}/{instrument}/{timeframe}/...` — immutable source payloads.
- `processed/{instrument}/{timeframe}/...` — normalized Parquet.
- `features/{feature_set_version}/{instrument}/{timeframe}/...` — derived features.
- `datasets/{dataset_id}/...` — immutable training/evaluation snapshots.
- `quarantine/{ingestion_job_id}/...` — rejected or incomplete source data.

## Rules
- Preserve raw source data and provenance.
- Normalize timestamps to UTC; record whether timestamps identify bar open or bar close.
- Keep provider symbol, canonical instrument, contract metadata, and volume semantics explicit.
- Never fabricate missing candles or silently merge instruments with different contract specifications.
- A dataset is training-eligible only when its manifest and quality report are approved.
- Reuse validation and fingerprinting primitives in `workers/quant_engine/quality.py`.

No CSV, Parquet, tick exports, checkpoints, or credentials belong in this directory in Git.

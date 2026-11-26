# NOVA QuantLab Dataset Artifact Contract v1

Status: development contract only. This is not a production data-ingestion or storage deployment.

## Trust boundary

A trusted ingestion process stages immutable artifacts beneath the configured
`QUANTLAB_DATASET_ROOT`. A user job may submit only `experiment.dataset_artifact_id`
and optional `experiment.dataset_sha256`; it must never submit a filesystem path,
URL, bucket key, tenant ID, or credential. The executor obtains tenant identity
from the authenticated dispatcher claim, not from the experiment payload.

Directory layout:

```text
<QUANTLAB_DATASET_ROOT>/
  <authenticated-tenant-id>/
    <dataset-artifact-id>/
      manifest.json
      data.csv
```

## Manifest schema

`manifest.json` is UTF-8 JSON with exactly these fields:

- `schema_version`: `nova.dataset-artifact.v1`
- `dataset_id`: safe artifact identifier, matching the directory name
- `symbol`: broker/source symbol (for example `XAUUSDm`)
- `timeframe`: one of M1, M5, M15, M30, H1, H4, D1
- `interval_seconds`: positive integer candle interval
- `row_count`: 1..250,000
- `data_file`: exactly `data.csv`
- `data_size_bytes`: 1..32 MiB
- `data_sha256`: SHA-256 of the exact CSV bytes
- `source`: exactly `provider`, `source_ref`, `exported_at` strings

CSV header must be exactly `timestamp,open,high,low,close,volume`.
Timestamps must include timezone information. The existing OHLCV validator
normalizes timestamps to UTC, rejects duplicates/out-of-order rows, invalid
prices, negative volume, non-finite values and malformed candle ranges. Gaps
are counted; callers can request fail-closed contiguous data with
`experiment.reject_gaps=true`.

The executor verifies tenant-scoped resolution, manifest schema, file size,
raw CSV SHA-256, row count, OHLCV semantics and a canonical normalized-content
SHA-256. It returns a bounded JSON validation report and never edits source
files. The optional experiment `dataset_sha256` is compared to the canonical
fingerprint, not the raw file hash.

## Security and limits

- Artifact IDs and tenant IDs are validated; user-supplied paths and URLs are
  not accepted.
- Symlinks are rejected along the resolved artifact path; resolved files must
  remain beneath the configured root and be regular files.
- Manifest size <= 32 KiB; CSV size <= 32 MiB; rows <= 250,000.
- No remote fetch, decompression, archive extraction, writes, or path fallback.
- The root must be an explicitly configured absolute path. No production root
  or volume is configured by this change.
- Artifact staging, atomic publication, retention, backup/restore, and
  provenance attestation remain responsibilities of a future trusted
  ingestion adapter and are not implemented here.

## Execution boundary

The first executor supports only `dataset.validate`. Backtest, evaluate and
train are rejected by this executor until their independent implementations
and acceptance tests exist. This module is callable by a trusted worker but
does not start a polling loop, claim leases, heartbeat, or finish queue jobs.
It does not connect to MT5, broker APIs, order APIs, or model promotion.

Live trading remains disabled:
`ordersEnabled=false`, `executionEnabled=false`,
`liveTradingEnabled=false`.

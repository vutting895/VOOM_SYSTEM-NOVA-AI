# NOVA Unified Data Lake — Runbook

## Local setup
From repository root:
```bash
cd engine/python
python -m pip install -e ".[dev]"
pytest -q
```

## Inspect an M1 CSV
Input must have: timestamp,open,high,low,close,tick_volume. Timestamp must be ISO-8601 UTC.
Use `nova_engine.data.csv_ingest.load_csv(Path("data/raw/xauusd/file.csv"))`.
The returned report includes rejected rows, duplicates, out-of-order rows and observed timestamp gaps.

## Multi-timeframe bars
Call `aggregate_bars(m1_bars, "M5")`, then M15/M30/H1.
Only complete minute-aligned buckets are emitted. Missing bars are not synthesized.

## Promotion checklist
1. Preserve original file and compute SHA-256.
2. Attach completed DatasetManifest with upstream commit, license and provider terms.
3. Run data quality checks and inspect session-aware gaps.
4. Review price basis (bid/ask/mid) and broker symbol mapping.
5. Store normalized output separately; never overwrite raw.
6. Approve only after human review; keep approval evidence and code version.

This pipeline does not download data from the ten repositories. It validates local data after lawful acquisition. It does not infer that any upstream sample dataset is licensed for redistribution.

# Binance BTCUSDT H1 historical snapshots

Two Windows-generated historical snapshots from the public Binance klines API are preserved here for reproducibility. The 5-year file was retrieved on 2026-10-26; the 500-bar file is a more recent snapshot from 2026-10-05.

- These are historical snapshots, not live market feeds.
- JSON OHLCV values were serialized as JSON numbers, not decimal strings; they must not be treated as the canonical high-precision ingestion source.
- Validate the exact SHA-256, data gaps, duplicates, candle closure and provider provenance before any new training.
- The old walk-forward and cost sensitivity reports are retained under reports/legacy-learning-universe/ and are historical exploratory artifacts only. They are not the frozen Wave3 final-OOS benchmark.
- No broker credentials, account identifiers, or order data are included.

See dataset_manifest.json for row counts, ranges, byte sizes and hashes.

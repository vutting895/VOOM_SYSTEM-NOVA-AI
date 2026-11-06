# Binance BTCUSDT H1 historical snapshots

Two Windows-generated historical snapshots from the public Binance klines API are preserved here for reproducibility. The 5-year file was retrieved on 2026-10-26. The 500-bar file contains closed bars from 2026-10-05T00:00:00+00:00 through 2026-10-25T19:00:00+00:00; that is the bar range, not the retrieval date.

- These are historical snapshots, not live market feeds.
- JSON OHLCV values were serialized as JSON numbers. Parsing those tokens as Decimal preserves their stored decimal representation but cannot restore precision not present in the source file.
- Validate the exact SHA-256, data gaps, duplicates, candle closure and provider provenance before any new training.
- The 5-year series contains an identified one-hour data gap. Do not synthesize a candle; exclude any training or sequence sample that crosses the gap.
- The old walk-forward and cost sensitivity reports are retained under `reports/legacy-learning-universe/` as historical exploratory artifacts only. They are not the frozen Wave3 final-OOS benchmark.
- No broker credentials, account identifiers, or order data are included.

See `dataset_manifest.json` for row counts, ranges, byte sizes and hashes.

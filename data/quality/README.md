# Data Quality Gate

Reuse `workers/quant_engine/quality.py` as the initial OHLCV validation and fingerprint implementation.

Minimum checks:
1. Required fields and schema version.
2. UTC-aware timestamps with declared bar-open/bar-close semantics.
3. Strictly increasing timestamps; reject duplicates and out-of-order rows.
4. Finite positive OHLC prices; valid high/low relationships; non-negative volume.
5. Expected interval, missing intervals, and irregular/session intervals reported separately.
6. Explicit provider symbol, canonical instrument, timeframe, and volume type.
7. Source provenance, license/usage permission, raw-object hash, and deterministic normalized-object hash.

A failed dataset is quarantined. Do not sort away chronology defects, fill gaps with synthetic bars, or mark warnings as PASS without a documented resolution.

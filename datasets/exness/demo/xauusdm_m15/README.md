# Exness Demo XAUUSDm M15 Historical Dataset

This directory contains a historical, read-only market-data export from an Exness MT5 **Demo** account. It is data for research/reproducibility only, not an authorization to trade.

## Dataset

- File: `ohlcv_2022-07-21_2026-10-29.csv`
- Symbol: `XAUUSDm`
- Timeframe: `M15`
- Source: MetaTrader 5 terminal API, `copy_rates_range`
- Account mode: Demo
- Timezone: UTC
- Rows: 101,076 OHLCV bars
- First bar: 2022-07-21T00:00:00Z
- Last closed bar: 2026-10-29T16:45:00Z
- Incomplete final bar excluded; duplicate timestamps removed during export
- Account identifier is not included

## Integrity

- CSV size: 8,584,488 bytes
- CSV SHA-256: `7d16e54327bfeabe9bd2c416548ee378f2bdb173827a494af7a7458c113c99d7`
- Source metadata: `source_metadata.json`
- Metadata SHA-256: `82e8d8a08398358f24cd2c005a6f9a3ab5370fc6aa6c72553274e91cec083a45e6`

The metadata file records the MT5 symbol specification and original export details. It contains no account identifier. Preserve both files together; do not rewrite or normalize the CSV without producing a new manifest and hash.

## Intended use and limitations

- Historical dataset only; it is not a live feed and must not be described as a fresh MT5 export.
- Validate data hashes and the exact dataset version before training or benchmark runs.
- Keep the benchmark's frozen train/validation/OOS boundaries and all strategy/risk/news gates unchanged.
- This repository copy is a versioned research input. Supabase remains the intended central runtime data store after its migration baseline is reconciled and a separately approved migration is applied.
- No credentials, API keys, account numbers, terminal logs, or private trading statements belong in this directory.

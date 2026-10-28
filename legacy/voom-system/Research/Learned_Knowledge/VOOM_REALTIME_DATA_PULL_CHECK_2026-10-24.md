# VOOM Real-Time Data Pull Check — 2026-10-24

## Outcome
- Read-only MT5 terminal initialization succeeded using the HFM terminal.
- Recent XAUUSDc M15 history was fetched and saved inside the project.
- Live tick freshness could NOT be verified: terminal tick timestamp is ahead of the host's current UTC clock by about 2 hours 7 minutes. The snapshot script correctly labels this FUTURE_TIMESTAMP_CLOCK_SKEW, not fresh.
- Do not use this quote as confirmed real-time input or for automated decisions until host/terminal clock and market session are reconciled.

## Saved artifacts
- Recent 18-day MT5 bar history:
  - Backtest/data/realtime/XAUUSDc_M15_20261005_20261023.csv
  - Backtest/data/realtime/XAUUSDc_M15_20261005_20261023.meta.json
  - 1,313 bars; 2026-10-05 15:45 UTC through 2026-10-23 21:45 UTC.
- Latest 2,000 M15 bars:
  - Backtest/data/realtime/XAUUSDc_M15_latest_20261023T215116Z.csv
  - 2,000 bars; 2026-09-24 07:00 UTC through 2026-10-23 23:45 UTC.
  - SHA-256: aeb5674451773a55abb1cf5edc6ecc9baca5b88c6fadefe33d94d1758dc5b3fb
- Snapshot:
  - Backtest/data/realtime/snapshot_XAUUSDc_20261023T215116Z.json

## Last terminal tick reported
- Symbol: XAUUSDc
- Bid: 3995.48
- Ask: 3995.88
- Spread: 0.40 price units (40 points)
- Tick timestamp: 2026-10-23 23:58:59 UTC
- Host capture clock: 2026-10-23 21:51:16 UTC
- Difference: tick timestamp is 7,662.5 seconds in the future relative to the host clock.
- Status: FUTURE_TIMESTAMP_CLOCK_SKEW. Not certified as live.

## Controls
- Read-only market data calls only.
- No account balance/positions were read.
- No orders sent, no EA/live flags changed, no Cloudflare or dashboard settings changed.
- The latest M15 bar may be incomplete and must not be treated as a closed-bar signal.
- Current data is saved for research but is not automatically appended to the long historical backtest dataset or treated as training labels.
- Before real-time learning, fix and verify host UTC/time synchronization and confirm a fresh tick timestamp advances; then ingest only closed bars into the learning dataset.

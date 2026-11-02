# Exness Demo market data

File: XAUUSDm_M15_2022-2026.csv

- Source: connected MetaTrader 5 terminal, read-only history API.
- Broker server: Exness-MT5Trial7 (Demo).
- Symbol as listed by the terminal: XAUUSDm.
- Timeframe: M15; timestamps in UTC; incomplete current candle excluded.
- Number of unique closed bars: 101,076.
- First bar: 2022-07-21T00:00:00Z.
- Last bar: 2026-10-29T16:45:00Z.
- SHA-256: 7d16e54327bfeabe9bd2c416548ee378f2bdb173827a494af7a7458c113c99d7.

The export contains only OHLC, tick volume, spread and timestamps. Account number, credentials, trade history and personal data are not included. Historical rates begin at the earliest bars available through the connected terminal; missing earlier history is not synthesized.

Use this sample for reproducible model research only. It is not a promise of trading performance and not production approval.


## Historical high-impact USD news calendar

File: \`news/VOOM_USD_High_Impact_2022_2026.csv\`

- Source: Exness Demo MT5 / MQL5 Economic Calendar; historical export dated 2026-10-30.
- Coverage: [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z), end exclusive.
- 2,166 unique high-impact USD/US events; datetime mode only.
- Exness Experts log evidence: two \`NEWS_EXPORT_SUCCESS\` markers, 15,853 queried values, zero unknown time modes.
- Raw Windows Common Files CSV: 388,313 bytes; SHA-256 \`6754d46f34e76fc171e64afec51297dbcd3caf4d4dd196bc1a993b526c\`.
- Canonical Git LF CSV: 386,146 bytes; SHA-256 \`317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37\`.
- Provenance manifest: \`news/VOOM_USD_High_Impact_2022_2026.manifest.json\`.

The raw terminal file and its private operational log are not committed. Only the normalized market-calendar CSV and non-sensitive provenance metadata are stored here. These are historical evidence, not a new MT5 export performed by this workflow.

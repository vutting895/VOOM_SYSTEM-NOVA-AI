# XAUUSDm M5 and Tick Export Procedure

## Purpose and safety

This is a read-only MT5 Script. It calls only symbol/history APIs:
- `CopyRates(..., PERIOD_M5, ...)`
- `CopyTicksRange(..., COPY_TICKS_ALL, ...)`

It contains no order, position, deal, deposit, withdrawal, or account-modification calls. It does not place trades. Keep the account on Exness Demo and Live Trading OFF.

## Source of truth

Use the exact Exness Demo terminal/server and the exact broker symbol `XAUUSDm`. Do not substitute `XAUUSD`, `XAUUSDc`, a different server, or public Exness tick history without labeling it as a separate source.

The exporter writes timestamps in broker/server time. Do not label them UTC or convert them using a fixed guessed offset. Preserve the original server timestamps and record the account server name; resolve server-to-UTC conversion against verified terminal/server time and DST history before joining to the existing UTC M15 candidate.

## Install and run

1. Pull branch `research/aca-optimizer-validation-20261125`.
2. Copy `integrations/mt5/NOVA_Export_XAUUSDm_M5_Ticks.mq5` into the connected MT5 terminal's `MQL5/Scripts` folder.
3. Open MetaEditor, compile the script, and confirm zero errors.
4. In MT5, open the Exness Demo terminal, select the exact `XAUUSDm` symbol, and open its M5 chart.
5. Drag `NOVA_Export_XAUUSDm_M5_Ticks` onto that chart.
6. Keep `InpExportM5Bars=true`. For the first run, set `InpExportTicks=false` to retrieve the M5 series and confirm history depth. Then run again with `InpExportM5Bars=false` and `InpExportTicks=true`; use `InpMaxDaysPerRun` (for example 5 or 10) to export tick history in bounded batches.
7. Files are written to `Common\\Files\\NOVA_XAUUSDm_EXPORT\\` when `InpUseCommonFiles=true` (the default). This is the only directory authorized for Desktop Commander to read. The script logs per-day tick counts and a final summary in the Experts tab.

## Outputs

- `NOVA_XAUUSDm_EXPORT\\NOVA_XAUUSDm_SYMBOL_SPEC.csv`: server, account currency, digits, point, tick size/value, contract size, volume min/max/step, calculation mode and broker currency fields.
- `NOVA_XAUUSDm_EXPORT\\NOVA_XAUUSDm_M5_<from>_<to>.csv`: M5 OHLC, tick volume, broker spread points, real volume.
- `NOVA_XAUUSDm_EXPORT\\NOVA_XAUUSDm_TICKS_YYYYMMDD.csv`: bid, ask, last, volume, volume_real, flags and millisecond timestamp, one file per day.

An empty tick day is recorded as a header-only CSV; this is not automatically a missing-data failure because market closures and no-quote periods must be interpreted against the broker session calendar.

## Required receipt before acceptance

Record:
- terminal build and MT5 server name (no account login, password, investor password, or Support PIN);
- exact symbol name and symbol specification: digits, point, tick size, tick value, contract size, volume min/max/step, trade mode, calculation mode;
- export start/end inputs and actual first/last timestamps;
- M5 row count, tick row count by day, empty/error days;
- each file byte size and SHA-256;
- timestamp timezone/server offset evidence, including DST handling;
- source terminal identity as Demo, and confirmation that no trade actions were enabled.

## Verified preparation evidence (2026-11-26)

- Source file installed at `C:\\MT5\\MQL5\\Scripts\\NOVA_Export_XAUUSDm_M5_Ticks.mq5`.
- MetaEditor compile result: **0 errors, 0 warnings**, 767 ms, X64 Regular.
- Source SHA-256: `DA307C3DB47054F396BA8645A4E68409531CF0CEA177B8FD4DD211077F110C42`.
- Compiled EX5 SHA-256: `669719962397A82903F9273E2C1635A562DD8CD3AD144AC99E490EAD3B89F05E`.
- Compile log SHA-256: `AB933F8F4707554ABA65FC4136D069DEF15854E411FEA0E7C95E6D5111D5234E`.
- Compile log: `Common\\Files\\NOVA_XAUUSDm_EXPORT\\NOVA_Export_compile.log`.
- This proves compilation only; it does not prove broker login, correct Demo server, symbol/chart selection, or successful history export.

## Important limitations

- The current terminal process is `C:\\MT5\\terminal64.exe /profile:NOVA_READONLY`; current logs do not establish a successful Exness Demo broker session or identify its server.
- Port `127.0.0.1:22346` is already listening under the MT5 process. An unauthenticated HTTP request returns 401; do not treat that as broker-login proof or create a second listener.
- The export folder currently contains only the compile log; no M5, tick, or symbol-spec CSV has been produced.
- The MT5 terminal can only return history available from the connected broker server and its history service. A requested start date does not guarantee the full period exists.
- Tick data can be very large. Export in bounded day batches and verify every file before combining.
- MT5 bar timestamps are broker/server time. Do not compare directly with UTC M15 until timezone mapping is verified.
- The public Exness Tick History archive is a separate indicative source; it is not a replacement for the exact Demo server's XAUUSDm feed.

## Next processing gates

1. Confirm the terminal is logged into the intended Exness Demo server and that the chart is exactly `XAUUSDm,M5`; do not put credentials in chat.
2. Run M5-only export first and confirm history depth.
3. Export ticks in bounded batches.
4. Build a SHA-256 inventory and coverage receipt.
5. Validate duplicate/order/schema/OHLC/spread/volume and session gaps.
6. Verify server-time to UTC mapping.
7. Reconcile broker specification and costs before any backtest.

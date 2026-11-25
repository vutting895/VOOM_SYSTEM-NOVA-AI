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
7. Files are written under the MT5 Common Files folder when `InpUseCommonFiles=true`. The script logs per-day tick counts and a final summary in the Experts tab.

## Outputs

- `NOVA_XAUUSDm_SYMBOL_SPEC.csv`: server, account currency, digits, point, tick size/value, contract size, volume min/max/step, calculation mode and broker currency fields.
- `NOVA_XAUUSDm_M5_<from>_<to>.csv`: M5 OHLC, tick volume, broker spread points, real volume.
- `NOVA_XAUUSDm_TICKS_YYYYMMDD.csv`: bid, ask, last, volume, volume_real, flags and millisecond timestamp, one file per day.

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

## Important limitations

- The MT5 terminal can only return history available from the connected broker server and its history service. A requested start date does not guarantee the full period exists.
- Tick data can be very large. Export in bounded day batches and verify every file before combining.
- MT5 bar timestamps are broker/server time. Do not compare directly with UTC M15 until timezone mapping is verified.
- The public Exness Tick History archive is a separate indicative source; it is not a replacement for the exact Demo server's XAUUSDm feed.
- This exporter has been added to the research branch but has not yet been compiled in MetaEditor or executed against the user's Demo terminal. No data acquisition is claimed complete.

## Next processing gates

1. Compile the script and archive the MetaEditor compile log.
2. Export M5 first, then ticks in bounded batches.
3. Build a SHA-256 inventory and coverage receipt.
4. Validate duplicate/order/schema/OHLC/spread/volume and session gaps.
5. Verify server-time to UTC mapping.
6. Reconcile broker specification and costs before any backtest.

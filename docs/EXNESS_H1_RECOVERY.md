# Exness XAUUSDm H1 recovery procedure

## Scope and source identity

The canonical dataset in this PR is specifically **Exness MT5 Demo / Exness-MT5Trial7 / XAUUSDm / H1 / Bid chart OHLC** with native MT5 tick_volume and UTC bar-open timestamps. The historical outage currently recorded in the manifest is:

- Last bar before the outage: 2025-12-31T21:00:00Z
- First existing bar after the outage: 2026-11-06T00:00:00Z
- Gap between those timestamps: 7,419 hours

Do not fill this dataset from another symbol, a third-party mirror, or a source whose account/server and price basis cannot be proven.

## Preferred recovery route: exact MT5 Demo server

1. Connect the already-authorized MT5 terminal to the Demo account on Exness-MT5Trial7.
2. Confirm the terminal is connected and the exact symbol XAUUSDm exists.
3. Ensure the selected output volume has adequate free space. Do not delete workstation files to make room.
4. Export only the missing interval with the read-only exporter below. The default server and symbol checks are intentionally strict.

Example PowerShell command (change only the output drive to a volume with sufficient free space):

~~~powershell
python tools/export_exness_mt5_h1.py --from-utc 2025-12-31T22:00:00Z --to-utc 2026-11-06T00:00:00Z --output E:\NOVA_DATA\XAUUSDm_H1_recovery.csv --expected-server Exness-MT5Trial7 --symbol XAUUSDm
~~~

The exporter:
- calls only initialize, terminal/account/symbol metadata reads, copy_rates_range, last_error, version, and shutdown;
- fetches bounded UTC chunks to reduce terminal/API pressure;
- rejects a different server, non-Demo account, disconnected terminal, different symbol, invalid OHLC, fractional/negative tick volume, conflicting duplicate bars, empty responses, and incomplete current H1 bars;
- writes original native MT5 OHLC and tick_volume, plus CSV byte count and SHA-256;
- never overwrites an existing output unless the operator explicitly passes --overwrite;
- always records training_eligible=false and PENDING_MERGE_AND_FULL_DATASET_VALIDATION.

No order, position, trade, deposit, withdrawal, or account mutation API is called.

## Additional terminal history probe — 2026-11-07

A second read-only probe used `copy_rates_from_pos("XAUUSDm", TIMEFRAME_H1, 0, 30000)` on the same connected terminal. Source identity was rechecked immediately before the query:

- Server: `Exness-MT5Trial7`
- Account environment: Demo
- Exact symbol: `XAUUSDm`
- Symbol chart mode: `0 / BID`
- Terminal Max bars: `100000`
- Returned unique H1 bars: `29,572`
- First returned bar: `2021-01-03T23:00:00Z`
- Last returned bar: `2026-11-06T21:00:00Z`
- Bars from 2026-01-01 through 2026-10-31: `0`
- Largest gap remains `7,419 hours`, from `2025-12-31T21:00:00Z` to `2026-11-06T00:00:00Z`

This rules out a simple small-result-limit explanation: requesting up to 30,000 bars returns a broad history, but the missing interval is absent from the terminal history. The call did not write a file or alter trading state. The connected workstation currently reports 0 GB free on both C: and D:, so no export file was staged.

The other 17 unexplained gaps in the canonical manifest fall on dates that appear to coincide with major US holidays (Thanksgiving, MLK Day, Presidents Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Christmas and New Year). Treat these only as **holiday candidates**, not as resolved closures. Exness says its instrument schedule can be queried by instrument/date range and includes known holidays, maintenance and DST; exact historical XAUUSDm schedule evidence for this MT5 Demo server is still required before the validator may classify any of them as expected closures.

The official MT5 Python reference also states that returned bars are limited to history available on terminal charts and the Max bars setting, and that bar timestamps are UTC. Re-run the probe only after the terminal history has been refreshed or Exness provides a confirmed historical source.

## Exness public Tick History is a separate candidate source

Exness Tick History offers raw Bid/Ask ticks and identifies m as the Standard-account symbol suffix. However, Exness Help Center says the Tick History download cannot select a trading server and identifies its source servers as MT4 Real servers. This does not prove equivalence to the MT5 Demo Exness-MT5Trial7 feed.

Therefore:
- retain any Personal Area Tick History ZIP as a distinct raw source artifact;
- do not relabel it as an MT5 Demo H1 export;
- do not substitute tick count from that file into the canonical MT5 tick_volume column;
- any H1 bars derived from it must be stored in a separate dataset with a separate manifest, source-server caveat, bid/ask aggregation rule, and explicit derived-volume semantics;
- compare overlapping timestamps/prices with the Demo source before proposing any model use.

Official source guidance:
- https://get.exness.help/hc/en-us/articles/360021547851-Tick-history
- https://www.exness.global/tick-history/
- https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API (Standard MetaTrader accounts cannot connect to the Exness API)

## Release gate

After receiving a recovery segment:
1. Compare its manifest against the canonical dataset for exact server, account_environment, symbol, timeframe, timezone, price_basis, and chart_mode.
2. Merge only provenance-compatible bars. Reject conflicting overlaps; exact byte-identical duplicate timestamps may be deduplicated with an audit record.
3. Recompute the full CSV SHA-256 and manifest from the merged file.
4. Run python -m unittest discover -s tests -p "test_exness_*.py" -v.
5. Run python tools/validate_exness_h1_dataset.py --require-training-eligible --max-gap-hours 96.
6. Confirm the final-OOS boundary and all other model gates independently.

A successful export alone is not a successful recovery. Training remains blocked until the complete canonical dataset passes the exact-head validator and review.

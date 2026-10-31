# Wave3 SMC Gate Diagnosis and Historical News Calendar

Research-only notes for PR #66. The strategy contract is unchanged.

## Final OOS diagnosis

Dataset: Exness XAUUSDm M15, 2026-07-01 through 2026-10-29, 7,942 labeled rows. The source data hash begins \`7d16e54327bfeabe\`.

The earlier full model run had 34 Wave3 BUY entry-trigger rows:
- BOS20 was true on 21 rows.
- Three higher lows plus a green candle was true on 12 rows.
- FVG refill was true on 7 rows.
- The earlier implementation had zero OB-within-$5 matches on Wave3 triggers.

A second causal diagnostic found only one Wave3 row with BOS20, higher-lows/green, and FVG refill simultaneously: 2026-09-17 11:45 UTC. It had no qualifying bearish candle with range >=0.3% in the prior 8 or 20 bars. In a 48-bar search, the most recent qualifying candle was 36 bars old and $60.529 away. Therefore expanding the candidate lookback solely to make this OOS row pass would not be evidence-based.

There are 708 OOS rows where the corrected live bullish-OB state is within $5, but only one of the 34 Wave3 triggers has an active bullish OB within $5. No Wave3 trigger reaches SMC >=85, and no OOS row reaches SMC >=85. The SMC score weights remain BOS20=30, higher-lows+green=20, OB>=0.3% and within $5=25, FVG refill=25; the threshold remains >=85.

## OB validity implementation

The previous code imposed a 24-bar validity expiry. That age cap was an implementation assumption, not part of the supplied strategy contract. The current code keeps the minimum OB candle range >=0.3% and distance <=$5, but invalidates a bullish OB only when a candle closes below the OB low (and a bearish OB when it closes above the OB high). The hard gate still needs the OB to be present and within $5 on the signal bar.

The 24-bar \`*_recent\` field is retained for diagnostics only and does not contribute to SMC score. Additional age/distance/range columns are diagnostic-only and are excluded from XGB/LSTM model input. This avoids adding model features solely to investigate the blocker.

This correction is not a claim that the OOS gate now passes. The re-run diagnostics still show no row with all four SMC components.

## Historical USD high-impact calendar

\`tools/mt5_export_usd_high_impact_calendar.mq5\` is a read-only MT5 script. It queries \`CalendarValueHistory()\` in monthly windows for US/USD from 2022-07-21 00:00 UTC through 2026-10-30 00:00 UTC (end exclusive), looks up event importance through \`CalendarEventById()\`, and writes:

\`Common\\Files\\VOOM_USD_High_Impact_2022_2026.csv\`

Columns include timestamp, impact, currency, event, country, time_mode, calendar source/timezone, explicit UTC coverage bounds, event ID, and value ID.

Exness documents its trading-platform time as GMT+0. MQL5 calendar timestamps use the broker trade-server time. The exporter therefore labels the returned Exness event timestamps as UTC. Do not apply another timezone conversion.

### Run the exporter

1. In the active Exness MT5 terminal, open Navigator (Ctrl+N).
2. Expand **Scripts**, then **VOOM**.
3. Run **Export_USD_High_Impact** on any chart. The script only reads the economic calendar and writes a CSV; it contains no trade/order calls.
4. In the Toolbox **Experts** tab, confirm a \`NEWS_EXPORT_SUCCESS\` message. If \`NEWS_EXPORT_ERROR\` or \`NEWS_EXPORT_INVALID\` appears, do not use the partial calendar.
5. Copy the CSV from the terminal Common Files directory to the local research path \`datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv\` and pass it as \`--news-calendar\` to the research trainer.

If a high-impact event has date-only, no-time, tentative, or unknown time mode, the loader blocks that entire UTC date. Exact datetime events block the interval +/-30 minutes. A supplied calendar with no high-impact events or with insufficient coverage is rejected; it is never interpreted as all bars being safe.

On 2026-10-30 the exporter was run from the active Exness Demo MT5 Navigator. The Experts log recorded NEWS_EXPORT_SUCCESS twice; each marker reported 2,166 high-impact events, 15,853 queried calendar values, and zero unknown time modes. The output CSV is 388,313 bytes with 2,166 records and the expected 12 columns. Validation found no timestamp parse errors, blank required fields, duplicate event/value ID pairs, non-USD/non-high-impact rows, or events outside the declared UTC coverage. All records currently have time_mode=datetime; event timestamps range from 2022-07-21T12:30:00Z through 2026-10-29T12:30:00Z. The verified file is stored in datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv on the research branch.

The first full-loader smoke test exposed a timestamp-resolution bug: pandas preserved event timestamps at microsecond resolution while market bars used nanoseconds, but both were converted directly to int64 for distance comparisons. That unit mismatch incorrectly marked all 101,076 bars unsafe. The loader now explicitly normalizes both arrays to nanoseconds before comparing; a regression test covers the mixed-resolution case. On the 101,076-bar dataset, the corrected loader now marks 95,099 bars safe and 5,977 bars blocked (94.0866% safe). The fixed +/-30-minute window and fail-closed behavior for untimed events remain unchanged.

The calendar is now connected to the research workflow through an explicit --news-calendar argument and separate report/model output paths. A new OOS run is still required; the previous report predates this calendar and the timestamp fix and must not be treated as the fresh calendar-filtered result.

## Performance and safety

The prior full-model OOS result remains blocked: accuracy 41.5135% versus 45.9708% majority baseline, 0 closed trades, and no supported profit factor. This result predates the OB-validity correction and is not a fresh performance result.

Do not lower XGB >=75%, LSTM >=80%, ensemble >=85%, SMC >=85, Fib/RSI/volume/spread/news requirements, fixed 60:40 model weights, or risk controls to increase trade count. The model is not production-eligible. Orders remain disabled and Live Trading remains OFF.


## Latest calendar-filtered causal gate review — artifact #2

The completed report in [workflow run 41051313086](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41051313086) confirms the historical calendar was applied: 7,421/7,942 final OOS bars passed the news exclusion; all 2,166 exported events are `datetime` mode.

On the 34 final-OOS Wave3 entry-trigger rows:
- BOS20: 21 rows.
- CHoCH / three-higher-lows diagnostic: 12 rows.
- FVG refill: 7 rows.
- Active bullish OB within $5: 1 row; inside the OB zone: 0 rows.
- Maximum SMC score on Wave3 entry rows: 75/100; SMC >=85 survivors: 0.

This remains a component-alignment bottleneck, not evidence to relax the scoring contract. Keep BOS20=30, three-higher-lows+green=20, qualifying OB=25, FVG refill=25, OB size >=0.3%, proximity <=$5, and SMC >=85 unchanged. Audit causal timestamp ordering, OB candidate origin, close-through invalidation, zone distance, and whether BOS/CHoCH/FVG/OB were simultaneously available on the signal bar. Do not expand lookback or change weights to make the single OOS candidate pass.

Classification also remains below baseline: 41.3246% accuracy versus 45.9708%; all five walk-forward folds below their own majority baselines. Final OOS trades: 0; PF undefined. The strategy is not performance-qualified.

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


## Data and diagnostic snapshot provenance

The older `reports/wave3_smc_gate_diagnostic_20261030.json` is preserved as a pre-calendar-export snapshot and still records `export_executed=false`; do not use its news-calendar section as current status. The current calendar-filtered SMC snapshot is `reports/wave3_smc_gate_diagnostic_20261031.json`, derived from training artifact #2 and prior Exness MT5 Common Files CSV/Experts-log evidence. The canonical Git CSV SHA-256 is `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`. The raw terminal CSV is not present in this checkout; the raw digest recorded in the prior note has only 58 hexadecimal characters and is not a valid SHA-256. Treat raw-terminal digest provenance as unverified until the original raw file is re-exported or supplied.


## SMC score field semantics — do not conflate event labels

The implementation's scored components are more specific than the report's legacy field names:
- The 30-point BOS component is `bos20_up` (close above the previous 20-bar high), not the separate structural `bos_up` event.
- The 20-point component is `choch_rule_up`: the three latest confirmed swing lows are strictly ascending and the current closed candle is green. It is **not** the separate structural `choch_up` event. The legacy report field `wave3_entry_rows_with_choch` currently counts `choch_rule_up`; interpret it as three-higher-lows + green.
- The 25-point OB component is a valid bullish OB within $5. Price need not be inside the OB zone; `bull_ob_zone` is a separate diagnostic.
- The 25-point FVG component is the current candle intersecting the active bullish FVG within the existing 48-bar validity window.

Because the four weights total 100 and the gate is >=85, **all four components must be present on the same signal row**; missing any one caps the score at 75. The current 75/100 maximum is therefore consistent with at least one missing component. OB-within-$5 is rare (1/34 Wave3 triggers), but marginal counts alone do not prove OB is the only blocker. Candidate-level causal alignment is still required. Do not change the weights, 48-bar FVG window, OB size/proximity rules, or SMC threshold.

## Candidate-level causal trace and FVG mitigation addendum — 2026-11-01

The exact-head SMC/Wave3 CI generated a diagnostic-only trace for all 34 Wave3 final-OOS trigger rows: [CI run #84](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41271885730), artifact #13070220119 (archive SHA-256 `f67f6e0cbe0bd74657a83b8c828eb2f7120e3882a4c048c07c4c2cc549636a2e`). The provenance-bound summary is `reports/wave3_smc_candidate_trace_audit_20261101.json`.

- Same-closed-bar component counts: BOS20=21, three confirmed higher lows + green=12, OB within $5=1, FVG overlap=7. All-four intersection=0; maximum SMC=75; SMC>=85=0.
- Pairwise intersections: BOS20+rule-CHoCH=9; BOS20+OB=0; BOS20+FVG=3; rule-CHoCH+OB=0; rule-CHoCH+FVG=3; OB+FVG=0.
- Eleven candidates had a selected OB; all were valid on the signal bar, only one was within $5, and none was inside the zone. The only within-$5 candidate (2026-08-25 05:15 UTC) had structural CHoCH-up but not the scored three-higher-lows+green rule; BOS20 and FVG were also absent. Structural CHoCH must not be substituted for `choch_rule_up`.
- The diagnostic-only FVG convention records full mitigation when a closed-bar low reaches the bullish gap's lower boundary. Of the seven FVG-positive candidates, all had first overlap before the signal bar; five had already reached full mitigation on an earlier bar, and two first reached full mitigation on the signal bar. The current scored `bull_fvg_fill` remains any bar-range overlap with the most recent bullish FVG inside its 48-bar age window, and the active gap is not deactivated after full mitigation. This behavior matches the current code-level definition but the strategy brief does not explicitly state whether post-full-mitigation re-touches should remain eligible. Treat this as a definition question, not an automatic bug fix.

The audit added first-overlap/full-mitigation trace fields and regression tests only. Existing `bull_fvg_fill` scoring, 48-bar window, SMC weights, lookbacks and thresholds are unchanged. The new trace fields are excluded from model features. Candidate-level trace and no-lookahead tests passed; no model training was run.

Latest completed benchmark run #6 remains blocked: accuracy 41.0602% vs 45.9708% majority baseline, balanced accuracy 38.8382%, macro-F1 38.0253%, 0 closed trades, net $0, PF unavailable; all five walk-forward folds below baseline. Keep the benchmark research-only; no orders, merge, deployment or Live Trading.


## 2026-11-02 revalidation — canonical data, corrected FVG summary and P2 separation

### Canonical dataset and calendar

- Current main SHA: `a9bb92c9d2642eff34be2ea68276a33b367ee793`. PR #66 was synced to this main with non-force merge commit `c5f93321a9a2c88310ddd0113c07d6580bb93d89`; current PR #66 remains Draft/open/unmerged.
- The current Git blob for `datasets/exness-demo/XAUUSDm_M15_2022-2026.csv` was independently hashed: 8,483,411 bytes, SHA-256 `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`. The prior metadata size 8,584,488 did not match the canonical Git blob; `metadata.json` now records 8,483,411 as current canonical size and preserves the previous value separately.
- The canonical news CSV was independently hashed from the current Git blob: 386,146 bytes, SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`. Validation: 2,166 rows and unique event/value pairs; all high-impact USD/US; all `datetime`; zero required blanks, duplicates, invalid timestamps or out-of-range events; declared coverage [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z).
- This is a repository-byte revalidation, not a fresh MT5 run. Prior evidence records two `NEWS_EXPORT_SUCCESS` markers in `MQL5/Logs/20261030.log`; the log and raw Common\Files CSV were not freshly collected in this automation run. The raw digest value currently in the old note is malformed (58 hex characters); a different 64-character value elsewhere in the README is also not independently verifiable here. Do not treat either raw digest as confirmed.

### Exact-head SMC trace after summary correction

[SMC/Wave3 Research CI #100](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41384850474) completed successfully on diagnostic code head `c5a8f74eedf541d7d5c02bc22b7a8d84b71db29c`. Artifact #13114907526 has archive SHA-256 `b4337ccf43c513f10d8dd35645dbd6a8c696429dded2302ce9572d391e8c9515`; the JSON inside has SHA-256 `5e138f9525fa2a352e07ea7a9f9b41c1d86915f184aca3de9d44e4511f4c0ff5`. The provenance-bound summary is `reports/wave3_smc_candidate_trace_revalidation_20261102.json`.

- Candidate rows 34; BOS20=21; scored three-higher-lows+green=12; qualifying OB within $5=1; FVG overlap=7; all-four same-bar=0; maximum SMC=75; SMC>=85=0. Pairwise intersections remain BOS20+rule-CHoCH=9, BOS20+OB=0, BOS20+FVG=3, rule-CHoCH+OB=0, rule-CHoCH+FVG=3, OB+FVG=0.
- The previous summary field `fvg_full_mitigation_on_signal_bar` conflated a current-bar full-mitigation touch with the first full-mitigation event. The diagnostic-only code/test now distinguishes them: first full mitigation occurred exactly on 2/7 FVG-positive signal bars; 5/7 were already fully mitigated earlier. Current-bar full-mitigation touches occurred on 7/7 FVG-positive rows and 9/34 candidates overall, including re-touches. This fixes reporting semantics only; `bull_fvg_fill`, the 48-bar window and all SMC gates remain unchanged.
- No model training occurred; final OOS was used only to reproduce the existing candidate mask and was not used for tuning. No weights, lookbacks, thresholds or gates changed.

### Run #6 model provenance and performance

The latest completed benchmark remains Run #6 on training commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, workflow run [#6](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41184502320), artifact #13036729349 (archive SHA-256 `bfc4bb6419eb4226ba90bea6ad940b036847d4d6be5522af023629d960003bd4`). Its artifact manifest SHA-256 is `7470adc0f28f298e1e83225aa11707807e27c56ea8de667e29cb038b0fc78550`; report SHA-256 is `3d1642375fe92b5232caf192945266056b100fa90f305bcf97ec4ccf7a2a8acc`. A versioned manifest copy is now stored at `models/wave3_news_calendar_20261030/model_manifest.json`; model binaries remain in the Actions artifact, not Git.

Final OOS (7,942 rows): accuracy 41.0602% vs majority baseline 45.9708%; balanced accuracy 38.8382%; macro-F1 38.0253%; closed trades 0; net $0; PF unavailable. All five walk-forward folds remain below their majority baselines. Calibration is absent. The artifact manifest still records commission at $0 per lot per side because the actual Exness Demo commission schedule was not verified; therefore net expectancy is not fully cost-validated.

### Separate PR #147 P2 status

PR #147 remains a separate Draft/open/unmerged research path. Its isolated first-hit target builder and 11 synthetic unit tests are in `research/wave3_challenger/`; P2 CI #6 passed. The builder requires verified commission provenance, censors incomplete end-of-data outcomes, and does not generate signals or train models. It has not been run on real Exness data because commission evidence is still missing. Do not fold it into PR #66.

### MT5 evidence required for a fresh export

No MT5 terminal was controlled in this run. If a new terminal proof is needed, copy `tools/mt5_export_usd_high_impact_calendar.mq5` to the terminal's `MQL5/Scripts/` folder, compile it in MetaEditor, then run `mt5_export_usd_high_impact_calendar` from MT5 Navigator > Scripts with the default coverage inputs (2022-07-21 00:00 through 2026-10-30 00:00 exclusive). The script writes `VOOM_USD_High_Impact_2022_2026.csv` to the terminal's shared `Common\\Files\\` folder and prints `NEWS_EXPORT_SUCCESS` in the Experts log. Supply that CSV and the date-matched `MQL5/Logs/YYYYMMDD.log` for byte-level raw-export verification.

# Wave3 model training and validation contract

This change adds a deterministic, rerunnable training pipeline on the feature branch. It does not change main, deploy workers, or submit broker orders.

## Data

The dataset is exported from the connected Exness Demo MT5 account for the terminal-listed symbol XAUUSDm, M15, UTC. See datasets/exness-demo/metadata.json. The exported history contains 101,076 unique closed bars and no account identifier or credentials.

## Model

- XGBoostClassifier multiclass model with class-balanced sample weights.
- A two-layer PyTorch LSTM trained on 60 consecutive closed M15 bars, with class-aware loss weighting; ensemble probabilities combine XGB 60% and LSTM 40%.
- Three labels: short / hold / long. Labels use a 12-bar forward return and a threshold at least twice the spread or 0.35 ATR times square root of horizon.
- The final model uses only data before 2026-07-01, with a 12-bar purge at the boundary.
- Model feature columns and training period are saved in the manifest.
- Artifacts are reloaded after serialization and must reproduce the in-memory prediction probabilities on a held-out sample.

## Validation

Chronological expanding-window folds test 2024-H1, 2024-H2, 2025-H1, 2025-H2 and 2026-H1. The final holdout starts 2026-07-01 and ends at the latest labeled row in the dataset. Fold boundaries purge the forward label horizon to avoid labels crossing the test window.

The v6.2.6.3 research simulator is BUY-only and requires every supplied hard gate: Wave3/Fib score >=80, SMC >=85, XGB BUY >=75%, 60-bar LSTM BUY >=80%, 60/40 ensemble BUY >=85%, RSI/momentum/volume/Fib61.8/discount/M15+H1 trend/ATR/spread filters and a genuine high-impact news calendar. It applies a $5 stop, $11 target (2.2R), fixed 0.01 lot, recorded spread, slippage and stop-first OHLC handling. No news calendar means fail-closed zero trades. The report must show zero trades if the setup rules produce none rather than inventing signals.

## Limitations that remain

Historical tick-level fills, variable latency, account-specific commission schedule, and live market conditions are not proven by an OHLC simulation. XGB/LSTM outputs are raw direction-class probabilities, not calibrated trade-win probabilities; the training label is a 12-bar forward move and is not the fixed-SL/TP first-hit trade outcome. Maximum drawdown is computed from closed-trade equity. This is research evidence only; deployment or live trading activation requires separate review and remains disabled.


## Historical baseline run (pre-v6.2.6.3; XGBoost + MLP)

The models trained and the serialized artifacts reloaded with matching probabilities on 256 held-out rows. Five expanding walk-forward periods completed. On the separate final OOS window (2026-07-01 through 2026-10-29 13:45 UTC), the ensemble had 7,942 labeled rows, 40.7832% accuracy, 38.6227% balanced accuracy, and 36.2830% macro-F1. The majority-class accuracy baseline was 45.9708%, so the model did not beat the simple baseline.

The final OOS set had 53 long and 63 short Wave3 breakout features; after SMC confluence there were 41 long and 46 short candidates. None passed the frozen model-probability threshold/margin, so there were zero closed OOS trades. Win rate and profit factor are therefore unavailable, not zero. The explicit performance gate is blocked. This means the training/integration work is complete, but the strategy has not demonstrated an out-of-sample trading edge and must not be activated or deployed for trading.


## v6.2.6.3 FINAL entry-contract implementation

This research branch now encodes the BUY checklist as hard gates instead of lowering confidence thresholds to create trades:

- Wave1 size >= $10 for the XAUUSDm sample; Wave2 pullback 45-85% (score 95 for 55-65%, otherwise 80 in the accepted zone); entry trigger at Wave1 high + 20% of Wave1 size.
- SMC score uses BOS20 +30, three rising confirmed swing lows with a green candle +20, a >=0.3% opposing candle OB within $5 +25, and a filled bullish FVG +25. A score >=85 effectively requires all four conditions with these weights.
- XGBoost BUY >=75%, a real 60-bar PyTorch LSTM BUY >=80%, both models must choose BUY, and the weighted ensemble (60% XGB / 40% LSTM) must be >=85%.
- Additional hard gates: RSI 50-70, positive five-bar momentum, volume >80% of EMA20, Fib 61.8% within an assumed +/-5 percentage points, Discount half of the rolling 100-bar range, M15 close > EMA21 > EMA50, completed H1 uptrend, a $5 stop fitting within 1.5 ATR, and XAU spread <=$0.35.
- Research simulation locks lot=0.01, SL distance=$5, TP distance=$11 (RR 2.2), at most one concurrent position, max five entries per UTC day and daily realized-loss stop at $500. No order-placement code is called.
- High-impact news avoidance is mandatory. Supply a CSV with UTC `timestamp` and `impact` columns using `--news-calendar`; bars within +/-30 minutes are blocked. If the calendar is absent, the backtest fails closed (zero eligible trades), and the gate is explicitly blocked.

### Spec decisions / incomplete evidence

The original description conflicts on stop loss: `Wave2 Low - $5` differs from the example's locked $5 distance from Entry. The simulation follows the explicit final lock/example: Entry - $5 SL and Entry + $11 TP. The stated 1% risk sizing also conflicts with the final instruction to use a fixed 0.01 lot, so the simulation uses the safer fixed 0.01 lot and does not claim this equals 1% risk. Only BUY rules were provided, so SELL generation remains disabled. BTC thresholds are not validated by this XAUUSDm dataset. The +/-5 percentage-point Fib 61.8 tolerance is an explicit research assumption because no tolerance was supplied.

Win Rate 92.3% and Profit Factor 5.10 are claims in the supplied strategy brief, not independently reproduced results. They must not be reported as achieved until the independent walk-forward/OOS run verifies them after realistic costs. The branch is research-only, the performance gate remains independent, and Live Trading/order submission remain OFF.

## v6.2.6.3 measured results — 2026-10-30

The full local run completed successfully: all five chronological walk-forward fits and the final OOS fit ran; XGBoost + PyTorch LSTM artifacts were saved and reloaded, reproducing the ensemble probabilities within 1e-6 on 256 held-out rows.

- Final OOS: 7,942 rows; accuracy 40.4810%, balanced accuracy 39.3026%, macro-F1 38.7415%, versus majority baseline accuracy 45.9708%.
- Walk-forward accuracy was 43.2446% (2024-H1), 42.1457% (2024-H2), 40.2682% (2025-H1), 32.1059% (2025-H2), and 34.8372% (2026-H1). None beat its majority-class baseline.
- Strict BUY gate diagnostics on final OOS: 34 Wave3 entry-trigger rows; maximum SMC score was 80/100 across all bars and 75/100 on Wave3 entry-trigger rows. No row reached SMC >=85. Of those 34 Wave3 entry rows, BOS20 appeared on 21, the three-higher-lows/green-candle CHoCH gate on 12, OB-within-$5 on 0, and FVG fill on 7.
- No final-OOS row passed the XGB >=75% BUY+agreement, LSTM >=80% BUY+agreement, or 60/40 ensemble >=85% BUY+agreement gates. The threshold values were not lowered or optimized against the final holdout.
- No historical high-impact news calendar was supplied. The +/-30-minute news filter therefore failed closed by design. Final OOS generated zero closed trades; win rate and profit factor are null/undefined, not zero. The performance gate remains blocked and production eligible is false.

The result is a successful training and verification run, **not** a successful trading-performance result. The specified v6.2.6.3 rules currently admit no final-OOS trades and classification remains below baseline. Do not activate the model or infer WR 92.3% / PF 5.10 from the supplied target claims. Additional evidence needed to evaluate a possible rule interpretation is a genuine historical high-impact calendar plus review of how SMC components should combine across a setup; this branch has not weakened any gate to manufacture signals. Live Trading and order submission remain OFF.

The prior deep_mlp.joblib artifact is retained in the repository for audit/provenance and is not used by the v6.2.6.3 pipeline; the active deep model is deep_lstm.pt.


## Automatic model tuning — nested and bounded

A deterministic seeded search now runs independently inside each outer walk-forward training window. It evaluates the baseline plus three XGBoost hyperparameter candidates over two chronological inner validation windows. Each inner split purges the 12-bar label horizon before validation. Candidate comparison uses the fixed 60% XGB / 40% 60-bar LSTM ensemble and a composite score of balanced accuracy, macro-F1, and normalized multiclass log loss, with a penalty for fold-to-fold score variability. The selected XGB parameters are then refit on the full outer training window before evaluation on its later outer test window.

The final model's tuning uses only data before 2026-07-01. Final OOS is not read by the tuner and is not used for feature selection, hyperparameter selection, or thresholds. The strategy contract is immutable during tuning: SMC >=85, Fib >=80, XGB >=75%, LSTM >=80%, ensemble >=85%, 60/40 model weights, and all other entry/risk gates remain fixed. Tuning changes model capacity/regularization only; it is not allowed to relax the entry checklist or force trades. All trials, inner-fold metrics, selected hyperparameters, and fixed-gate declarations are written to reports/wave3_auto_tuning_history.json and model_manifest.json.

## Latest nested auto-tuned result — 2026-10-30

Authoritative report: `reports/wave3_auto_tuned_20261030_report.json`. This is the latest nested-tuning run; the earlier `reports/wave3_exness_xauusdm_m15_report.json` and the pre-tuning figures above are retained for historical comparison, not as the current result.

- Dataset: Exness Demo XAUUSDm M15, 101,076 closed bars; final OOS has 7,942 labeled rows beginning 2026-07-01 UTC. Final OOS was excluded from tuning.
- Final OOS classification: accuracy 41.5135%, balanced accuracy 39.4037%, macro-F1 37.2134%; majority/always-hold baseline accuracy 45.9708%. The model did not beat the baseline.
- Five expanding walk-forward accuracies: 42.7755% (2024-H1), 41.4606% (2024-H2), 37.9556% (2025-H1), 34.5858% (2025-H2), and 38.1971% (2026-H1). None beat its majority-class baseline.
- Final OOS produced 34 Wave3 entry-trigger rows, but maximum SMC on those rows was 75/100; zero rows met SMC >=85. XGB BUY >=75% agreement and ensemble BUY >=85% agreement counts were zero. Although 50 rows met the LSTM >=80% probability diagnostic, none survived the preceding hard gates.
- Closed trades: 0. Win rate and profit factor are undefined, not 0%. The minimum 30-trade requirement, positive net profit, and PF >1.0 were not established.
- No verified historical high-impact USD calendar was supplied. The +/-30-minute news exclusion therefore fails closed; a genuine calendar is still required for a fresh OOS run.

The 92.3% win-rate and PF 5.10 figures in the original strategy brief remain unverified claims. The tuned classification probabilities are not calibrated probabilities of a trade winning. Do not weaken the Fibonacci, SMC, XGB, LSTM, ensemble, news, spread, or risk gates to manufacture signals. This run is training/backtest evidence only; production eligibility remains false and Live Trading/order submission remain OFF.


### Latest calendar-filtered OOS update — 2026-10-30

The newer run supersedes the older pre-calendar limitation and baseline as the latest measured result. Workflow: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41022129986 (commit 80c503750a9db669e615b13b3c0006daf158c641). The validated Exness calendar was applied (7,421 news-safe rows). Final OOS: 7,942 samples, accuracy 41.3246%, balanced accuracy 39.1057%, macro-F1 37.6761%, versus 45.9708% majority baseline. All five walk-forward folds remained below their majority baselines. Closed trades: 0; PF undefined. On 34 Wave3 entry rows, maximum SMC was 75; XGB BUY >=75% agreement and ensemble BUY >=85% agreement counts were 0. The run is not performance-qualified. The generated report contained stale no-calendar wording; the report generator was corrected to describe calendar availability from the actual run state. A fresh run is required to verify the corrected report text.

## Latest calendar-filtered run — artifact #2 (2026-10-30)

The report-generator correction was exercised by a completed, push-triggered training run:
- Workflow: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41051313086
- Training code SHA: `817b0d328d49e2cd80de139fe08183ada8c7cd29`
- Artifact ID: `12974688556`; artifact SHA-256: `565d40daadc58f4e7216dd47a0373d9fa093b9c476fdde21645d10478ddc5267`
- The report's `limitations` now correctly states that the validated historical high-impact calendar was supplied and applied. The model manifest still had a stale `backtest_assumptions.news` sentence and did not record the calendar file hash; the current source correction adds conditional wording and full calendar provenance for the next run.

### Current measured result

Final OOS (2026-07-01 through 2026-10-29 13:45 UTC): 7,942 rows; accuracy **41.3246%**, balanced accuracy **39.1057%**, macro-F1 **37.6761%**, below the 45.9708% majority/always-hold baseline. Closed trades **0**, net profit $0, profit factor unavailable (no closed trades). Production eligibility remains false.

All five walk-forward folds remained below their respective majority baselines:
- 2024-H1: 42.7243% vs 47.4667%
- 2024-H2: 42.0872% vs 47.0338%
- 2025-H1: 38.6348% vs 44.6871%
- 2025-H2: 33.8427% vs 46.3677%
- 2026-H1: 36.1176% vs 46.5584%

Training labels: short 23,193; hold 43,363; long 26,459. Final OOS actual labels: short 2,198 / hold 3,651 / long 2,093; predictions: short 3,567 / hold 3,239 / long 1,136. The model overpredicts short and materially underpredicts long (OOS long recall 16.53%). No probability calibration method, reliability curve, Brier score or expected calibration error is recorded. XGB/LSTM outputs remain raw direction-class probabilities, not calibrated trade-win probabilities. LSTM training loss falls from 1.0685 to 0.8993 over four epochs, but no independent probability-calibration evidence is present.

The validated calendar was applied: 2,166 high-impact USD events, all `datetime` mode; 7,421 of 7,942 final OOS bars passed the news exclusion. The final OOS was not used for tuning.

### Current gate blockers

- 34 Wave3 entry-trigger rows; max SMC on those rows 75/100; SMC >=85 survivors 0.
- BOS20 on 21 triggers; CHoCH/three-higher-lows diagnostic on 12; FVG refill on 7; only 1 trigger had an active bullish OB within $5 and none was inside the OB zone.
- XGB BUY >=75% with agreement: 0; LSTM BUY >=80% and agreement: 87 diagnostic rows, but 0 survive the preceding mandatory gates; ensemble BUY >=85% with agreement: 0.
- All five walk-forward periods and final OOS remain below baseline; final OOS closed trades remain below the minimum 30.

Do not tune on final OOS, lower thresholds, change SMC weights/lookback, or enable orders. Next research work is causal event alignment for OB/FVG/BOS/CHoCH, training-only class/feature analysis, and calibration using inner/validation folds only, followed by a fresh untouched OOS evaluation.


## Dataset hash reconciliation and feature diagnostics — 2026-10-31

Both completed calendar-filtered training artifacts (workflow runs [41022129986](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41022129986) and [41051313086](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41051313086)) report the same trainer-computed dataset SHA-256: `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`. The older `datasets/exness-demo/metadata.json` value `7d16e543...` did not match either training artifact and has been reconciled to the repeated trainer result. A workflow preflight that independently recomputes and asserts the dataset hash remains a follow-up safeguard.

Final-model XGBoost gain importance (training fit diagnostic, not causal evidence): `hour_sin` 101.51, `volume_gate` 63.98, `hour_cos` 38.95, `log_volume` 22.86, `realized_vol_24` 22.28, `atr_price` 21.50, `weekday_sin` 21.18, `bear_ob_within5` 21.00, `wave3_long_zone` 19.77, `spread_price` 18.02. The model uses 73 of 89 feature columns. Time-of-day, volume, volatility and spread features rank prominently; gain importance does not establish causal predictive value and must not be used as a reason to remove hard gates.

Class proportions: training labels short/hold/long = 24.93% / 46.62% / 28.45%; final OOS actual = 27.68% / 45.97% / 26.35%; final OOS predictions = 44.91% / 40.78% / 14.30%. This shows a strong prediction skew toward short and underprediction of long despite class-weighted training. No probability calibration is applied; Brier/ECE/reliability diagnostics are not yet recorded. Any future calibration study must use inner/validation folds only and must not use final OOS to select or tune a calibrator.


## Run #3 artifact audit and pinned calendar preflight — 2026-10-31

Source: [GitHub Actions run #41163353027](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41163353027), training commit `70fa601ebfaf8b992f80c5b27a60247979e7bceb`, artifact #13028341403, archive SHA-256 `218e15c46b8db53c37d263482d96845fa90addab0e292f04c53a91b694b20c17`. The run's calendar validation and training/backtest steps completed successfully. This is a successful research execution, not a passed performance gate.

The downloaded artifact's `model_manifest.json` and report both record:
- Candle CSV SHA-256 `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`, 101,076 XAUUSDm M15 bars, 100,965 usable labeled rows.
- Canonical Git-tracked news CSV SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`, 2,166 high-impact USD events, all `datetime`, source MQL5 Economic Calendar, Exness GMT+0, coverage [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z). The Git-tracked file's byte length is 386,146.
- 95,099/101,076 total market bars were news-safe; in final OOS 7,421/7,942 bars were news-safe and 521 were blocked.

Final OOS remains untouched from 2026-07-01: 7,942 samples, accuracy 41.3246%, balanced accuracy 39.1057%, macro-F1 37.6761%, versus 45.9708% majority baseline. All five walk-forward folds are below their fold baselines. The final model used two inner chronological validation folds per tuning window, four seeded XGB candidates, and a 12-bar purge; report methodology says `final_oos_used_for_tuning=false`. The artifact has zero closed trades, $0 net profit, and null/unavailable PF. SMC maximum on Wave3 entry rows is 75, with zero rows passing >=85. The gate remains blocked.

### Calendar byte provenance distinction

The canonical Git-tracked file is independently verified at 386,146 bytes with SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`. The raw Exness MT5 Common Files CSV is not present in this checkout, and raw digest values recorded in prior notes are inconsistent (one supplied value is only 58 hexadecimal characters). Raw-terminal size/hash provenance is therefore not independently verified in this run; do not infer CRLF normalization or raw bytes until the original file is re-exported or supplied.

### Independent preflight

The research branch now contains `tools/verify_wave3_news_calendar.py`, which computes SHA-256 from raw file bytes and fails closed unless it equals the pinned canonical Git-file digest above. `.github/workflows/wave3-research-train.yml` runs this preflight before schema/coverage validation and training. `tests/test_wave3_calendar_hash.py` covers the canonical file, modified bytes, and malformed digest; SMC/Wave3 Research CI includes that test. This check protects the exact tracked input bytes; it does not substitute for re-verifying the original MT5 terminal file.

No frozen strategy weights, lookbacks, thresholds, entry/risk/news gates, or 12-bar purge were changed. No orders were submitted; Live Trading and deployment remain OFF.


## Revalidated evidence — 2026-11-01

### Repository synchronization
Current `main` is `99d474038e19a6eab884c5c891b21770c50fefa5`. The benchmark branch was synced with a non-force merge commit `e8b79297bf5a88cb51c08006e38787fb4f41bea3`; its latest compare at this documentation snapshot is 46 commits ahead / 0 behind current `main`. The separate redesign branch was also synced; neither PR was merged.

### Exness MT5 calendar byte-level provenance
Prior evidence records two `NEWS_EXPORT_SUCCESS` markers in `MQL5/Logs/20261030.log`, each reporting 2,166 high-impact events, 15,853 queried values and zero unknown time modes. This is historical evidence only; the log and raw `Common/Files/VOOM_USD_High_Impact_2022_2026.csv` were not freshly collected in this run. The raw digest is not verified: the 58-character value is not a valid SHA-256, and a different 64-character value in earlier notes cannot be reproduced from the raw file because it is unavailable.

The canonical Git file validates to 2,166 unique high-impact USD/US rows, 12 expected headers, all `datetime` mode, no blank/extra/missing/duplicate rows and no out-of-range timestamps. Coverage metadata is [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z), Exness server GMT+0. The workflow's independent SHA preflight is pinned to the canonical Git bytes; it does not verify the unavailable raw terminal file.

### Latest completed artifact — run #6
- Workflow: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41184502320
- Training commit: `5fda3b8eb502d5694639a3afef354de0876ff2de`
- Artifact: #13036729349; archive SHA-256 `bfc4bb6419eb4226ba90bea6ad940b036847d4d6be5522af023629d960003bd4`
- Report SHA-256 `3d1642375fe92b5232caf192945266056b100fa90f305bcf97ec4ccf7a2a8acc`; model-manifest SHA-256 `7470adc0f28f298e1e83225aa11707807e27c56ea8de667e29cb038b0fc78550`.
- Data SHA-256 `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`; 101,076 XAUUSDm M15 bars; final OOS starts 2026-07-01 and was excluded from tuning; 12-bar purge retained.
- Calendar SHA-256 in artifact `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`; 2,166 events; 95,099/101,076 total bars news-safe; 7,421/7,942 final-OOS bars news-safe.

Final OOS: 7,942 rows; accuracy 41.0602% vs 45.9708% majority/always-hold baseline; balanced accuracy 38.8382%; macro-F1 38.0253%; closed trades 0; net profit $0; PF unavailable. All five walk-forward accuracies (42.6987%, 42.0120%, 38.6520%, 35.0200%, 36.6160%) remain below their fold baselines (47.4667%, 47.0338%, 44.6871%, 46.3677%, 46.5584%). Training labels short/hold/long: 23,193 / 43,363 / 26,459. Final OOS actual: 2,198 / 3,651 / 2,093; predicted: 3,286 / 3,241 / 1,415. Long recall is 20.1147%; the model overpredicts short and underpredicts long. Probability calibration remains `not_calibrated`; Brier, ECE and reliability curve are null.

SMC final-OOS diagnostics: 34 Wave3 triggers; maximum score on trigger rows 75/100; BOS20=21, three confirmed higher lows + green=12, active bullish OB within $5=1 (inside zone=0), FVG refill=7; XGB BUY >=75% with agreement=0; LSTM BUY >=80% diagnostic=120 but none survive prior mandatory gates; ensemble BUY >=85% with agreement=0. This is still aggregate evidence only. Candidate-level traces must record same-closed-bar availability, structural BOS/CHoCH separately from `bos20_up`/`choch_rule_up`, OB origin/zone/range/distance/invalidation, and FVG creation/refill/mitigation. Do not infer that OB alone causes the score ceiling.

The artifact manifest confirms model round-trip verification on 256 held-out rows with maximum probability difference <=1e-6. Commission remains assumed zero due insufficient verified account schedule; slippage remains an assumption. Performance gate remains blocked and production eligibility false. No frozen gate, weight, lookback, threshold or 12-bar purge changed.

## P1 candidate-level causal audit and FVG mitigation follow-up — 2026-11-01

The exact-head SMC/Wave3 Research CI #84 completed the diagnostic-only candidate trace and uploaded artifact #13070220119 (archive SHA-256 `f67f6e0cbe0bd74657a83b8c828eb2f7120e3882a4c048c07c4c2cc549636a2e`). The summarized, provenance-bound result is committed at `reports/wave3_smc_candidate_trace_audit_20261101.json`. The run used the Exness XAUUSDm M15 dataset SHA-256 `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266` and canonical LF news-calendar SHA-256 `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`. It selected 7,942 already-labeled final-OOS rows only to reproduce the existing holdout row mask; no model was trained and no final-OOS value was used for tuning.

### Same-closed-bar result

- 34 Wave3 BUY trigger rows; all-four SMC components aligned on the same signal bar: **0**; SMC >=85: **0**; maximum score: **75**.
- BOS20=21, three confirmed higher lows + green candle=12, qualifying OB within $5=1, FVG overlap/refill=7.
- Pairwise intersections: BOS20+rule-CHoCH=9; BOS20+OB=0; BOS20+FVG=3; rule-CHoCH+OB=0; rule-CHoCH+FVG=3; OB+FVG=0.
- Eleven candidate rows had a selected OB, all remained valid; only one was within $5 and none was inside the zone. That one candidate (2026-08-25 05:15 UTC) scored 25 because BOS20, the scored higher-lows rule and FVG were absent. This shows OB is a necessary blocker in this candidate set but not the only failing component.
- Structural BOS/CHoCH are kept separate from scored BOS20 and the three-higher-lows+green rule. Four structural CHoCH-up rows did not intersect the 12 scored higher-lows-rule rows; this is a semantic distinction, not a reason to silently substitute one field for the other.

### FVG first touch versus full mitigation

Diagnostic-only fields now record first overlap, first full mitigation (closed-bar low reaching the bullish gap's lower boundary), current-bar full mitigation and post-mitigation re-touch. The existing `bull_fvg_fill` scoring flag is unchanged: it still reports any bar-range overlap with the most recent bullish gap during its 48-bar active window. In the 7 FVG-positive Wave3 candidate rows, all had first overlap before the candidate bar; **5/7** had already reached full mitigation on an earlier bar, while 2/7 first reached full mitigation on the candidate bar. The current implementation retains the gap after full mitigation, so later overlaps can still score. This is an unresolved strategy-definition/implementation semantic and must be reviewed before changing signal logic. The diagnostic convention is not a new entry gate.

No-lookahead tests for confirmed pivots, OB origin/confirmation/invalidation and FVG origin passed; the new regression test confirms the first-touch/full-mitigation trace is diagnostic-only and leaves the existing overlap flag unchanged. Diagnostic columns remain excluded from model features.

### Benchmark remains unchanged and blocked

The latest completed training result is still run #6 (commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, artifact #13036729349): OOS accuracy 41.0602% vs 45.9708% majority baseline, balanced accuracy 38.8382%, macro-F1 38.0253%, 0 closed trades, net $0, PF unavailable; all five walk-forward folds below baseline. Calibration remains absent. No new full training was run. The run #6 model manifest remains bound to that training artifact and is intentionally not rewritten by this diagnostic-only audit.

**Next:** review and preregister the intended FVG refill/mitigation semantics; then proceed to P2 first-hit/triple-barrier net-outcome labels and simple baselines. Do not tune on final OOS, alter frozen v6.2.6.3 weights/lookbacks/thresholds/gates, submit orders, merge, deploy or enable Live Trading.

## Run #6 XGBoost/LSTM imbalance and feature diagnostics — 2026-11-01

The serialized run #6 artifact was inspected without retraining or using final OOS for tuning. Full provenance and results are in `reports/wave3_run6_model_diagnostics_20261101.json` (training workflow #6, commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, artifact #13036729349, archive SHA-256 `bfc4bb6419eb4226ba90bea6ad940b036847d4d6be5522af023629d960003bd4`). The run's final OOS begins 2026-07-01 and contains 7,942 labeled rows; tuning used only pre-OOS data with two inner chronological validation folds and a 12-bar purge.

### Label and prediction distribution

| Class | Train | OOS actual | OOS predicted |
|---|---:|---:|---:|
| Short | 24.93% | 27.68% | 41.37% |
| Hold | 46.62% | 45.97% | 40.81% |
| Long | 28.45% | 26.35% | 17.82% |

The training and OOS label priors are broadly similar. The larger visible issue is prediction skew: Short is over-predicted by 13.69 percentage points and Long is under-predicted by 8.53 points; Long recall is 20.1147%. Final OOS confusion matrix and class precision/recall/F1 are preserved in the diagnostic JSON.

### XGBoost feature-gain diagnostic

The final pre-2026-07-01 serialized XGB model has 89 features. Top gain contributors are `hour_sin` (10.26%), `volume_gate` (6.47%), `hour_cos` (3.94%), `log_volume` (2.31%), `realized_vol_24` (2.25%), `atr_price` (2.17%), `weekday_sin` (2.14%), `bear_ob_within5` (2.12%), `wave3_long_zone` (2.00%) and `spread_price` (1.82%). Grouped gain shares are time features 17.635%, volume/spread 16.889%, and structural/Wave3/SMC/Fib features 22.280%. Gain importance is descriptive only, not causal; confirm with chronological inner-fold permutation/ablation before changing feature design.

### LSTM, calibration and chronological degradation

The active deep model is a two-layer 32-unit PyTorch LSTM over 60 bars, trained for four epochs; training loss decreases from 1.068531 to 0.897545. The artifact does not provide an LSTM validation-loss curve, LSTM feature attribution, Brier score, ECE or reliability curve. Therefore overfitting and probability calibration cannot be established. Raw direction-class probabilities are not trade-win probabilities.

All five expanding walk-forward folds remain below their own majority baselines. Accuracy/baseline gaps are -4.7680 pp (2024-H1), -5.0218 pp (2024-H2), -6.0351 pp (2025-H1), -11.3477 pp (2025-H2), and -9.9424 pp (2026-H1). Final OOS accuracy is 41.0602% versus 45.9708% baseline, balanced accuracy 38.8382%, macro-F1 38.0253%; closed trades 0, net profit $0, PF unavailable.

**Next:** perform class-wise and grouped feature permutation/ablation plus XGB/LSTM calibration only on chronological inner-validation folds. Keep labels, gates and final OOS untouched; proceed to P2 first-hit/triple-barrier labels before any new full training.


## Revalidation and next gates — 2026-11-02

- Repository main was revalidated at `a9bb92c9d2642eff34be2ea68276a33b367ee793`. PR #66 was synced with non-force merge commit `c5f93321a9a2c88310ddd0113c07d6580bb93d89`; it remains Draft/open/unmerged and is 72 commits ahead / 0 behind main at the time of this update.
- Canonical XAUUSDm M15 Git blob independently hashes to `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266` (8,483,411 bytes). Metadata `size_bytes` was corrected to this canonical byte count; the former 8,584,488 value is preserved as historical metadata. Canonical news CSV independently hashes to `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37` (386,146 bytes; 2,166 unique high-impact USD/US events; datetime-only; zero missing, duplicate or out-of-range rows; coverage [2022-07-21, 2026-10-30) UTC).
- This run did not access Exness MT5. Previous 2026-10-30 log/export evidence remains historical only. The raw terminal digest in the prior note is 58 hex characters and is not a valid SHA-256; the raw CSV is not available here to rehash. Do not mark raw-export provenance fully closed until a valid 64-hex digest is recomputed from the original Common\\Files CSV or a fresh Navigator export.
- SMC/Wave3 CI [#106](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41385215194) passed on diagnostic code head `420d12c60f4a7da60e0514899fb9eddd023e7509`; artifact #13114634785 (archive SHA-256 `a5529ce365b4709552c8b21b189d099543c8fdb28937568e2c2f78f12a25083b`). Corrected same-bar trace: 34 candidates; BOS20=21; higher-lows+green=12; OB within $5=1; FVG overlap=7; all-four=0; maximum SMC=75; SMC>=85=0. First full FVG mitigation is on the signal bar for 2/7 FVG-positive candidates; 5/7 were mitigated earlier. Current-bar mitigation touches (including re-touches) are reported separately; no scoring or gate changed.
- Latest benchmark training remains Run #6 on `5fda3b8eb502d5694639a3afef354de0876ff2de`, artifact #13036729349. Versioned manifest copy: `models/wave3_news_calendar_20261030/model_manifest.json`; source artifact manifest SHA-256 `7470adc0f28f298e1e83225aa11707807e27c56ea8de667e29cb038b0fc78550`. Final OOS: accuracy 41.0602% vs 45.9708% baseline, balanced accuracy 38.8382%, macro-F1 38.0253%, 0 closed trades, net $0, PF unavailable; all five walk-forward folds below baseline. Commission is still assumed zero in this artifact because the account schedule is unverified; net expectancy is not fully cost-validated.
- PR #147 remains separate and Draft/open/unmerged. Its challenger-only first-hit label builder, 11 synthetic tests and dedicated CI passed (latest P2 run #6). It fails closed without verified commission provenance, censors incomplete horizons, and has not been run on real Exness data. Keep benchmark and challenger features/labels/manifests separate.

**Do not start another full benchmark training run yet.** First finish raw-export provenance, review the corrected FVG semantics without changing the frozen overlap gate, obtain the actual Exness Demo commission schedule, and complete P2 integration/validation. Keep nested chronological folds, at least 12-bar purge, inner-fold-only tuning/calibration, and untouched final OOS from 2026-07-01. Acceptance remains >=30 closed OOS trades, positive net profit after costs, PF >1.0, accuracy above baseline, robust folds/regimes and every frozen gate.


## Independent review P1 remediation — 2026-11-02

- Training and inner-validation purges now use original source-bar indices and each label's source_index + HORIZON_BARS endpoint. This prevents labels crossing a New Year/weekend/holiday market closure from reading test-period prices merely because the calendar-time gap exceeds three hours.
- High-impact news events with blank/missing timestamps now fail closed before exact-time or full-day blackout masks are built.
- Daily entry-count and realized-loss checks use the executable entry bar's UTC date, not the preceding signal bar's date.
- A BUY stop crossed by a downside opening gap now fills at the worse opening price (less slippage), rather than at the stale stop barrier.
- Regression coverage was added for a market-closure purge, missing high-impact timestamps, UTC-midnight entry limits, and gap-through stop execution.

Current PR #66 code/test head: 5f6cc9075d5ad5dc8420a3ec961db8378f281535. The branch compares 94 ahead / 0 behind current main a9bb92c9d2642eff34be2ea68276a33b367ee793, with merge base equal to main. A follow-up review caught that a downside opening gap on the entry candle can predate the actual BUY fill; the gap adjustment now applies only when j > entry_i, while the entry candle retains stop-first barrier pricing. A regression test covers this pre-entry-open case. The earlier SMC #118 / Windows #211 successes were on prior head f05d0463e907c3a2d7b720fcccf3b8c707e8f0c8 and do not verify this follow-up. No exact-head Actions run is currently visible; this latest correction remains CI-unverified.

Still open: independent review P2 findings for RSI behavior and completed-H1 alignment, plus audit-digest consistency. The review threads remain unresolved. No new full benchmark training may start until P1 semantic review and P2 label methodology are ready. No benchmark gates, weights, thresholds, lookbacks, or risk rules were relaxed.


## Revalidation — 2026-11-03 (supersedes earlier status snapshots)

### Current P1 causal SMC evidence

PR #66 exact code-head SMC/Wave3 CI [run #186](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575866703) passed and uploaded artifact [#13203298320](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575866703/artifacts/13203298320). Archive SHA-256: `dd98ebe354f671c8ce91e6acfbcabab1eb69543702d63c277a4403aa0e6b685e`; trace JSON SHA-256: `8e4a6faadfac80e8ee92e0c8335622c4d9a81b03d0a8ebcd7e57a0e49b8f63fa`. The report is `reports/wave3_smc_candidate_trace_revalidation_20261103.json`.

- 34 candidate rows; BOS20=21, scored three-confirmed-higher-lows + green=12, OB within $5=1, FVG overlap=7.
- Same-bar pairwise intersections: BOS20+rule-CHoCH=9, BOS20+OB=0, BOS20+FVG=3, rule-CHoCH+OB=0, rule-CHoCH+FVG=3, OB+FVG=0. All four on one closed signal bar=0; maximum score=75; score >=85=0.
- Structural BOS up=8 and structural CHoCH up=4 are separate event labels. Structural CHoCH has zero intersection with the scored three-higher-lows+green rule; structural BOS intersects the scored BOS20 rule on 8 rows.
- Eleven candidate rows selected an OB; all 11 were valid on the signal bar, only one was within $5, and none was inside the zone. The trace records origin, confirmation, range, distance, validity and invalidation fields.
- All seven FVG-positive candidates had first overlap before signal; five had already reached full mitigation on an earlier bar and later re-touched; two first reached full mitigation on the signal bar. The current 48-bar overlap behavior remains frozen pending a separately preregistered semantic decision.

### Performance evidence remains run #6 only

The latest completed training artifact is still run #6 on training commit `5fda3b8eb502d5694639a3afef354de0876ff2de`, artifact #13036729349. It is not exact-head training evidence for the current PR #66 code.

| Metric | Run #6 |
|---|---:|
| Final OOS rows | 7,942 |
| Accuracy | 41.0602% |
| Majority baseline | 45.9708% |
| Balanced accuracy | 38.8382% |
| Macro-F1 | 38.0253% |
| Closed trades | 0 / 30 minimum |
| Net profit | $0 |
| Profit Factor | unavailable |
| Walk-forward folds below baseline | 5 / 5 |

XGBoost gain remains led by `hour_sin` (10.26%), `volume_gate` (6.47%) and `hour_cos` (3.94%); this is descriptive gain, not causal attribution. LSTM training loss declines over four epochs, but validation-loss, Brier/ECE and reliability-curve evidence is absent. The run #6 manifest remains bound to that artifact and must not be rewritten without a new training artifact.

### Provenance and next gates

- Dataset SHA-256: `0e95a4fc942d44a8fb1e236a123f709601623de471406b3da0268491a5794266`.
- Canonical historical calendar SHA-256: `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`.
- Raw terminal calendar SHA-256: `6754d46f34e76fc171e64afec51297dbcd3caf4d4dd196bc1a993b526c`; two success markers, 2,166 high-impact USD/US events, 15,853 queried values, zero unknown time modes. This is 2026-10-30 historical terminal evidence, not a fresh 2026-11-03 export.

PR #147 is separate. Its P2 CI [run #34](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41575390274) passed 13 synthetic tests, including the exit-UTC-day loss regression. P2 is not cost-complete: gap-through fills and swap/rollover remain unmodeled, independent Exness Demo commission evidence is missing, no real-data challenger labels/manifest have been accepted, and the 2026-07-01 benchmark holdout is already inspected. A new future holdout must be preregistered.

**Do not start another full benchmark training run yet.** Complete the P1 FVG semantic review and P2 cost/provenance methodology first. Then perform challenger-only P3 baselines/calibration and ablations on inner chronological folds, P4 cost/regime robustness, and only then P5 on a genuinely new untouched future holdout. Keep 12-bar purge, inner-fold-only tuning/calibration, and every frozen v6.2.6.3 entry/risk/news gate unchanged.


## Calendar raw-byte provenance revalidation — 2026-11-07

The original terminal Common Files CSV and date-matched `MQL5/Logs/20261030.log` were re-read from the connected Windows device. The raw 388,313-byte CRLF-only file hashes to `6754d46f34e76fc171e64afec51297dbcd3caf0ac6cf4d4dd196bc1a993b526c`; CRLF-to-LF normalization yields 386,146 bytes and `317c621775db0cf75d7375e9fcb6d4110ea08316e699c239f823d228fd199b37`, matching the canonical Git CSV exactly. This is a revalidation of the historical 2026-10-30 export, not a fresh MT5 export. The raw digest and verification timestamp are recorded in the calendar manifest and `reports/wave3_calendar_raw_digest_revalidation_20261107.json`.

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

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
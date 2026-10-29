# Wave3 model training and validation contract

This change adds a deterministic, rerunnable training pipeline on the feature branch. It does not change main, deploy workers, or submit broker orders.

## Data

The dataset is exported from the connected Exness Demo MT5 account for the terminal-listed symbol XAUUSDm, M15, UTC. See datasets/exness-demo/metadata.json. The exported history contains 101,076 unique closed bars and no account identifier or credentials.

## Model

- XGBoostClassifier multiclass model with class-balanced sample weights.
- A two-hidden-layer sklearn MLP neural network with StandardScaler, also class-balanced.
- Three labels: short / hold / long. Labels use a 12-bar forward return and a threshold at least twice the spread or 0.35 ATR times square root of horizon.
- The final model uses only data before 2026-07-01, with a 12-bar purge at the boundary.
- Model feature columns and training period are saved in the manifest.
- Artifacts are reloaded after serialization and must reproduce the in-memory prediction probabilities on a held-out sample.

## Validation

Chronological expanding-window folds test 2024-H1, 2024-H2, 2025-H1, 2025-H2 and 2026-H1. The final holdout starts 2026-07-01 and ends at the latest labeled row in the dataset. Fold boundaries purge the forward label horizon to avoid labels crossing the test window.

The simulation uses next-bar entries, per-bar spread, fixed price slippage, fixed risk fraction, ATR stops, 2R targets, a 12-bar maximum hold, and stop-first handling when both stop and target occur within an OHLC candle. The model threshold is fixed before testing the final OOS window. The report must show a trade count of zero if the pattern filter produces no valid entries rather than inventing signals.

## Limitations that remain

Historical tick-level fills, variable latency, account-specific commission schedule, and live market conditions are not proven by an OHLC simulation. Maximum drawdown is computed from closed-trade equity. This is research evidence only; deployment or live trading activation requires separate review and remains disabled.


## Actual run result on the checked-in dataset

The models trained and the serialized artifacts reloaded with matching probabilities on 256 held-out rows. Five expanding walk-forward periods completed. On the separate final OOS window (2026-07-01 through 2026-10-29 13:45 UTC), the ensemble had 7,942 labeled rows, 40.7832% accuracy, 38.6227% balanced accuracy, and 36.2830% macro-F1. The majority-class accuracy baseline was 45.9708%, so the model did not beat the simple baseline.

The final OOS set had 53 long and 63 short Wave3 breakout features; after SMC confluence there were 41 long and 46 short candidates. None passed the frozen model-probability threshold/margin, so there were zero closed OOS trades. Win rate and profit factor are therefore unavailable, not zero. The explicit performance gate is blocked. This means the training/integration work is complete, but the strategy has not demonstrated an out-of-sample trading edge and must not be activated or deployed for trading.

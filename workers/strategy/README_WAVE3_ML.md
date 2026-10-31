# VOOM v6.2.6.3 Wave3 + SMC XGBoost / 60-bar LSTM research pipeline

This implementation belongs to the VOOM_SYSTEM-NOVA-AI feature branch. It is a read-only research pipeline and contains no order-execution path.

## Train and reproduce

From the repository root, using Python 3.11:

    python -m pip install -r requirements-wave3.txt
    python tools/train_wave3_models.py --news-calendar datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv

Omit `--news-calendar` only for a fail-closed diagnostic run; without the historical calendar no trades are permitted in the simulation.

Input data is the exported Exness MT5 Demo XAUUSDm, M15 bar series in UTC. Labels use a 12-bar forward horizon, with a movement threshold at least twice the recorded spread or 0.35 ATR times the square root of the horizon. Features are generated causally; each pivot is available only after its right-side confirmation bars have closed. The trainer purges 12 bars before each walk-forward boundary.

The training script creates:
- reports/wave3_auto_tuning_history.json
- models/wave3_xgb_deep/xgb_model.json
- models/wave3_xgb_deep/deep_lstm.pt
- models/wave3_xgb_deep/model_manifest.json
- reports/wave3_exness_xauusdm_m15_report.json
- reports/wave3_final_oos_trades.csv

The automatic tuner runs inside each outer training window: four deterministic XGBoost candidates are scored on two expanding chronological inner validation windows, with a 12-bar purge at each boundary. The selected XGB parameters are refit with the fixed 60-bar LSTM, then evaluated on the untouched outer window. The Final OOS from 2026-07-01 is never used for tuning. The BUY gate follows v6.2.6.3: XGB >=75%, LSTM over the previous 60 M15 bars >=80%, both choose BUY, and their 60/40 ensemble must be >=85%. No lower threshold grid is used to force trades. The tuner does not change SMC/Fibonacci/RSI/volume/spread/news rules, XGB/LSTM confidence minima, ensemble weights, or risk controls; only XGB model hyperparameters are selected.

## Backtest assumptions / limitations

- Strict BUY-only gates also require Wave3 Fib 45-85%, Fib score >=80, SMC score >=85, RSI 50-70, positive 5-bar momentum, volume >80% of EMA20, Fib 61.8% +/-5 percentage points (assumption), discount zone in the rolling 100-bar range, M15 close > EMA21 > EMA50, H1 uptrend, $5 stop within 1.5 ATR and XAU spread <=$0.35.
- Simulated lot is fixed at 0.01, SL is Entry - $5, TP is Entry + $11 (2.2R), max one open position, five entries per UTC day and a $500 daily loss stop. The fixed lot lock conflicts with the 1% risk-sizing example; the simulation uses fixed 0.01 as the conservative explicit final instruction.
- The SL formula `Wave2 Low - $5` conflicts with the example's locked $5 from Entry; this implementation follows the locked $5 / $11 example. Only BUY rules were supplied; SELL is disabled.
- If SL and TP are touched within the same OHLC candle, SL is assumed first.
- Historical high-impact news events must be supplied as CSV columns `timestamp` (UTC) and `impact`; entries within +/-30 minutes are blocked. If omitted, the simulation fails closed and reports zero trades.
- XGB/LSTM outputs are raw direction-class probabilities, not calibrated trade-win probabilities. The current model labels a 12-bar forward move rather than the first-hit result of the strategy's fixed SL/TP, so thresholds are signal gates rather than demonstrated win probabilities.
- The sample of historical deals is too small to establish the broker's commission schedule. Commission is set to zero as an explicitly reported assumption; update it before considering any production use.
- Swap is omitted because the position hold cap is 12 M15 bars.
- Maximum drawdown uses closed-trade equity, not tick-level intratrade equity.

Metrics are historical estimates and are not evidence of future returns. Unit tests validate software mechanics and never substitute for market-data backtesting. No orders are submitted and Live Trading remains off.

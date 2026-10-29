# Wave3 + SMC XGBoost / MLP research pipeline

This implementation belongs to the VOOM_SYSTEM-NOVA-AI feature branch. It is a read-only research pipeline and contains no order-execution path.

## Train and reproduce

From the repository root, using Python 3.11:

    python -m pip install -r requirements-wave3.txt
    python tools/train_wave3_models.py

Input data is the exported Exness MT5 Demo XAUUSDm, M15 bar series in UTC. Labels use a 12-bar forward horizon, with a movement threshold at least twice the recorded spread or 0.35 ATR times the square root of the horizon. Features are generated causally; each pivot is available only after its right-side confirmation bars have closed. The trainer purges 12 bars before each walk-forward boundary.

The training script creates:
- models/wave3_xgb_deep/xgb_model.json
- models/wave3_xgb_deep/deep_mlp.joblib
- models/wave3_xgb_deep/model_manifest.json
- reports/wave3_exness_xauusdm_m15_report.json
- reports/wave3_final_oos_trades.csv

The fixed walk-forward test periods are 2024-H1, 2024-H2, 2025-H1, 2025-H2 and 2026-H1, with an untouched final holdout from 2026-07-01 to the latest labeled bar. Thresholds are not tuned against that final holdout. XGBoost and a two-hidden-layer sklearn MLP are combined by averaging class probabilities.

## Backtest assumptions / limitations

- Starting simulated equity $10,000; risk budget 0.25% per trade; stop 1.5 ATR; target 2R; maximum holding 12 M15 bars.
- Entry occurs at the next candle open. Recorded per-bar spread is applied to the ask side; $0.02 price slippage is charged against each fill.
- If SL and TP are touched within the same OHLC candle, SL is assumed first.
- The available terminal reported a $100 contract size, 0.01 minimum volume, and 0.01 volume step for XAUUSDm.
- The sample of historical deals is too small to establish the broker's commission schedule. Commission is set to zero as an explicitly reported assumption; update it before considering any production use.
- Swap is omitted because the position hold cap is 12 M15 bars.
- Maximum drawdown uses closed-trade equity, not tick-level intratrade equity.

Metrics are historical estimates and are not evidence of future returns. Unit tests validate software mechanics and never substitute for market-data backtesting. No orders are submitted and Live Trading remains off.

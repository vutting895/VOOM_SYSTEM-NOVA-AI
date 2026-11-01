# Backtest Worker

Deterministic simple moving-average (SMA) crossover simulator driven by chronological OHLCV candles. Applies fee and slippage assumptions; rejects malformed or non-chronological data. It does not fabricate market data or submit orders.

Metrics are historical simulation results, not forecasts. Confirm candle source, timezone, gaps, exchange-specific fees, funding, spread, and intrabar stop/target assumptions before using results in decisions. The current engine is intentionally simple and is not a tick-accurate MT5 simulator. It is a research prototype, not the Wave3/SMC/XGBoost/LSTM Strategy Lab engine.

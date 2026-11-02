# Backtest Worker

Deterministic simple moving-average (SMA) crossover simulator driven by chronological OHLCV candles. Applies fee and slippage assumptions; rejects malformed or non-chronological data. It does not fabricate market data or submit orders.

Metrics are historical simulation results, not forecasts. Confirm candle source, timezone, gaps, exchange-specific fees, funding, spread, and intrabar stop/target assumptions before using results in decisions. The current engine is intentionally simple and is not a tick-accurate MT5 simulator. It is a research prototype, not the Wave3/SMC/XGBoost/LSTM Strategy Lab engine.


## Strategy engine and live-data handoff

- `strategy_engine.py`: canonical long-only event-driven signal simulator. Signals are known at candle close and fill at the next candle open.
- `market_data.py`: validates and normalizes authenticated NOVA System Hub Exness MT5 Demo quote payloads. The active/latest MT5 bar is excluded by default.
- `StrategyBacktestEngine.run_market_data()`: feeds only normalized, closed candles into the canonical simulator.
- `vectorbt_adapter.py`: optional VectorBT signal-screening benchmark for fast research. It is not the canonical accounting engine and its terminal position is marked to market.

The frontend obtains market data through `/api/market-data`, which validates the Supabase session and calls the existing tenant-scoped NOVA System Hub. It does not call the MT5 terminal directly and does not accept browser-supplied tenant IDs, connection IDs, upstream URLs or bridge tokens.

The frontend's five-second refresh is near-real-time polling, not a WebSocket stream. Live data populates the current OHLC baseline input; the Wave3/SMC/XGBoost/LSTM Strategy Simulation API is not yet deployed. The Python strategy engine remains research-only until a reviewed hosted runtime and authenticated job/result persistence are added.

No broker write methods exist. Keep `ordersEnabled=false`, `executionEnabled=false` and `liveTradingEnabled=false`.

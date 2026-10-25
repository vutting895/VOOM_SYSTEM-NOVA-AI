# VOOM_SYSTEM canonical MCP server

## Single entry point
- Runtime entry point: `mcp-server/app.py`
- Protocol: MCP over stdio
- Docker entry point: `python app.py` from `/workspace/mcp-server`
- Live trading and order placement are disabled.

## Exposed tools
1. `system_status`
2. `list_workers`
3. `read_market_candles` — public Binance OHLCV only
4. `get_market_features` — deterministic EMA12/EMA26, simple RSI14 and simple ATR14 from fetched public candles
5. `run_ema_backtest` — deterministic EMA crossover on fetched historical candles with explicit fee/slippage inputs
6. `validate_paper_risk`
7. `validate_portfolio_allocation`
8. `smc_wave_component_status`
9. `validate_smc_wave_ohlcv`
10. `analyze_smc_wave_candidates`
11. `mcp_capability_audit`

## Important provenance and limitations
- Market candles come from the public Binance API; the tool does not require exchange credentials.
- Backtest results depend on the fetched sample, timeframe, fee, slippage and strategy implementation. They do not prove future profitability.
- SMC/Wave outputs are research candidates only, not validated trading signals.
- The previous FastAPI `server.py` contained randomized mock backtest/tuning values. It has been preserved as `server_legacy_mock.py` for audit and is not the canonical MCP runtime.
- Random/mock strategy generation and randomized tuning are intentionally not exposed as working production tools.
- No real buy/sell orders are sent.

[executed on device: 10_3_6_9 (85294689-03d5-431e-abd5-9e27d4c94814)]
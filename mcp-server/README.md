# VOOM_SYSTEM NOVA — Local MCP

## Runtime contract

- Single entry point: `mcp-server/app.py`
- Transport: MCP over stdio (no network port is published)
- Container: built from the repository root using `mcp-server/Dockerfile`
- The local MCP process is for research and deterministic validation only.
- It does not expose broker credentials, broker write methods, order submission, or Live Trading.

## Allow-listed tools

1. `system_status` — repository modules and fail-closed runtime posture.
2. `list_workers` — local Python worker inventory with prototype labels.
3. `read_market_candles` — public Binance OHLCV only; no API credentials.
4. `get_market_features` — deterministic EMA12/EMA26, simple RSI14 and simple ATR14.
5. `run_ema_backtest` — historical EMA crossover research with explicit fee/slippage.
6. `validate_paper_risk` — invokes the existing fail-closed paper-risk validator.
7. `validate_portfolio_allocation` — local allocation-limit validation; no write.
8. `smc_engine_status` — identifies the canonical existing SMC research engine.
9. `analyze_smc_market_structure` — calls `workers/feature/smc_wave/smc_strategy.py`.
10. `run_smc_research_backtest` — calls the existing SMC structure-break baseline.
11. `mcp_capability_audit` — inventories exposed and deliberately excluded capabilities.

## Source and safety boundaries

- The existing `workers/data-ingestion`, `workers/backtest`, `workers/risk`, `workers/portfolio` and `workers/feature/smc_wave/smc_strategy.py` implementations remain canonical. This MCP layer imports them; it does not copy or replace them.
- The retained `integrations/nova-ai-mcp-full-clean/mcp-server/server.py` is a legacy FastAPI prototype that fabricates random backtest and tuning metrics. It is not built or launched here.
- No duplicate SMC adapter or alternate SMC implementation is introduced.
- Public market data is not personalized customer data. The market-data tool makes outbound requests to the public Binance API.
- EMA/RSI/ATR features and backtest outputs are research artifacts, not validated profitability claims or investment advice.
- The Docker build context is allow-listed to `mcp-server/` and `workers/`; environment files and frontend code are excluded.
- Never add broker tokens, exchange credentials, arbitrary shell, filesystem access, generic proxying or order methods to this server.

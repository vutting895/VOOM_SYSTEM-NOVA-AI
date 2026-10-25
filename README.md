# VOOM_SYSTEM — NOVA

## Purpose
Modular research platform for market-data ingestion, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation and broker integration. Project root: `C:\\Program Files\\voom_system`.

## Current safety state
- Live trading is disabled by default. The execution worker deliberately raises an exception and never submits an order.
- Public market data is read-only. Do not place exchange API secrets in source code or commit `.env`.
- Gen AI requires a separately installed local Ollama runtime/model. It is an inference adapter, not a model trained from scratch.
- Backtest is a simple deterministic EMA crossover simulation using provided historical OHLCV; it is not tick-accurate and does not predict future performance.
- ML prototypes under `workers/feature` are imported research examples, not wired into a production pipeline.

## Local setup (Windows PowerShell)
1. Install Python 3.11+ and Node.js 22+.
2. `cd C:\\Program Files\\voom_system\\frontend; npm install; npm run build; npm run start`
3. Create a Python venv in project root and install MCP dependencies: `python -m venv .venv; .\\.venv\\Scripts\\python -m pip install -r mcp-server\\requirements.txt`
4. Run MCP server with ` .\\.venv\\Scripts\\python mcp-server\\app.py` (stdio; do not publish it as a public HTTP server).
5. Public candle ingestion needs internet access. `python workers\\data-ingestion\\main_prototype.py` prints a bounded sample.

## Environment
Copy `.env.example` to `.env` only if needed. Use read-only exchange credentials; never enable withdrawals. MT5 bridge settings are placeholders until the bridge is independently secured and tested.

## Modules
- `mcp-server/`: allow-listed MCP tools (status, public candles, EMA backtest, paper risk validation).
- `workers/data-ingestion/`: public Binance OHLCV adapter.
- `workers/feature/`: imported ML research prototypes; dependencies and data-leakage checks required.
- `workers/gen-ai/`: local Ollama strategy-draft adapter.
- `workers/backtest/`: deterministic OHLCV EMA crossover simulation.
- `workers/tuning/`: bounded parameter grid backed by a real backtest callback.
- `workers/risk/`: fail-closed paper risk policy.
- `workers/portfolio/`: allocation validator.
- `workers/execution/`: intentionally disabled.
- `frontend/`: Next.js UI.
- `infra/`: local Docker Compose and deployment documentation.
- `shared/`: JSON schemas and feature-store contract.

## Not production-ready yet
Authentication/session management, durable database, full audit trail, monitoring/alerting, robust test coverage, MT5 demo end-to-end tests, exact fee/funding/spread modelling, and a proper holdout-based evaluation remain necessary before any live trading.
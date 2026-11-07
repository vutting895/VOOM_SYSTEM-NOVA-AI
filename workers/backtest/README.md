# Backtest Worker

Deterministic EMA crossover simulator driven by chronological OHLCV candles. Applies fee and slippage assumptions; rejects malformed or non-chronological data. It does not fabricate market data or submit orders.

Metrics are historical simulation results, not forecasts. Confirm candle source, timezone, gaps, exchange-specific fees, funding, spread, and intrabar stop/target assumptions before using results in decisions. The current engine is intentionally simple and is not yet a tick-accurate MT5 simulator.

## SMC historical backtest API

The isolated research runtime exposes:
- `GET /health`
- `POST /v1/smc/analyze`
- `POST /v1/smc/backtest`

Submit chronological, completed OHLC candles as JSON. Backtest settings include `reward_risk`, `fee_rate`, `slippage_rate`, and `initial_equity`. The engine assumes next-bar-open entry and conservatively assumes stop loss first when stop and target are touched in the same candle. Results are per-unit research estimates, not portfolio-sized returns.

## Telegram operational alerts

Set `NOVA_TELEGRAM_BOT_TOKEN` and `NOVA_TELEGRAM_CHAT_ID` in the deployment environment. Use `workers.alerts.telegram.notify_broker_disconnected`, `notify_high_slippage`, or `notify_circuit_breaker` from the corresponding broker/risk event boundary. Telegram delivery is best-effort: missing configuration or network failure returns `False` and must never bypass a fail-closed risk decision. Never log bot tokens.

## Local container startup

From the repository root:
1. Copy `.env.example` to `.env` and set a unique `POSTGRES_PASSWORD`.
2. Run `docker compose -f infra/docker-compose.yml up --build -d`.
3. Check `docker compose -f infra/docker-compose.yml ps` and `curl http://localhost:8000/health` is intentionally not published; use `docker compose -f infra/docker-compose.yml exec research-worker python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"`.

The frontend is published on port 3000. The research worker is internal to the Compose network. MCP stdio is not published as an HTTP service. PostgreSQL and Redis use persistent named volumes. For production, replace local defaults, configure secret storage, TLS/reverse proxy, backups, and network policies before public exposure.

## Test

Install `workers/requirements.txt`, then run `python -m pytest tests -q` and `python -m unittest discover -s tests -v`. CI runs the focused SMC pytest suite and the existing SMC unittest regression tests.

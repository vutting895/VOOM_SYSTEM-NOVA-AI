# VOOM_SYSTEM Remote MCP Worker

Cloudflare Worker: `voom-system-mcp`  
Endpoint: `https://voom-system-mcp.suwapat787.workers.dev/mcp`  
Health: `https://voom-system-mcp.suwapat787.workers.dev/health`

## Authentication and safety
- MCP POST requests require a valid Supabase access token in `Authorization: Bearer <access-token>`.
- CORS allows the NOVA UI origin and existing Base44 origins.
- The worker is research/read-only. It never submits broker or exchange orders.
- Paper-risk checks are conservative guardrails, not financial advice or a live-trading authorization.
- Never commit credentials. Cloudflare variables contain only the Supabase URL and publishable key; no service-role key or Alpaca secret is used by this worker.

## MCP tools
- `system_status` — authenticated status, execution disabled.
- `list_workers` — module inventory, explicitly labeling Python prototypes.
- `list_strategy_registry` — reads visible strategy rows under Supabase RLS.
- `read_market_candles` — bounded public Binance OHLCV candles.
- `run_ema_backtest` — simplified long-only EMA crossover research calculation; omits fees, spread, slippage and funding.
- `validate_paper_risk` — fail-closed paper guardrails; never enables live execution.

## JSON-RPC smoke test
Initialize and list tools using a valid signed-in user's Supabase access token:

```http
POST /mcp
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"voom-smoke-test","version":"1.0"}}}
```

Then send `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`.

## Deployment note
The Worker deployment is managed independently from the local stdio MCP server in `mcp-server/app.py`. The other Python worker folders are not individually deployed as Cloudflare Workers.

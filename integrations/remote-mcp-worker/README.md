# VOOM_SYSTEM Remote MCP Worker

Cloudflare Worker: `voom-system-mcp`  
Endpoint: `https://voom-system-mcp.suwapat787.workers.dev/mcp`  
Health: `https://voom-system-mcp.suwapat787.workers.dev/health`

## Transport and Origin policy

- `POST /mcp` is the stateless, tool-call-focused Streamable HTTP endpoint; tool replies are JSON.
- Current implementation negotiates protocol versions `2025-03-26` and `2024-11-05`. Do not treat this endpoint as fully compatible with `2026-07-28` yet: that revision requires per-request metadata headers and body/header validation in addition to protocol-version support.
- A supplied `Origin` must match the configured NOVA UI or approved Base44 origins. An unapproved Origin is rejected with HTTP 403 before authentication or tool dispatch.
- Requests without an Origin are permitted for server-to-server MCP clients, but protected MCP calls still require a valid Supabase bearer token.
- This Worker does not maintain a protocol session or provide a GET event stream. Current support is the existing stateless JSON tool-call subset; protocol `2026-07-28` compatibility and request-scoped SSE/streaming features remain separate follow-up work.

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
- `analyze_smc_strategy` / `run_smc_backtest` — heuristic SMC research using public Binance candles; no orders.
- `validate_paper_risk` — fail-closed paper guardrails; never enables live execution.
- `request_mt5_demo_connection` — creates a pending Exness MT5 Demo request for the authenticated user; it does not provision a Bridge or place trades.
- `mt5_connection_status` — verifies the user's own connection and the health of its dedicated Bridge.
- `mt5_account_summary`, `mt5_symbols`, `mt5_quotes` — read account and market data from that user's connected Exness MT5 Demo terminal through the tenant-isolated proxy.

MT5 tools require an authenticated Supabase session and an existing user-owned `broker_connections` row. Reading account data remains unavailable until a trusted administrator provisions the separate Bridge route and the Cloudflare secret `MT5_TENANT_ROUTES`. All MT5 tools are GET/read-only except creating the pending database request; no tool submits, modifies, or closes orders.

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

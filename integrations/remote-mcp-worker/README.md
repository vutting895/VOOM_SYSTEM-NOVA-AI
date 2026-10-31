# VOOM_SYSTEM Remote MCP Worker

Cloudflare Worker: `voom-system-mcp`  
Endpoint: `https://voom-system-mcp.suwapat787.workers.dev/mcp`  
Health: `https://voom-system-mcp.suwapat787.workers.dev/health`

## Transport and Origin policy

- `POST /mcp` is a stateless, tools-only Streamable HTTP endpoint. It supports the tested legacy `2025-03-26` initialize flow and the per-request `2026-07-28` metadata path. It does not claim support for `2024-11-05` HTTP+SSE endpoints.
- The allowed browser origins include the primary Netlify frontend (`https://voomsystem.netlify.app`) and the Cloudflare UI fallback (`https://voom-system-nova-ui.suwapat787.workers.dev`), plus the documented Base44 origins.
- An unapproved supplied `Origin` is rejected with HTTP 403 before authentication or tool dispatch. Requests without an Origin are allowed for server-to-server clients, but protected MCP calls still require a valid Supabase bearer token.
- This Worker is stateless and tools-only. It does not implement resources/prompts, persistent sessions, or server-sent event streams, so it does not claim complete MCP feature coverage.

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


## Protocol compatibility

- Legacy stateless JSON-RPC requests use the supported 2025-03-26 initialize flow; 2024-11-05 HTTP+SSE endpoints are not implemented.
- The 2026-07-28 path is per-request (no initialize handshake/session). Each POST must include MCP-Protocol-Version: 2026-07-28 and a matching params._meta["io.modelcontextprotocol/protocolVersion"]; Mcp-Method must equal the JSON-RPC method, and tools/call must include Mcp-Name matching params.name.
- Modern requests require per-request clientCapabilities metadata; clientInfo is optional and validated when supplied. Header/body mismatch returns HTTP 400 with JSON-RPC error code -32020; unsupported versions return HTTP 400 with -32022. Modern method-not-found returns HTTP 404 with -32601.
- server/discover is implemented for modern clients. Modern result objects use resultType: "complete"; discovery and tools/list include ttlMs and cacheScope. Cache scope is private.
- Origin checks remain independent from protocol checks. A supplied untrusted Origin is rejected with HTTP 403 before authentication or tool dispatch. Requests without Origin remain allowed for non-browser clients, but protected MCP calls still require a valid Supabase bearer token.
- This is a read-only tools subset. No order placement, close/modify, transfer, withdrawal, or broker mutation method is available. Do not describe this Worker as supporting the entire MCP specification beyond its implemented tools-only scope.

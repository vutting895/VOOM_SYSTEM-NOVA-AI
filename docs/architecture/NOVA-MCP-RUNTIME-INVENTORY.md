# NOVA MCP Runtime Inventory — main snapshot

**Snapshot ref:** `main` at `0cceaf5d1d32b4323bcf72f9f26877c6d75886ff`  
**Inspection date:** 2026-11-24  
**Scope:** Source-level inventory only. This is not proof of deployed runtime state.

## Executive finding

The repository already contains a client-facing Cloudflare Remote MCP Worker at `integrations/remote-mcp-worker/`. Its `POST /mcp` handler authenticates Supabase bearer sessions and exposes 15 tools. This is the best existing candidate for the NOVA Remote MCP single gateway.

The source also contains a legacy Python FastAPI prototype in `integrations/nova-ai-mcp-full-clean/mcp-server/server.py`. It generates randomized mock backtest/tuning metrics, keeps strategies in process memory, and includes an `/allocate` route. The archive README explicitly says it is not production-ready. It must not be treated as a live Knowledge, Trading or Learning service.

The root `server.ts` `GET /api/mcp/streamable` route returns static metadata describing a few capabilities. It is not a second MCP JSON-RPC transport: it does not implement MCP initialize/tools/list/tools/call on that route. Do not count it as a second MCP server.

## Runtime/source inventory

| Component | Observed source behavior | Architecture disposition |
|---|---|---|
| `integrations/remote-mcp-worker/src/index.js` | Cloudflare Worker with `POST /mcp`, Supabase bearer authentication, JSON-RPC tools/list and tools/call, health route; 15 registered tools | Keep as the single client-facing NOVA Remote MCP Gateway candidate |
| `integrations/remote-mcp-worker/README.md` | Documents deployed Worker name `voom-system-mcp`, endpoint and protocol limits | Keep as gateway operational documentation; verify deployment separately |
| `server.ts` `GET /api/mcp/streamable` | Static JSON metadata only; not a protocol server | Treat as legacy/status metadata; do not route MCP clients here |
| `integrations/nova-ai-mcp-full-clean/mcp-server/server.py` | FastAPI prototype; random mock metrics, in-memory state, generate/strategies/allocate routes | Archive only; never deploy as a second MCP server or use its metrics |
| `infra/docker-compose.yml` `mcp-server` service | Builds the archived Python prototype and starts it by default; stdio is not host-published | Disable in default Compose startup; retain only behind explicit legacy archive profile |
| `workers/` and imported worker archive | Python modules/prototypes; README and artifact notes say not individually deployed/validated | Domain logic candidates only after audit; not independent MCP servers |

## Existing gateway tool inventory

The current Remote MCP Worker registers these 15 tools:

- Platform: `system_status`, `list_workers`
- Skill catalog: `list_nova_skills`, `get_nova_skill`
- Strategy registry: `list_strategy_registry`
- Trading research: `read_market_candles`, `analyze_smc_strategy`, `run_smc_backtest`, `run_ema_backtest`, `validate_paper_risk`
- MT5 read-only: `mt5_connection_status`, `request_mt5_demo_connection`, `mt5_account_summary`, `mt5_symbols`, `mt5_quotes`

No dedicated Knowledge retrieval/indexing tool or Learning Dataset Registry, Model Registry, training-job, evaluation or artifact-lineage tool was found in this registered tool list. Do not report those services as connected yet.

## Cloudflare control-plane verification

Read-only Cloudflare API inspection on 2026-11-24 confirmed:
- Worker script `voom-system-mcp` exists in the connected account.
- Latest listed deployment: `2026-11-01T13:53:34Z`, deployment ID `3f93c779-6fd7-4061-8e92-cac55f6cdd0b`.
- That deployment assigns 100% traffic to version `2f493012-4a6c-435c-95f0-c1d24b8d285f`.
- Worker subdomain is enabled.
- Cloudflare script settings expose the expected `SUPABASE_URL` and publishable-key bindings; no secret values are reproduced here.
- The script settings report compatibility date `2026-10-28`.

This confirms a Worker deployment exists and is assigned 100% traffic. It does **not** confirm that the public `/health` or authenticated `/mcp` endpoint responds successfully, that the deployed code matches the current repository source, or that the configured Supabase project is the intended production project. Runtime HTTP and authenticated MCP smoke tests remain required.

## Important safety findings

1. MT5 tools in the Remote MCP source are documented as read-only and set execution/order flags false. The pending connection-request tool writes a connection-request row to Supabase; it does not write to the broker. Keep this distinction explicit.
2. The archived Python prototype contains randomized mock backtest/tuning and a portfolio allocation route. It must remain disabled and disconnected from the active gateway.
3. The Cloudflare Worker README says it has limited tools-only protocol coverage; do not claim full MCP specification coverage.
4. Source inspection does not prove current Cloudflare deployment, secret configuration, Supabase RLS behavior, tenant isolation or production health. Those require separate runtime tests.

## Phase 2 actions

- [x] Identify the existing Remote MCP gateway candidate and its source path.
- [x] Enumerate currently registered tools.
- [x] Identify the archived mock Python MCP prototype.
- [x] Identify the static `server.ts` metadata endpoint and distinguish it from MCP transport.
- [x] Disable the archived MCP prototype from default Docker Compose startup.
- [x] Confirm Cloudflare control-plane deployment exists and identify latest deployment/version metadata.
- [ ] Confirm public `/health` and authenticated `/mcp` HTTP responses and compare deployed code/config with repository main.
- [ ] Map each current tool to one domain owner and introduce stable namespaced aliases without breaking existing clients.
- [ ] Implement Knowledge and Learning service adapters only after locating/reusing existing service code and registries.
- [ ] Add contract, duplicate-tool, MT5 write-denial and tenant-isolation tests.
- [ ] Migrate callers and remove legacy aliases only after usage telemetry and compatibility checks.

## Acceptance rule

There must be exactly one client-facing MCP endpoint. Domain services may be separate HTTP/queue modules internally, but they must not expose independent MCP listeners. No legacy service is deleted solely because its source looks duplicated; first verify references, deployment configuration, callers and rollback.

# NOVA API Contract

> Source of truth: repository code on `main` at baseline `977bf4e7c74c28ca4971797986c7992e5b32c019`, plus the changes in this branch. This document describes declared routes and their observed behavior; it does not assert that external services are deployed or connected.

## Runtime boundaries

| Runtime | Base URL | Notes |
|---|---|---|
| Root Express | Same origin as the web app; local default port `3000` | Production URL: [ต้องยืนยัน] |
| Python Research Worker | [ต้องยืนยัน] | FastAPI; separate process |
| MT5 Read-only Bridge / Proxy / Relay | [ต้องยืนยัน] | Separate services; GET-only market/account reads |
| System Hub | [ต้องยืนยัน] | Cloudflare Worker |
| NOVA AI Worker | [ต้องยืนยัน] | Cloudflare Worker |
| Remote MCP Worker | [ต้องยืนยัน] | Cloudflare Worker |
| Legacy MCP Worker | [ต้องยืนยัน] | Legacy integration; do not assume active |

Root frontend clients use same-origin relative paths. No global Root Express authentication middleware was identified in the inspected source. Do not treat an endpoint as tenant-authenticated unless its handler explicitly verifies that boundary.

## Root Express API

All paths below are mounted by `server.ts`.

| Method | Path | Observed behavior |
|---|---|---|
| GET | `/api/auto-train/status` | HTTP 503; `TRAINING_RUNTIME_NOT_CONFIGURED`; no training metrics are claimed |
| POST | `/api/auto-train/trigger` | HTTP 503; training unavailable; does not start training |
| GET | `/api/mt5-bridge/status` | Returns disabled status |
| POST | `/api/mt5-bridge/toggle` | Blocked by global fail-closed middleware; HTTP 403 |
| GET | `/api/live-trading/status` | Returns read-only; all execution flags false |
| POST | `/api/live-trading/toggle` | Blocked by global fail-closed middleware; HTTP 403 |
| POST | `/api/orders/execute` | Blocked by global fail-closed middleware; HTTP 403; no broker order is sent |
| GET | `/api/broker/status` | Intercepted; HTTP 503 `broker_identity_unverified` |
| POST | `/api/broker/status` | Blocked by global fail-closed middleware; HTTP 403 |
| GET | `/api/broker/instruments` | Static sample catalogue; not proof of a broker connection or live quotes |
| POST | `/api/quantum/simulate` | Research/simulation handler; request fields: [ต้องยืนยัน] |
| GET | `/api/quantum/source` | Returns source metadata; response schema: [ต้องยืนยัน] |
| GET | `/api/market/overview` | Static/demo market overview; not a verified live feed |
| GET | `/api/market/candlesticks` | Synthetic/demo candle generator; query fields include symbol, timeframe, limit |
| GET | `/api/intelligence/models` | Model metadata response; full schema: [ต้องยืนยัน] |
| POST | `/api/backtest/run` | Simulated backtest handler; not historical/OOS evidence; request schema: [ต้องยืนยัน] |
| GET | `/api/infrastructure/health` | Infrastructure health response; full schema: [ต้องยืนยัน] |
| GET | `/api/learning/universe` | Learning-universe metadata; full schema: [ต้องยืนยัน] |
| POST | `/api/chat` | Chat handler; body fields observed in frontend: `message`, optional `symbol`, optional `messages` |
| POST | `/api/agent/approvals/decision` | Blocked by global fail-closed middleware; HTTP 403 |
| POST | `/api/gen-ai/generate` | Declared handler; request/response schema: [ต้องยืนยัน] |
| GET | `/api/intent/thread/:threadId` | Intent thread lookup; response schema: [ต้องยืนยัน] |
| POST | `/api/intent/dispatch` | Intent dispatch; request/response schema: [ต้องยืนยัน] |
| POST | `/api/intent/interrupt/resolve` | Blocked by global fail-closed middleware; HTTP 403 |
| GET | `/api/mcp/streamable` | MCP streamable endpoint; protocol details: [ต้องยืนยัน] |

### Kaggle routes added by this branch

These routes are intentionally fail-closed. They do not proxy to Kaggle and do not start compute.

#### GET `/api/mcp/kaggle/status`

HTTP 200:
```json
{
  "ok": true,
  "provider": "kaggle",
  "serverUrl": "https://www.kaggle.com/mcp",
  "transport": "streamable-http",
  "configured": false,
  "available": false,
  "status": "not_configured",
  "auth": { "configured": false },
  "compute": { "enabled": false, "costIncurringActionsAllowed": false },
  "toolsCount": 0,
  "tools": [],
  "message": "Kaggle credentials and a verified runtime are not configured."
}
```

#### POST `/api/mcp/kaggle/search`

Request:
```json
{ "query": "Forex SMC" }
```

- `query` must be a non-empty string, maximum 200 characters.
- Invalid input: HTTP 400, `INVALID_KAGGLE_SEARCH_QUERY`.
- Valid input while provider is not configured: HTTP 503, `KAGGLE_RUNTIME_NOT_CONFIGURED`, with `notebooks: []`.
- No search is performed.

#### POST `/api/mcp/kaggle/session/trigger`

Frontend request shape:
```json
{ "slug": "owner/notebook-slug", "machine_shape": "NVIDIA T4 x2 Dual GPU" }
```

Always returns HTTP 403, `KAGGLE_SESSION_EXECUTION_DISABLED`, with `executionEnabled: false` and `costIncurringActionAllowed: false`. No session is started and no compute quota is consumed.

## Request and response conventions

- Root Express uses JSON request bodies after `express.json()`.
- Response formats are not globally normalized across Express, FastAPI, and Cloudflare Workers.
- Error envelopes vary by route. Consumers must check HTTP status and the route-specific `error` field.
- Root production base URL: [ต้องยืนยัน].
- Root API authentication and tenant boundary: [ต้องยืนยัน]; do not pass broker secrets through the browser.
- CORS policy: [ต้องยืนยัน].

## Other runtime route inventory

These are separate service routes, not aliases of Root Express routes.

| Service | Methods and paths |
|---|---|
| Python Research Worker | GET `/health`; POST `/v1/smc/analyze`, `/v1/smc/backtest`, `/v1/elliott-wave/analyze`, `/v1/research/pipeline`, `/v1/backtest/walk-forward`, `/v1/risk/approval` |
| MT5 Read-only Bridge | GET `/health`, `/api/account`, `/api/symbols`, `/api/quotes` |
| MT5 Read-only Proxy | GET `/health`, `/api/account`, `/api/symbols`, `/api/quotes` |
| MT5 Bridge Relay | GET `/health`, `/api/account`, `/api/symbols`, `/api/quotes`; WebSocket `/connect` |
| System Hub | GET `/health`, `/v1/integrations`, `/v1/connections`, `/v1/connections/:id/status`, `/v1/connections/:id/account`, `/v1/connections/:id/quotes`; POST `/v1/connections`, `/v1/connections/:id/check` |
| NOVA AI Worker | GET `/health`, `/api/marketplace`; POST `/api/gen-ai/generate`, `/api/chat`, `/api/backtest` |
| Remote MCP Worker | GET `/health`, `/api/status`; POST `/mcp` |
| Legacy MCP Worker | GET `/health`, `/`, `/tools`, `/market-features`; POST `/generate`, `/allocate` |

## Security invariants

The following must remain true in every change and deployment:

```json
{
  "mode": "read-only",
  "ordersEnabled": false,
  "executionEnabled": false,
  "liveTradingEnabled": false,
  "mt5BridgeEnabled": false
}
```

- No endpoint may enable broker writes, place/modify/cancel orders, or move funds.
- Broker write paths remain blocked by the global fail-closed middleware.
- Kaggle compute-session creation remains disabled; do not trigger billable/quotas-consuming actions.
- Auto-Train remains unavailable until a provenance-backed dataset pipeline and verifiable training runtime exist.
- Static/synthetic market data and simulated backtests must never be represented as live data or validated OOS results.

## Frontend route alignment

- The three Kaggle paths in `src/api/apiClient.ts`, `src/services/modelService.ts`, and `SystemSettingsView.tsx` now have matching Root Express handlers.
- Auto-Train paths already existed. Frontend messaging was corrected to reflect the backend's 503 unavailable response instead of reporting successful training.
- No production deployment or runtime connectivity is claimed by the existence of these route definitions.

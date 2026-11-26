# NOVA Worker API contract (Cloudflare Workers)

> **Implementation status (verified against main@7a54b753ea250ab8bd98e36ca89c3a9b35a2e2b2, 2026-11-25): CONTRACT ONLY — NOT IMPLEMENTED / NOT DEPLOYED.** This file specifies a target read-only API; it is not evidence that a Core API Worker exists. The repository's [Command Center API data-source plan](../../../docs/governance/WO-004-COMMAND-CENTER-API-DATA-SOURCE-PLAN.md) records that no Core API Worker/deployment target was identified on main and that the frontend is disconnected by default while `VITE_NOVA_API_BASE_URL` is blank. Re-check main and deployment metadata before changing this status.
>
> **Service boundary:** this contract is for the NOVA Command Center REST API. It is not the [System Integration Hub](../../../integrations/system-hub/README.md), which implements owner-scoped connection lifecycle and read-only MT5 account/quote routes, and it is not the [Remote MCP Gateway](../../../integrations/remote-mcp-worker/README.md), which exposes authenticated research tools at `/mcp`. Do not point all Command Center API calls at either service as a substitute for the missing Core API.


The browser is untrusted. All authorization happens in the Worker.

## Auth
- Every endpoint except `/v1/health` requires `Authorization: Bearer <Supabase access token>`.
- Worker verifies the JWT against Supabase JWKS (`https://rovhmjeowracayicbqij.supabase.co/auth/v1/.well-known/jwks.json`), checks `exp`, `aud=authenticated`.
- Role = `app_metadata.nova_role` ∈ {admin, operator, viewer}. Missing/unknown ⇒ **403** (fail closed). Never read `user_metadata`.
- 401 = bad/missing token, 403 = insufficient role.

## Endpoints (GET only, read-only)
| Path | Min role | Response |
|---|---|---|
| `/v1/health` | none | `{status:"ok"\|"degraded"\|"down", version, time, liveTrading:false, brokerWrites:false}` |
| `/v1/me` | viewer | `{id,email,role}` |
| `/v1/services` | viewer | `{services:[{name,status}]}` |
| `/v1/bridge/status` | viewer | `{connected,lastHeartbeat,lastSync,latencyMs}` |
| `/v1/bridge/account` | operator | `{server,login,currency,leverage,tradeAllowed:false}` |
| `/v1/risk/policy` | viewer | `{dailyLossLimit,maxExposure,maxOrders,rules[]}` |
| `/v1/approvals` | operator | `{items:[{id,kind,requestedBy,createdAt,status,decidedBy?}]}` |
| `/v1/audit` | operator | `{events:[{id,at,actor,action,level}]}` |
| `/v1/assistant/status` | viewer | `{provider,model,ready}` |

## Explicitly out of scope
No order placement, position close, withdrawal, transfer, deposit or account mutation endpoints. The client blocks any non-GET call and any path matching order/withdraw/transfer/deposit (`src/lib/nova/safety.ts`).

## Future write endpoints (not implemented)
Emergency-stop and approval decisions must be POSTs on the Worker with role checks, idempotency keys, and an audit row written with the service role into `nova.*`. The UI must only show "confirmed" after the Worker returns confirmation.

## Worker skeleton
```ts
export interface Env { SUPABASE_URL: string; ALLOWED_ORIGIN: string; /* secrets via wrangler secret put */ }
export default {
  async fetch(req: Request, env: Env) {
    if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
    // CORS: allow only env.ALLOWED_ORIGIN
    // verify JWT with jose.createRemoteJWKSet(...), derive role, route, respond JSON
  },
};
```
Secrets (`wrangler secret put`): model provider key, MT5 bridge credentials, Supabase service role (only if writing audit rows).
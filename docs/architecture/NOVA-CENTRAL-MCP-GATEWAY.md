# NOVA Central MCP Gateway Architecture

Status: Architecture decision and migration baseline. This document does not claim that production routing has been cut over.

## Decision

NOVA has exactly one production MCP server endpoint: the existing Cloudflare Worker `voom-system-mcp` in `integrations/remote-mcp-worker/`. Treat it as the **NOVA MCP Gateway**. Do not create MCP servers, MCP transports, JSON-RPC handlers, tool registries, or MCP authentication implementations inside individual Workers.

The existing `voom-system-hub` in `integrations/system-hub/` remains the central integration control plane and API boundary. The Gateway authenticates the MCP caller, validates the MCP envelope, and dispatches only approved tool calls through the Hub's versioned API contract. The Hub authenticates/authorizes again at the service boundary, enforces tenant and connection ownership, applies capability policy, and routes to narrowly scoped Worker adapters.

This preserves a single MCP entry point without turning the Hub into an arbitrary proxy or granting MCP tools implicit authority.

## Target topology

```text
NOVA UI / Chat / approved MCP clients
                |
                | MCP Streamable HTTP (one endpoint)
                v
       NOVA MCP Gateway
       voom-system-mcp
       - MCP transport + JSON-RPC
       - one tool registry
       - caller authentication
       - schema validation / rate limits
                |
                | versioned Hub API contract
                | user context + request/correlation ID
                v
       NOVA System Integration Hub
       voom-system-hub
       - re-authenticate and authorize
       - tenant/connection ownership
       - capability + policy enforcement
       - audit + sanitized observability
       - deterministic routing
          |          |            |
          v          v            v
       NOVA AI    MT5 read-only   other approved
       Worker     Proxy/Relay    service adapters
          |          |
          v          v
       model/research  allocated Demo terminal

       Supabase Auth / RLS is the identity and data boundary.
```

Workers are service adapters, not MCP servers. They expose only their own bounded service API or internal service binding. They do not implement MCP protocol endpoints or publish independent tool catalogs.

## Component ownership

| Component | Owns | Must not own |
|---|---|---|
| `integrations/remote-mcp-worker/` | The only production MCP transport, JSON-RPC handling, tool catalog, MCP protocol compatibility | Broker credentials, tenant authorization as the sole authority, provider-specific business logic |
| `integrations/system-hub/` | Canonical Hub API, user/tenant authorization, capability registry, route allowlist, policy, correlation/audit | MCP transport, arbitrary URL proxy, model-controlled authorization |
| `integrations/nova-ai-worker/` | Bounded AI/research service API | MCP server or duplicate MCP tool registry |
| `integrations/mt5-readonly-proxy/` | Read-only MT5 account/market-data adapter | MCP transport or order execution |
| `integrations/mt5-bridge-relay/` and approved bridge runtime | Tenant-bound relay to the allocated terminal | MCP transport, cross-tenant route selection |
| other integration folders | Their explicitly documented adapter capability | MCP transport, independent MCP server |

The local `mcp-server/app.py` stdio process is a developer/test harness only. It is not a second production MCP endpoint and must not be deployed as a competing Gateway.

## Routing rules

1. MCP clients connect only to `https://voom-system-mcp.suwapat787.workers.dev/mcp`.
2. The Gateway invokes only fixed, versioned Hub routes. It never accepts a caller-provided upstream URL, Worker name, service binding, tenant ID, or route target.
3. The Hub derives the principal and tenant from a verified Supabase session. Caller-supplied tenant/user identifiers are hints at most and never authorization evidence.
4. The Hub selects an adapter from a server-side allowlist and derives the connection route from an ownership-checked record.
5. Adapters accept bounded, typed requests and return validated responses. They do not call other adapters through ad-hoc URLs.
6. No Worker creates a nested MCP server or re-exposes the Gateway protocol.
7. A capability not explicitly registered and enabled at both Gateway and Hub is unavailable by default.

## Security invariants

- Supabase bearer tokens are never logged, persisted in audit payloads, returned to clients, or passed to an LLM.
- Gateway authentication is not a substitute for Hub authentication. Protected Hub calls must independently validate the session and authorization context.
- The Hub enforces tenant and connection ownership for every protected operation; RLS remains enabled for user-owned data.
- Fixed HTTPS upstreams or authenticated Cloudflare service bindings only; no open proxy, arbitrary fetch, redirect credential forwarding, or caller-controlled routing.
- Explicit request/response schemas, payload limits, timeouts, bounded retries for idempotent reads, rate limits, and sanitized error categories.
- All current trading capabilities remain read-only: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`. No order, modify, close, transfer, withdrawal, or funding tool is to be registered.
- Health/configuration status must not be reported as authenticated or data-verified connectivity without a successful authorized end-to-end probe.

## Migration sequence

### Phase 0 — Baseline (this change)
- Record the single-Gateway decision and canonical Hub API contract.
- Inventory existing production endpoints and local-only MCP harnesses.
- Keep current deployed URLs and callers unchanged.

### Phase 1 — Contract and adapter boundary
- Add contract tests for Gateway-to-Hub authentication, version negotiation, request IDs, schema validation, tenant context derivation, error mapping, timeout, and no-secret logging.
- Add typed Hub routes for the tools currently implemented directly in the MCP Worker.
- Keep adapter operations read-only and bounded.
- Add a capability registry mapping each tool to one Hub operation and required authorization scope.

### Phase 2 — Gateway cutover
- Change Gateway tool handlers to call the Hub contract, not Supabase/PostgREST or provider Workers directly.
- Remove duplicated provider/data access logic from Gateway only after equivalent Hub routes and tests exist.
- Verify every existing MCP tool against the contract; preserve tool names where practical to avoid breaking clients.
- Verify that non-MCP UI callers use the same Hub API rather than bypassing policy.

### Phase 3 — Consolidation and de-duplication
- Search all repository code and deployment configs for MCP transports, JSON-RPC handlers, tool registries, and MCP server startup commands.
- Retain exactly one production MCP deployment target.
- Keep `mcp-server/app.py` explicitly local-only or remove it only after confirming no developer/test workflow depends on it.
- Remove duplicate server code only after consumer inventory and replacement tests pass. Do not delete unrelated Workers or deployed Cloudflare resources as part of source cleanup.

### Phase 4 — Verification and release
- Run unit/contract/security tests, tenant-isolation tests with two users, Worker build checks, and Gateway/Hub staging smoke tests.
- Verify no duplicate MCP endpoint is deployed or referenced by frontend/clients.
- Deploy Gateway and Hub only after exact-head CI passes; preserve rollback to the prior Gateway/Hub versions.
- Report completion only with commit SHA, CI run, staging smoke evidence, and deployment revision.

## Acceptance criteria

- [ ] Exactly one production MCP endpoint is documented and deployed.
- [ ] No individual adapter Worker implements MCP transport, JSON-RPC, or its own MCP tool catalog.
- [ ] All MCP tool execution crosses the versioned Hub API contract.
- [ ] Gateway and Hub independently authenticate/authorize protected requests.
- [ ] Tenant isolation is tested with at least two distinct users.
- [ ] Adapter routing is server-side allowlisted and cannot be selected by caller input.
- [ ] Secrets and bearer tokens are absent from logs, responses, and audit payloads.
- [ ] Read-only trading invariants are tested and remain disabled for execution.
- [ ] CI, staging, and deployment evidence is attached before marking the migration complete.

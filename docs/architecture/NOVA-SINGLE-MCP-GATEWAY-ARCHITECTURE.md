# NOVA Single-Gateway MCP Architecture

**Status:** Proposed target architecture / Phase 1 contract  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Decision:** One externally exposed MCP server. Domain capabilities are services behind the gateway, not independently duplicated MCP servers.

## 1. Architecture

```text
MCP clients / NOVA Workers
          |
          v
+-----------------------------------+
| NOVA Remote MCP — SINGLE GATEWAY  |
| MCP protocol, auth, routing, ACL  |
+-----------------------------------+
    |          |          |        |
    v          v          v        v
 Knowledge   Trading     MT5     Learning
 Service     Research    Broker  Service
             Service     Read-only
    |          |          |        |
    +----------+----------+--------+
               |
       Shared API Contract
       identity / tenant / trace
               |
     Supabase, market data, models,
     broker bridge and job runtime
```

Only **NOVA Remote MCP** is an MCP server exposed to clients. Knowledge, Trading, MT5 and Learning are logical domain services/modules reached through the gateway's internal service adapters. They must not each start another MCP listener or register duplicate MCP endpoints.

## 2. Service ownership

| Logical service | Owns | Must not own |
|---|---|---|
| NOVA Remote MCP (Gateway) | MCP transport, tool registry, authentication, authorization, tenant context, routing, rate limits, audit/trace IDs, error normalization | Domain business logic, broker execution |
| Knowledge MCP (Knowledge Service) | Knowledge retrieval, document indexing, citations/provenance, memory/knowledge query | Broker data access, model training orchestration |
| Trading MCP (Research Service) | Market/strategy research, indicators, backtest/research queries, signal analysis as non-executable research | Broker order placement, MT5 write operations |
| MT5 MCP (Read-only Broker Service) | Broker connection health, account/positions/orders/deals/history/quotes reads | Order send/modify/cancel, deposits, withdrawals, transfers, any trade execution |
| Learning MCP (Learning Service) | Dataset Registry, Model Registry, training jobs, evaluation, artifact lineage, Learning Orchestrator | Direct broker execution, bypassing gateway auth |

The names above are logical service names. Tool namespaces should be stable and explicit, e.g. `knowledge.*`, `trading.*`, `mt5.read.*`, `learning.*`.

## 3. Shared API contract

Every gateway-to-service request must carry a versioned envelope:

```json
{
  "contract_version": "1",
  "request_id": "uuid",
  "trace_id": "uuid",
  "tenant_id": "authenticated-tenant",
  "actor": {
    "type": "user-or-worker",
    "id": "authenticated-actor"
  },
  "operation": "service.operation",
  "issued_at": "RFC3339 timestamp",
  "payload": {}
}
```

Requirements:
- The gateway derives `tenant_id` and actor identity from verified credentials. Never trust client-supplied identity fields.
- Services validate contract version, required scopes, tenant ownership and payload schema independently.
- Propagate request/trace IDs to logs and asynchronous jobs; never log secrets or raw credentials.
- Use explicit timeouts, bounded payloads, pagination and rate limits.
- Return a normalized envelope with `request_id`, `status`, `data` or a typed `error`; do not leak stack traces.
- Reject unknown operations and unsupported contract versions (fail closed).
- Keep service-to-service credentials separate from user credentials and rotate them independently.

## 4. Security boundaries

### MT5 read-only enforcement
Read-only is enforced at multiple layers, not merely by hiding tools:
- Expose only read methods in the MT5 adapter and tool registry.
- Do not import or expose order-send, order-modify, order-close, fund-transfer or withdrawal methods.
- Use broker credentials/account permissions configured for read-only access where supported.
- Reject write-like operation names at the gateway and again in the MT5 service.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false` as explicit safety defaults.
- Audit every account/position/history read with tenant, actor, account reference and trace ID (never credentials).

### General isolation
- Authenticate at the gateway; authorize each operation by role/scope and tenant.
- Services must not accept a tenant ID as proof of authorization.
- Deny cross-tenant resource references even if an identifier is guessed.
- No service may bypass the gateway for client-facing MCP access.
- Internal health checks expose no secrets or customer data.

## 5. Tool registration and duplicate prevention

Maintain one canonical tool registry owned by NOVA Remote MCP:
- Each tool has one stable fully qualified name, one owner service, one input schema and one output schema.
- Reject duplicate fully qualified names at startup/CI.
- Do not copy MCP server bootstrap, transport listeners, auth middleware or tool registration into Workers.
- Workers call the gateway or typed internal APIs; they do not host their own MCP servers.
- Service adapters are registered once and dependency-injected into the gateway.
- A service may be deployed as a normal HTTP/queue worker if required, but it is not a second MCP server.

## 6. Learning lifecycle

Learning Service owns the lifecycle:
1. Register and validate dataset metadata, source, time coverage, schema and lineage.
2. Create a training job from an immutable dataset/version and configuration.
3. Run training asynchronously through the job runtime.
4. Register model artifact, code/config version and training provenance.
5. Evaluate against frozen validation/OOS boundaries and record metrics.
6. Promote only through an explicit approval gate; never auto-enable broker execution.
7. Expose status, logs, metrics and artifacts through gateway-routed Learning tools.

Mock training must be labeled as mock and must never be reported as completed real training.

## 7. Migration plan

### Phase 1 — Architecture and contract (this change)
- Record the target topology, ownership, common envelope and safety boundaries.
- Establish duplicate-prevention rules and migration acceptance criteria.

### Phase 2 — Inventory and consolidation
- Inventory all current MCP entrypoints, transports, tool registrations and Worker-local MCP servers.
- Map each existing tool to exactly one owner service; identify duplicates and callers.
- Preserve existing tool behavior while routing through the single gateway.
- Do not delete or disable a live endpoint until its replacement has passing contract tests and callers have migrated.

### Phase 3 — Service adapters
- Implement Knowledge, Trading, MT5-read-only and Learning adapters behind the gateway.
- Move domain logic out of transport/bootstrap code.
- Enforce tenant isolation, scopes, timeouts, audit and typed errors.

### Phase 4 — Verification and cutover
- Test gateway routing and every service contract.
- Test duplicate tool-name rejection and ensure Workers expose no MCP listeners.
- Test MT5 write attempts are impossible/denied at both gateway and adapter.
- Test two-tenant isolation for all tenant-scoped reads and writes.
- Verify Learning dataset/model lineage and a real (non-mock) training/evaluation run.
- Cut over only after CI, preview and runtime smoke tests pass; retain rollback path.

## 8. Acceptance criteria

- [ ] Exactly one client-facing MCP server: NOVA Remote MCP.
- [ ] Knowledge, Trading, MT5 and Learning are service adapters/modules, not duplicate MCP servers.
- [ ] Every exposed tool has one owner and a unique fully qualified name.
- [ ] Workers route through the gateway and do not start MCP listeners.
- [ ] Shared contract version, authenticated tenant context and trace propagation are enforced.
- [ ] MT5 service has read-only surface and denies all execution/fund movement operations.
- [ ] Learning service owns Dataset Registry, Model Registry, training, evaluation and lineage.
- [ ] Tenant-isolation, auth, duplicate-registry and safety tests pass.
- [ ] No production cutover is claimed without CI and runtime evidence.

## 9. Important implementation note

This document establishes the architecture decision and migration contract. It does **not** claim that the existing runtime has already been consolidated. Runtime completion requires repository-wide inventory, code changes, automated tests and deployment evidence in subsequent phases.

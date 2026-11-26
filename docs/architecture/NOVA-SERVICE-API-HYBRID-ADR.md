# NOVA Service API Architecture — Hybrid

- Decision: accepted for implementation planning
- Scope: all NOVA domains
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Baseline: `b11b46420b5056fea1c1570c4382e6097928c771` (`main`, checked 2026-11-16)
- Delivery branch: `feature/nova-service-api-hybrid-architecture-20261116`
- Production impact: none; this branch contains architecture/OpenAPI documentation plus limited System Hub runtime hardening (server-generated request IDs, redacted unexpected-error responses, and body rejection on two existing POST routes). No deployment, secrets, bindings, database migrations or Production settings are changed.

## 1. Decision

Adopt a **hybrid Service API architecture**:

1. A central NOVA System Hub is the public control plane and policy enforcement point.
2. Domain services remain independently deployable and own their domain logic/data contracts.
3. Browser, mobile, EA/MT5 bridge clients, and third parties call the public Gateway only. Direct public access to internal services is not part of the default trust model.
4. The Gateway routes only to explicitly registered, allow-listed service adapters. It is not an arbitrary URL proxy.
5. Service-to-service calls require a separately authenticated workload identity and explicit authorization. Do not treat a forwarded user ID, tenant ID, connection ID, or model output as credentials.

This combines centralized identity, tenant policy, audit and API versioning with independent service lifecycle, scaling and failure isolation.

## 2. Verified baseline inventory

The following are source-tree observations at the baseline SHA, not proof that deployed endpoints are healthy or production-ready.

| Domain | Existing source / interface | Current evidence and constraint |
|---|---|---|
| System Hub | `integrations/system-hub/worker.js` | Cloudflare Worker control plane. Implements `/health`, `/v1/integrations`, `/v1/connections`, and per-connection status/check/account/quotes. Supabase bearer validation and owner-scoped connection queries are present. |
| AI Runtime | `integrations/nova-ai-worker/worker.js` | Separate authenticated research interface. Strategy output is research-only; execution and live trading are disabled. |
| MCP | `integrations/remote-mcp-worker/src/index.js` | Separate authenticated, stateless tools-only Worker. Read-only subset; do not claim full MCP coverage or expose broker-write tools. |
| MT5 Bridge / Proxy | `integrations/mt5-bridge-relay/`, `integrations/mt5-readonly-proxy/` | Separate tenant-aware read-only path. Keep broker credentials and tenant routing server-side. |
| Video API | `docs/openapi/nova-video-api.yaml` and video API implementation | Existing versionless `/api/video/*` contract is tenant-scoped and records job requests only; execution is explicitly disabled. |
| Quant / Backtest | `workers/quant_engine/`, `workers/backtest/`, `docs/INTERNAL-QUANT-ENGINE-ARCHITECTURE.md` | Research prototypes and experiment contracts; not a production training or trading service. No broker-write API. |
| Data / Ingestion | `workers/data-ingestion/`, shared schemas | Prototype adapters. Require provenance, UTC timestamps, schema validation and immutable dataset references before production claims. |
| Core Express API | `server.ts` | Legacy application API currently exposes multiple domain routes. Migration must be incremental; do not replace all routes in one cutover. |
| Frontend clients | `src/api/apiClient.ts`, `src/services/apiClient.ts` | Two API client abstractions exist. Consolidate only after call-site inventory and compatibility tests; one currently reads browser localStorage for bearer tokens, which needs security review. |

## 3. Target topology

```text
Browser / Mobile / EA / approved external client
                    |
             HTTPS + Bearer
                    |
       NOVA System Hub / API Gateway
       - Supabase Auth verification
       - tenant/owner resolution
       - capability and policy checks
       - rate limits / request limits
       - correlation ID / audit metadata
       - API version negotiation
                    |
          allow-listed service routing
       +------------+-------------+-------------+
       |            |             |             |
    AI Service   Quant Service  Data Service  Video Service
       |            |             |             |
    AI Worker    research jobs  ingestion     job metadata
       |
    MCP tools (separate protocol adapter)

    Trading / MT5 domain:
    Gateway -> tenant-aware read-only broker adapter -> dedicated Bridge
    No order-write path is included in this architecture.
```

The Gateway is the public entry point and control plane, not a requirement that all compute run inside one Worker. Services can have independent Workers/runtime deployments, but private service endpoints must not become an authentication bypass.

## 4. Service ownership and API boundaries

| Service | Owns | Allowed initial API capability |
|---|---|---|
| Identity / Gateway | Authentication verification, tenant context, service registry, policy, request IDs | Health, integration catalog, user-owned connection metadata, authorized routing |
| AI | Model provider adapters, prompts, research outputs | Authenticated inference/research; no authorization decisions or execution tools |
| Quant | Experiment definitions, immutable run inputs, backtest/evaluation outputs | Submit/read research jobs only after job authorization and bounded resource controls |
| Data | Source adapters, ingestion manifests, provenance, dataset versions | Read catalog and validate/ingest approved datasets; no silent source substitution |
| Trading / MT5 | Broker connection state, market/account reads, bridge routing | Demo read-only account, symbol, quote and history reads |
| Automation | Workflow definitions and run state | Trigger only allow-listed workflows with explicit policy, idempotency and audit |
| Video | Projects and job metadata | Existing request-recording contract; generation remains unavailable until a verified free runtime exists |
| YouTube / Creator | Channel connection and analytics/posting adapters | Separate read and write scopes; posting requires explicit user grant and platform OAuth scopes |
| MCP / Tool adapter | Protocol translation and tool catalog | Authenticated, allow-listed tools; no dynamic tool authorization from model output |

Each service owns its request/response schema and error semantics. Shared identity and safety claims are enforced at the Gateway and re-checked by the service for sensitive tenant-owned resources.

## 5. Contract and versioning rules

- New public contracts use `/v1/<domain>/...`; breaking changes use a new major path such as `/v2`.
- OpenAPI 3.1 is the source of truth for HTTP APIs. MCP remains a separate protocol contract.
- Every protected route requires a verified Supabase bearer token or an approved workload identity.
- Derive `user_id` and tenant ownership from verified identity and database policy. Never trust caller-supplied ownership fields.
- Standard error envelope: `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`; do not return stack traces, secrets or provider raw errors.
- Mutating requests require bounded JSON bodies, strict schemas, idempotency where retries can duplicate work, and explicit audit metadata.
- Apply per-tenant and per-route rate limits, request/body limits, timeouts, bounded retries with jitter, and no-store caching for sensitive responses.
- CORS is browser policy only, never authentication. Exact allow-listed origins only.
- Health is minimal and public. Readiness, dependency diagnostics and tenant data require authentication.
- Service registry entries declare owner, version, endpoint binding, auth mode, data classification, capability set, timeout, retry policy and lifecycle status.
- No arbitrary URL, host, path, model-selected service, or user-provided Worker URL may be routed.

## 6. Security and non-negotiable safety invariants

- No secrets in frontend bundles, OpenAPI examples, logs, commits or responses.
- No Supabase service-role key in browser code or general-purpose Workers.
- Tenant isolation is enforced at every data access, not only at the Gateway.
- MT5 remains Demo/read-only: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- No order submission, SL/TP mutation, position close, transfer, withdrawal, or Live Trading API is introduced by this architecture.
- AI/MCP outputs are untrusted data and cannot grant permissions or call unregistered services.
- Fail closed when authentication, tenant mapping, policy, service registration or dependency verification is unavailable.
- Training and backtest metrics must be backed by real data and execution evidence; otherwise return unavailable/blocked, not simulated success.
- No production secrets, Supabase migrations, Cloudflare bindings, Netlify settings, DNS, or deployments are changed in this phase.

## 7. Migration plan

### Phase 0 — baseline and contract (completed as branch work)
- Freeze exact Main SHA.
- Inventory existing API/Worker surfaces and security boundaries.
- Publish this ADR and the first OpenAPI contract for the existing System Hub surface.

### Phase 1 — gateway hardening (partial; not release-ready)
- Implement server-generated request IDs and a redacted 500 response for unexpected handler errors.
- Reject request bodies on the two existing POST routes that do not accept bodies (`POST /v1/connections` and `POST /v1/connections/{id}/check`). This is endpoint-specific rejection, not a general ingress/body-size limit.
- Remaining: structured audit events, standardized error envelope, distributed rate limits, general request/body limits for future body-accepting routes, and exact-head passing CI/test evidence.

### Phase 1 — remaining gateway hardening
- Add structured, redacted audit events with stable event names and request correlation.
- Define and migrate to the standard error envelope without breaking existing clients; current runtime errors are not yet standardized to the ADR envelope.
- Design and implement distributed per-tenant/per-route rate limits with an explicit zero-cost-compatible mechanism, failure behavior and abuse controls.
- Define general ingress/body-size limits before introducing any body-accepting endpoint; the two existing POST routes currently reject all bodies.
- Add contract tests for authentication order, tenant isolation, origin handling, unknown routes and fail-closed dependency errors.
- Require exact-head passing CI, dedicated Node tests and OpenAPI validation before calling this phase release-ready.

### Phase 2 — service registry and adapters
- Define typed service registry and allow-listed routing adapters.
- Add workload identity for service-to-service calls; do not reuse browser user tokens as service credentials.
- Keep existing Worker URLs and deployment workflows unchanged until each adapter passes tests.

### Phase 3 — domain API extraction
- Extract one domain at a time: AI, Data, Quant, Video, Automation, Creator/YouTube, Trading/MT5.
- Preserve legacy routes with compatibility adapters during migration.
- Use shadow/read-only comparison before switching clients. No dual writes without an explicit idempotency and reconciliation design.

### Phase 4 — client consolidation
- Inventory all frontend API call sites.
- Consolidate duplicate API clients, remove unsafe token-storage assumptions, and generate typed clients from OpenAPI.
- Migrate UI and approved external clients by domain, not by a single global cutover.

### Phase 5 — release gate
- Feature-branch tests, security review, dependency/cost review, exact-head CI evidence and rollback plan.
- PR review required. Merge/deploy requires a separate explicit approval.

## 8. Acceptance criteria

- All public service calls pass through the Gateway or a separately approved protocol edge.
- Protected service routes independently verify caller/workload identity and tenant ownership.
- No arbitrary proxying or model-selected endpoint routing exists.
- OpenAPI contracts match implemented routes and are contract-tested.
- Each service has owner, version, health/readiness semantics, timeout, rate limit and error contract.
- Legacy route compatibility is tested before client migration.
- Trading read-only invariants and training honesty tests remain passing.
- No Production resource, secret, binding, database schema or deployment changes occur without a separate approved release plan.

## 9. Known gaps / unresolved evidence

- The current System Hub is a real source-level control-plane implementation, but its live deployment and every integration path have not been verified by this branch audit.
- The current `server.ts` still combines multiple domain endpoints; service extraction has not yet occurred.
- Two frontend API clients exist; actual use and token provenance need call-site analysis.
- Service-to-service workload identity, registry-backed routing, standard rate limiting and shared request/audit envelope are not yet demonstrated as complete.
- The current Video OpenAPI server URL points to the Netlify origin; deployed route availability must be checked before treating it as a live Gateway route.
- Cloudflare Worker deployment workflows and bindings are not modified here.

## 10. Next implementation slice

Continue with the remaining Gateway hardening items above, beginning with reproducible exact-head test/CI diagnostics. Do not extract or deploy a domain service until tenant isolation, auth failure behavior, route allow-list and cost controls are proven by tests.

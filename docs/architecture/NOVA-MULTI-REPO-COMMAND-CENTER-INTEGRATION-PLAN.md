# NOVA Command Center — Multi-Repository Integration Contract

**Status:** Architecture baseline / implementation plan. Not a deployment approval.  
**Baseline:** `VOOM_SYSTEM-NOVA-AI@main` = `7df888d2e1f6d8002d1012ba8b101d130745b43c`  
**Work branch:** `feature/nova-command-center-multi-repo-contract`

## 1. Objective

Make NOVA the single administrative Command Center and integration control plane for the VOOM system family. Repositories remain independently owned and released; they communicate through versioned, authenticated APIs rather than shared databases, copied Workers, or direct cross-repository imports.

This document is a source-of-truth proposal for implementation and acceptance. It does not claim that the repositories are already connected.

## 2. Repository responsibility map

| Repository | Primary responsibility | Integration boundary | Must not become |
|---|---|---|---|
| `vutting895/VOOM_SYSTEM-NOVA-AI` | NOVA Core, Command Center UI, system registry, policies, audit and orchestration | Owns canonical API contracts and admin control plane | A duplicate client product or uncontrolled execution gateway |
| `vutting895/voom-ai` | Customer-facing web / Android trading research client | Supabase user session -> NOVA public client API; read-only data and paper simulation | Admin control plane or broker execution service |
| `vutting895/System-nova-backend` | Backend candidate; exact ownership and overlap are unresolved | Must be mapped against NOVA Core and deployed Workers before any route is assigned | A second API gateway or duplicate NOVA backend |
| `vutting895/Voom-studio-affiliate-` | Independent affiliate video/content production and publishing product | Optional, narrow service registration / webhook contract only when needed | A NOVA subsystem with shared credentials, users, or runtime assumptions |
| `vutting895/voom-remote-desktop` | Separate Windows read-only agent and device gateway (scaffold stage) | Device-authenticated outbound connection -> NOVA Remote MCP Gateway; read-only inventory | Arbitrary shell/control plane or trading/broker control path |

The Affiliate repository remains a separate product and security boundary. Its current README still documents Base44 SDK usage; this is legacy documentation evidence, not proof of current runtime dependency. Audit and remove any remaining Base44 runtime before claiming compliance.

## 3. Target topology

```text
                 Admin identity / RBAC
                         |
                         v
             NOVA Command Center (admin UI)
                         |
                         v
             NOVA System Hub / API Gateway
              /          |           \
             /           |            \
      System Registry  Policy/Audit  Service Router
            |              |              |
            |              |              +--> NOVA AI Worker (analysis only)
            |              +-----------------> Supabase (owner/RLS scoped)
            +--------------------------------> Remote MCP Gateway
                                                |--> Knowledge service
                                                |--> Trading Research service
                                                |--> MT5 read-only service
                                                |--> Learning / Datacenter service
                                                +--> Remote Desktop gateway (future)

 VOOM AI customer app --------------------------> NOVA client API (separate user RBAC)
 Affiliate app -------------------------------> isolated affiliate APIs (optional)
```

NOVA Remote MCP remains the single MCP gateway. Knowledge, Trading Research, MT5 Read-only, Learning, and Remote Desktop are service/tool groups behind the gateway, not new MCP servers per Worker. The System Hub is the application/API control plane; it is not a second MCP server.

## 4. Existing infrastructure inventory (source evidence)

### Cloudflare Workers observed

The account currently lists these Worker scripts:

- `voom-system-hub` — existing integration/control-plane Worker.
- `voom-system-hub-staging` — staging counterpart.
- `voom-system-mcp` — existing Remote MCP Gateway.
- `voom-mt5-readonly-proxy` and `voom-mt5-readonly-proxy-staging` — read-only broker adapter.
- `voom-mt5-bridge-relay` and `voom-mt5-bridge-relay-staging` — tenant-routed MT5 relay.
- `voom-system-nova-ai` — NOVA AI/research Worker.
- `nova-core-api-staging` — staging API candidate; not yet approved as the canonical production API.
- `voom-system-api`, `voom-system-nova-ui`, `voom-ai-private-chat`, `voom-customer-portal`, and other scripts — legacy or separately scoped candidates requiring consumer/route inventory.

Do not delete, rename, repurpose, or deploy any Worker based only on its name. First map routes, bindings, consumers, logs, and exact source SHA. Read secret binding names only; never retrieve or print secret values.

### Existing API mismatch to resolve

The active System Hub source currently exposes:

- `GET /health`
- `GET /v1/integrations`
- `GET /v1/connections`
- `POST /v1/connections` (creates an idempotent pending Demo request; clients must not call without owner approval)
- `GET /v1/connections/:id/status`
- `POST /v1/connections/:id/check`
- `GET /v1/connections/:id/account`
- `GET /v1/connections/:id/quotes`

The NOVA Command Center client documentation currently describes a different set, including `/v1/health`, `/v1/services`, `/v1/bridge/status`, `/v1/risk/policy`, `/v1/approvals`, and `/v1/audit`. Those routes must not be assumed to exist until implemented and tested. Resolve this by updating the typed client and the Hub contract together; do not maintain two competing API dialects.

### Newly confirmed repository blockers

- `System-nova-backend` is not currently proven to be a production backend service. Its `server.ts` contains seeded demo events/workers/commands, process-global in-memory stores, synthetic/randomized telemetry, wildcard CORS, and fallback API/secret-looking values in source. Some routes accept state-changing requests. This is incompatible with a trusted central control plane. **Do not connect it to NOVA, expose it as a trusted service, or point a frontend at it** until it is isolated, credentials are removed/rotated if any were ever real, auth/RBAC and tenant checks are added to every protected route, CORS is allowlisted, mock data is removed, and contract/security tests pass.
- `Voom-studio-affiliate-` current `package.json` does not include `@base44/sdk`; current `server.ts` uses Supabase auth/persistence modules and explicitly retires legacy `/entities` and `/functions` endpoints with HTTP 410. Therefore the README's Base44 SDK architecture is stale and must be corrected after the current implementation is audited. Its current persistence is owner-restricted and disables auto-publish/publishing paths in the code inspected; do not treat this as a completed production integration.
- `voom-remote-desktop` main README explicitly says no Windows agent has been installed or connected and no remote-control capability is implemented. Keep it as a future read-only service; do not register it as connected.
- `voom-ai` main remains a README-only bootstrap. PR #6 is open/draft, stacked on `feature/voom-ai-client-foundation`, and CI evidence covers build/tests/package only; authenticated runtime against the deployed Hub is still unverified. Do not merge the PR or call VOOM AI integrated until the stacked base is reviewed and runtime acceptance passes.

These are blocking findings, not implementation suggestions. No secret values were retrieved or copied into this document.

### Confirmed Supabase / Hub schema mismatch

A read-only database inspection confirmed a concrete integration defect:

- The production `voom-system-hub` plain-text `SUPABASE_URL` binding points to `rovhmjeowracayicbqij`.
- In that project, `public.broker_connections` does not exist; `nova.mt5_broker_connections` does exist. The same project also contains `nova.approvals` and `nova.audit_events`.
- The current `integrations/system-hub/worker.js` connection helper builds `/rest/v1/broker_connections`, which targets the `public` schema. Therefore its current connection-list/create path is inconsistent with the observed production database schema unless an alternate runtime path or view exists (none was established in this inspection).
- The separate `tlyyxufuiimrbaksoitf` project does contain `public.broker_connections`, but it does not contain the `nova.approvals` or `nova.audit_events` tables. Switching the whole Hub to that project would split NOVA state and is not an acceptable unreviewed workaround.
- The production Hub `ALLOWED_ORIGINS` binding currently lists the NOVA Netlify origin and legacy Cloudflare UI fallback, not `https://voom-ai.netlify.app`. VOOM AI PR #6 uses a same-origin Netlify Edge proxy, so test that exact proxy path before changing CORS; do not broaden CORS without need.

**Required fix path:** keep the intended canonical project unchanged for now; inspect the applied `nova.mt5_broker_connections` migration, confirm whether the `nova` schema is exposed to PostgREST, then update the Hub to use an explicitly approved schema-aware query/view with the existing RLS and owner scope. Add integration tests proving own-row read, cross-user denial, pending insert, and sanitized response. Do not create a duplicate `public.broker_connections` table, switch projects, or apply schema changes until backup/rollback and migration ownership are reviewed.

### Supabase projects observed

- `rovhmjeowracayicbqij` — ACTIVE_HEALTHY; referenced by the current System Hub and VOOM AI PR #6 as the canonical Hub/Auth project.
- `tlyyxufuiimrbaksoitf` (label `Voom_system`) — ACTIVE_HEALTHY; separate project requiring ownership/data/migration inventory before any consolidation.
- `sblwulsqzlqmycvdolcu` (label `Mt5`) — INACTIVE.

Do not merge projects, migrate records, apply migrations, or change Auth/RLS until project ownership, schema, consumers, backups, and rollback are documented and reviewed.

## 5. Canonical API contract — proposed v1

### Shared request rules

- HTTPS only; JSON request/response.
- User-facing protected routes require a valid Supabase access token. The Worker verifies the session server-side.
- Admin routes additionally require a trusted `app_metadata.nova_role` claim in `{admin, operator, viewer}`; never trust `user_metadata`, client-supplied role, tenant ID, or user ID.
- Tenant and record ownership are resolved server-side. RLS remains enabled as defense in depth.
- Every response includes `requestId`, `apiVersion`, and `timestamp`; errors use a stable `{ error: { code, message, retryable }, requestId }` envelope.
- Apply bounded request sizes, timeouts, pagination, allowlists, rate limits, and sanitized audit events.
- Never return secrets, broker credentials, raw tokens, private bridge payloads, or service-role material.
- All API paths are read-only unless a specific write route is separately reviewed, role-gated, idempotent, audited, and explicitly approved.

### Admin Command Center routes (implementation required)

| Method | Route | Minimum role | Purpose |
|---|---|---|---|
| GET | `/v1/me` | viewer | Authenticated principal and effective NOVA role |
| GET | `/v1/health` | public | Minimal process health only; no dependency claim |
| GET | `/v1/services` | viewer | Registered service status and freshness |
| GET | `/v1/integrations` | viewer | Integration registry and declared capabilities |
| GET | `/v1/connections` | viewer | Current user's owned connection metadata |
| GET | `/v1/connections/:id/status` | viewer | Configured/reachable/authenticated/data_verified state |
| GET | `/v1/bridge/status` | viewer | Aggregated bridge heartbeat, source timestamp and latency |
| GET | `/v1/bridge/account` | operator | Sanitized read-only account summary for authorized owner |
| GET | `/v1/risk/policy` | viewer | Effective risk limits and immutable execution-off flags |
| GET | `/v1/approvals` | operator | Owner/tenant-scoped approval queue |
| GET | `/v1/audit` | operator | Sanitized, paginated audit events |
| GET | `/v1/assistant/status` | viewer | AI provider readiness without exposing credentials |

The current System Hub routes remain authoritative where they already exist. Missing routes above are backlog, not working features. Write routes for approvals, emergency stop, user/role changes, broker connection creation, deployment, or trading remain disabled until separately threat-modeled and approved.

### Service-to-service contract

- Services are registered with stable `serviceId`, owner repository, environment, API version, base URL identifier, supported capabilities, auth mode, health check, data classification, and lifecycle status.
- Callers use fixed configured upstreams. No arbitrary URL, caller-selected tenant, caller-selected credential, or LLM-generated route.
- Internal service authentication uses short-lived service identity or an approved signed assertion; do not forward browser bearer tokens to unrelated services.
- Service responses preserve source timestamp, provenance, tenant scope, and explicit `verified` state.
- Remote MCP forwards only the authenticated user's allowed tool calls to the appropriate service group. It does not create per-service MCP servers.

## 6. API ownership and routing

| Capability | API owner | Consumers |
|---|---|---|
| Admin services, health, registry, policy, audit | NOVA System Hub | NOVA Command Center |
| Customer connections and read-only broker data | NOVA System Hub + MT5 read-only proxy/relay | VOOM AI, NOVA admin views |
| AI analysis / strategy research | NOVA AI Worker, routed through approved NOVA service boundary | VOOM AI and NOVA Command Center |
| Research and MCP tools | NOVA Remote MCP Gateway | NOVA internal tools and approved clients |
| Learning / datasets / models | Datacenter Learning API behind Remote MCP | NOVA Command Center (admin summaries), authorized research workflows |
| Affiliate content/video/publishing | Affiliate backend only | Affiliate app |
| Remote device inventory | Remote Desktop gateway (future) | NOVA Command Center via read-only service registration |

No browser client connects directly to MT5 relay, private Worker secrets, Datacenter admin endpoints, or another repository's database.

## 7. Security and release invariants

- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false` across all client and service contracts.
- MT5 MCP is read-only. Remote Desktop MVP is read-only and has no arbitrary shell, file write, screen/input injection, or trading action.
- Distinguish `configured`, `reachable`, `authenticated`, and `data_verified`; a green process health check does not prove upstream or broker connectivity.
- Admin UI and customer UI use separate authorization policies and route scopes.
- Affiliate remains tenant/product isolated; no shared privileged token or shared admin session.
- No paid services, billing activation, or plan upgrades without explicit approval.
- No deployment, Worker promotion, DNS change, production origin switch, or live trading activation under this work item.

## 8. Phased implementation and acceptance

### Phase 0 — Inventory (in progress)

- [x] Confirm repository access, default branch, and current `main` SHA for core repositories.
- [x] Identify NOVA Command Center app and its existing API client/contract.
- [x] Identify current System Hub, Remote MCP Gateway, MT5 proxy/relay and deployed Worker names.
- [x] Identify Supabase projects and distinguish the Hub-referenced project from the separately named Voom_system project.
- [ ] Map `System-nova-backend` source ownership against NOVA Core; decide merge, retire, or bounded service role.
- [ ] Map all Worker routes, custom domains, GitHub workflows, Netlify sites, and repository consumers.
- [ ] Audit Affiliate Base44 runtime references and Remote Desktop feature-branch implementation.

### Phase 1 — Contract and registry

- [ ] Publish canonical OpenAPI 3.1 document and JSON Schemas under `docs/openapi/`.
- [ ] Add a machine-readable service registry with owner repo, environment, API version, auth policy, capability flags, health route, and data classification.
- [ ] Align NOVA Command Center typed API client to the actual Hub contract.
- [ ] Add contract tests for auth, role enforcement, tenant isolation, errors, pagination, CORS, rate limits and read-only invariants.

### Phase 2 — Implement missing Command Center APIs

- [ ] Add the missing admin read endpoints to the existing System Hub only after checking current Supabase schema and RLS.
- [ ] Add service health adapters that distinguish process health from upstream readiness and data verification.
- [ ] Connect audit, risk, approval and service registry reads to authoritative sources; no mock values.
- [ ] Add request correlation IDs and sanitized structured logs.

### Phase 3 — Connect clients and services

- [ ] Rebase/review VOOM AI PR #6's stacked dependency and complete authenticated Web/Android runtime checks.
- [ ] Add VOOM AI only to the approved client-facing CORS/origin allowlist after confirming its actual Preview hostname and auth flow.
- [ ] Keep the Affiliate API isolated; register status only if a real service integration requirement is confirmed.
- [ ] Connect Datacenter Learning through the existing Remote MCP Gateway only after its fixed HTTPS endpoint and authenticated end-to-end smoke test are available.
- [ ] Connect Remote Desktop only after enrollment, per-device auth, revocation, TLS, authorization and audit gates pass.

### Phase 4 — Verification (no production promotion)

- [ ] Build/typecheck/test each repository against its pinned runtime and lockfile.
- [ ] Run Hub contract tests and two-tenant isolation tests.
- [ ] Run authenticated VOOM AI Web and Android read-only checks.
- [ ] Verify all data has provenance and freshness; reject mocks as connectivity evidence.
- [ ] Verify no write/trading routes are exposed to clients or MCP.
- [ ] Capture exact SHA, test run, API request IDs, and sanitized results in the integration log.

### Definition of done

The repositories are integrated only when every service has an owner and versioned contract, every consumer uses the canonical route, auth/RBAC/tenant boundaries are verified, required runtime checks pass, and exact-SHA evidence is recorded. A repository being accessible on GitHub or a Worker existing in Cloudflare is not proof of integration.

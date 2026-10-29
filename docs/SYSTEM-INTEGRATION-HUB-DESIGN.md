# NOVA System Integration Hub — Architecture Proposal

## Decision

Replace the role of the legacy Alpaca OAuth Worker with a clearly named **NOVA System Integration Hub** (voom-system-hub) as the control plane for integration status, connection configuration, tenant routing, and safe read-only operations.

This is a proposed architecture and migration plan. It does not rename or deploy a Cloudflare Worker by itself. The existing integrations/alpaca-worker is an Alpaca-specific OAuth implementation and must not simply be renamed in place: its routes, OAuth callbacks, secrets, database migration, and frontend component are provider-specific. Keep it as a legacy/archive path until dependencies are verified and a separately reviewed migration is complete.

## Product responsibility

The Hub is the single control-plane API for NOVA integrations. It coordinates integration metadata and authorization; it is not a universal proxy that blindly forwards requests.

### In scope
- Integration registry and health/readiness summaries.
- Authenticated user connection inventory, scoped to the current tenant.
- Provider/connection configuration metadata (never return credentials).
- Per-tenant routing to the approved provider adapter.
- Safe diagnostics and correlation IDs for support.
- Read-only broker account, quote, and market-data reads through the existing Exness MT5 read-only proxy/relay.
- Explicit capability and readiness reporting so the UI can distinguish configured, reachable, authenticated, and data-verified states.

### Out of scope for v1
- Order placement, modification, cancellation, or any live-trading capability.
- Storing broker passwords or exposing secrets to the browser/model.
- Letting an LLM decide authorization or tenant ownership.
- A generic arbitrary-URL fetch/proxy endpoint.
- Replacing the existing MT5 bridge, relay, AI Worker, or MCP Worker in one migration.

## Proposed naming

| Component | Proposed name | Responsibility |
|---|---|---|
| Control-plane Worker | voom-system-hub | Integration registry, connection status, tenant-safe routing |
| Exness MT5 proxy | voom-mt5-readonly-proxy | Authenticated read-only account/market-data API |
| MT5 relay/bridge | Keep current deployed name until verified | Routes requests to an allocated Windows MT5 terminal |
| NOVA AI Worker | Keep current deployed name until verified | Authenticated analysis/research interface |
| Remote MCP Worker | Keep current deployed name until verified | Exposes a bounded set of authenticated tools to MCP clients |

The Hub may call the MT5 proxy through a fixed allowlisted service binding or fixed configured origin. Do not accept caller-supplied upstream URLs.

## Architecture

```text
NOVA UI / Chat
      |
      | Supabase access token (HTTPS)
      v
NOVA System Integration Hub (control plane)
      |-- validate user/session with Supabase Auth
      |-- authorize tenant + connection ownership (server-side)
      |-- read integration registry / route map
      |-- emit sanitized audit event + correlation ID
      |
      +--> NOVA AI Worker (analysis only)
      |
      +--> MT5 Read-only Proxy --> tenant route map --> MT5 Relay --> allocated Exness Demo terminal
      |
      +--> Remote MCP Worker (only if needed by an approved MCP client)
```

The Hub should use a deterministic router and bounded provider adapters (LLM architecture level 2: LLM + bounded tools only where a model is actually needed). Health checks, authorization, routing, and configuration are deterministic code. The Hub itself does not need an autonomous agent.

## API contract (v1 proposal)

All protected endpoints require a valid Supabase access token in Authorization: Bearer <token>. Validate the token server-side with Supabase Auth or a verified supported JWT-validation method. Never treat a user ID, connection ID, tenant ID, or a model-selected tool as proof of authorization.

- GET /health — public, minimal readiness flags only; no account data, IDs, secrets, or environment dump.
- GET /v1/integrations — authenticated list of supported integration types and capability flags.
- GET /v1/connections — authenticated connections owned by the current user/tenant; redact credential fields.
- GET /v1/connections/:connectionId/status — authenticated, ownership-checked status with distinct states: not_configured, configured, reachable, authenticated, data_verified, degraded, unavailable.
- POST /v1/connections/:connectionId/check — authenticated, ownership-checked, bounded read-only probe; rate-limited and time-limited.
- GET /v1/market/quote?symbol=... — authenticated read-only quote for an allowlisted symbol and authorized connection, only after the underlying proxy contract is verified.

Do not add a generic /proxy?url= endpoint. Unknown routes and unsupported capabilities fail closed.

## Security and tenant isolation

1. Validate the Supabase session on every protected request; return 401 for missing/invalid/expired tokens and 503 if the auth provider cannot be checked safely.
2. Resolve tenant membership and connection ownership on the server. Reject cross-tenant connection IDs with 403 or a consistent non-enumerating 404 policy.
3. Enforce RLS on persisted user/tenant records. The service must not rely on frontend filtering.
4. Store route maps and credentials only in protected server-side configuration/secrets. No secrets in source, repository variables exposed to the browser, prompts, or logs.
5. Allowlist providers, route names, symbols, and operations. Validate request and response schemas.
6. Apply rate limits, request timeouts, bounded retries for safe reads, and cancellation. Do not retry unsafe side effects.
7. Log correlation ID, authenticated principal/tenant reference, integration type, outcome, latency, and sanitized error category. Never log access tokens, broker credentials, or raw secret-bearing upstream payloads.
8. Keep ordersEnabled=false, executionEnabled=false, and **Live Trading OFF**. The Hub must not expose an order tool or route in v1.

## Failure behavior
- Auth missing/invalid/expired: 401.
- Auth provider unreachable or verification uncertain: 503 (fail closed).
- User authenticated but lacks access: 403 or non-enumerating 404.
- Unknown connection or route: safe 404.
- Upstream timeout/unavailable: 502 or 504, with a sanitized error and correlation ID.
- A health check must not claim an integration is connected merely because a secret or route is configured.
- UI must label simulated/demo/test data clearly and must never infer live connectivity from a green health flag alone.

## Migration plan

### Phase 0 — Inventory (no production changes)
- Inspect Cloudflare Worker names, deployed URLs, bindings, routes, secrets (names only), GitHub workflows, frontend environment variable references, Supabase tables/RLS, and consumers.
- Search the whole repository for voom-alpaca-oauth, NEXT_PUBLIC_ALPACA_WORKER_URL, ALPACA_, OAuth callback paths, and alpaca_oauth_states.
- Identify whether the legacy Worker is still deployed or referenced. Do not print secret values.

### Phase 1 — Implement in parallel
- Add a new integrations/system-hub Worker with typed route contracts, Supabase authentication, tenant ownership checks, read-only provider adapters, structured errors, sanitized observability, and tests.
- Do not reuse Alpaca OAuth code or environment variables.
- Start with status/registry and the existing MT5 read-only adapter. Do not claim MT5 is verified until an actual authorized account/quote request succeeds.

### Phase 2 — Verify
- Unit tests: valid/invalid/expired token, auth provider outage, malformed inputs, unknown route, rate limit, timeout, upstream failure, duplicate read request.
- Tenant tests: user A can read their own connection; user A cannot read user B's connection or route.
- Integration tests: CORS preflight and bearer-token contract; Hub-to-proxy authentication; actual Exness Demo account and quote reads through the external relay.
- Security checks: no secrets in responses/logs, no arbitrary upstream URL, no order routes, Live Trading OFF.
- CI build/typecheck/tests must pass before deploy.

### Phase 3 — Controlled cutover
- Deploy the new Worker under a new name first. Verify health, auth, tenant isolation, and read-only integration end-to-end.
- Update the frontend to the new Hub URL only after tests pass. Keep the MT5 proxy as a separate least-privilege adapter.
- Monitor sanitized errors and rollback by restoring the prior frontend URL/configuration if checks fail.
- Only after repository and Cloudflare consumer inventory is complete may the legacy Alpaca Worker be disabled. Do not delete its migration/table or source until all consumers and retention requirements are reviewed.

## Acceptance criteria
- [ ] Hub name and responsibilities are documented consistently.
- [ ] No production URL or binding is switched before inventory and tests.
- [ ] Every protected request authenticates the Supabase user server-side.
- [ ] Tenant ownership is enforced at the API boundary and tested against cross-user access.
- [ ] Connection state separates configuration from real reachability and verified data.
- [ ] Exness Demo account and market quote have successful, captured test evidence through the real relay.
- [ ] No secrets are returned or logged.
- [ ] No order-submission capability exists; Read-only and Live Trading OFF are preserved.
- [ ] Build, typecheck, tests, and Cloudflare deployment status are linked to the reviewed PR.
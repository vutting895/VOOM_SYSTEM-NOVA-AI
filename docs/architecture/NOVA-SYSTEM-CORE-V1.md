# NOVA System Core v1.0

- Status: implementation contract and architecture baseline; not a production deployment.
- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`.
- Core policy version: `nova-system-core.v1`.
- Control plane: the existing Cloudflare `voom-system-hub`; this design does not create a second gateway or autonomous core Worker.

## 1. Purpose

NOVA System Core is the shared policy and orchestration boundary for NOVA modules. It owns the rules for identity context, tenant authorization, capability selection, adapter routing, workflow approval, data provenance and sanitized observability. It does not replace the specialized services that already implement those responsibilities.

The Core is deterministic. AI models may interpret a request or explain verified results, but they do not establish identity, choose tenant ownership, grant capabilities, read secret values, or authorize financial writes.

## 2. Target architecture

```text
NOVA Web / approved clients
        |
        | Supabase access token (HTTPS)
        v
Existing System Integration Hub  <---- Core policy contract
        |
        +-- Identity: Supabase Auth validation + RLS-scoped principal
        +-- Security: tenant ownership + capability allowlist
        +-- Integration: fixed provider/adapter registry
        +-- Workflow: existing durable approval lifecycle
        +-- Audit: sanitized event + correlation ID
        |
        +--> NOVA AI Worker       (bounded analysis / explanation)
        +--> Remote MCP Worker    (authenticated, bounded tools)
        +--> MT5 read-only path   (Proxy -> Relay -> allocated Bridge)
        +--> Central Data Plane   (validated data / provenance)
        +--> Learning runtimes    (offline research/evaluation)
```

The diagram is a logical ownership map, not proof that every module is currently deployed, connected, or production-ready. Readiness must be reported per adapter using observed evidence.

## 3. Core modules and ownership

| Core domain | Existing owner / implementation boundary | Core responsibility |
|---|---|---|
| Identity Core | Supabase Auth + server-side Hub checks | Establish verified principal; never trust client/model identity claims |
| Security Core | System Hub + RLS + capability policy | Enforce tenant/connection ownership and fail-closed authorization |
| Intelligence Core | NOVA AI Worker | Bounded intent interpretation and analysis; no permission decisions |
| Data Core | Central Data Plane + provider adapters | Schema validation, precision preservation, provenance and freshness |
| Workflow Core | Durable approval lifecycle | Persist reviewable drafts/decisions; approval is not broker execution authority |
| Learning Core | Isolated research/training workflows | Offline evaluation; no automatic promotion to production |
| Integration Core | Existing System Hub registry | Fixed allowlisted adapter routing; no arbitrary URL proxy |
| Observability Core | Hub and worker audit boundaries | Correlation IDs, sanitized errors, health/readiness evidence |

A module must have one accountable owner. Reuse the existing System Hub, AI Worker, Remote MCP Worker, approval lifecycle, data plane and MT5 bridge. Do not introduce duplicate gateways, duplicate tenant maps, or parallel secret stores.

## 4. Request lifecycle

1. Receive a typed intent from an approved client.
2. Validate the Supabase session server-side. If identity cannot be verified, fail closed.
3. Resolve tenant membership and resource ownership from trusted server-side data/RLS.
4. Map the intent to a capability in the versioned allowlist. Unknown capabilities are denied.
5. Resolve a fixed adapter from the server-owned registry. Callers cannot supply upstream URLs or route secrets.
6. Validate request and response schemas, enforce bounded timeouts/rate limits, and preserve provider provenance.
7. For actions requiring review, create a durable approval request. Approval changes only the reviewed workflow state; it does not grant broker execution.
8. Return a truthful result with data freshness, verification state and correlation ID.
9. Record a sanitized audit event. Never record tokens, credentials, secret values or raw secret-bearing payloads.

## 5. Capability policy

The dependency-free reference implementation is `shared/nova-system-core-contract.mjs`. It is a guardrail contract, not a JWT validator, RLS replacement, secret manager or production authorization service.

Allowed v1 capability families:
- System and integration health/registry reads.
- Current-user connection metadata reads.
- Verified market quote/candle and account-summary reads.
- Bounded research analysis and strategy-draft creation.
- Durable approval-request creation.
- Learning/evaluation metadata reads.

Explicitly forbidden:
- Broker order submit/modify/cancel and position close.
- Fund transfer or withdrawal.
- Secret-value read/write/export.
- Arbitrary URL fetch, arbitrary shell, generic proxy or model-selected route.
- Any capability not explicitly allowlisted.

Every protected operation must be enforced again by its owning service. The shared contract does not confer permissions on its own.

## 6. Non-negotiable security invariants

- Supabase session validation on every protected request.
- Server-authoritative tenant and connection ownership; cross-tenant access denied.
- RLS remains enabled and is not replaced by frontend filtering.
- No credentials or secret values in browser state, prompts, model context, API responses, logs or repository files.
- Fixed HTTPS origins, adapter IDs, symbols, timeframes and operation allowlists.
- Unknown fields and unknown capabilities rejected.
- Sanitized audit events with correlation IDs; bounded request size, timeout and rate limits.
- Fail closed on auth-provider outage, missing route, stale/unverified provider data or policy uncertainty.
- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- Zero-new-spend: no paid service, billing enablement, new infrastructure or paid model is introduced by this Core milestone.

## 7. Secret and QR pairing boundary

Secure QR Pairing Phase 1 (PR #204) is a separate pairing protocol that can be consumed by the Core only after its own review and acceptance. Pairing metadata is not secret custody. A QR token is a short-lived, single-use authorization artifact; it must not become a provider credential or a reusable bearer token.

The separate Option C Secret Custody chain (#183 -> #184 -> #193 -> #203) remains independently gated. Do not merge, activate or bypass it through this Core. No real provider credentials are requested, read, stored, decrypted, rotated or deployed by this milestone.

## 8. Readiness model

Do not collapse health into a single green "connected" status. Each adapter reports only states it can prove:

- `not_configured`
- `configured`
- `reachable`
- `authenticated`
- `data_verified`
- `degraded`
- `unavailable`

A process health response proves only that the process is responding. A verified account or quote requires an authenticated owner-scoped request through the real provider path, with freshness and environment evidence.

## 9. Rollout plan

### v1.0 — Contract baseline (this PR)
- Add the shared policy contract and deterministic tests.
- Document module ownership, request lifecycle, security invariants and boundaries.
- Run the contract test in Frontend CI.
- No production route, database schema, secret, Worker binding, provider setting or deployment is changed.

### v1.1 — Hub integration (separate reviewed PR)
- Integrate capability evaluation at the existing System Hub route boundary.
- Map existing endpoints to explicit capability IDs.
- Add route-level identity, tenant, negative capability and sanitized-audit tests.
- Preserve existing APIs and add compatibility tests before any UI switch.

### v1.2 — Module adoption (separate reviewed PRs)
- Adopt the same capability vocabulary in AI Worker, Remote MCP and data-plane adapters.
- Add explicit module health/readiness and provenance reporting.
- Keep research/training and all provider connections isolated by tenant and capability.

### Release gate
No production deploy or migration until exact-head CI passes, security review is complete, owner-isolation tests pass, and the deployed artifact SHA is verified. No PR merge or production change is implied by this architecture PR.

## 10. Acceptance criteria

- [x] One logical System Core; existing System Hub remains the control plane.
- [x] Eight module domains have explicit ownership boundaries.
- [x] Shared capability policy denies unknown, write, secret and arbitrary-proxy operations.
- [x] Missing identity or tenant authorization fails closed.
- [x] Broker execution and Live Trading remain disabled.
- [x] Automated Node contract tests cover positive and negative paths.
- [ ] Exact-head GitHub Actions CI passes.
- [ ] Independent security review and follow-up Hub integration are completed.
- [ ] Production readiness is verified from deployed SHA and authenticated owner-scoped smoke tests.

## 11. Explicit non-goals

This PR does not claim that all modules are deployed or connected. It does not implement a new orchestrator service, customer secret custody, OAuth, QR pairing, broker writes, automatic model promotion, production migrations, or deployment. Those require separate reviewed changes and evidence.

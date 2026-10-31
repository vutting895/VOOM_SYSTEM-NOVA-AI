# NOVA Dashboard Auto-Resolve Architecture

**Status:** implementation foundation; staging/production activation gated  
**Owner surface:** the single NOVA Main Dashboard and its authenticated workspaces  
**Architecture:** Netlify frontend, Cloudflare Workers backend, Supabase Auth/RLS  
**Safety baseline:** read-only + AI analysis; order submission OFF; Live Trading OFF

## Goal

Detect user-visible failures while a user is working, diagnose them with bounded and sanitized context, automatically recover only from explicitly allowlisted low-risk failures, verify recovery, and route unresolved or consequential incidents to a human with a correlation ID.

This is not an unrestricted self-modifying agent. AI may explain and recommend; deterministic backend policy authorizes every operation.

## Runtime flow

1. **Detect:** App Router error boundaries and instrumented service calls identify route, component, and request failures.
2. **Correlate:** Create a random incident ID. Keep only route template, component key, allowlisted error code, timestamp, attempt count, and recovery outcome.
3. **Diagnose:** Resolve service status through the existing System Integration Hub. Do not infer broker connectivity from UI state.
4. **Classify:** Apply deterministic rules by error code, HTTP status, operation type, and tenant authorization result.
5. **Resolve:** Execute only a named, bounded playbook. The initial frontend playbooks are route retry/reset and safe GET retry. Never retry writes automatically.
6. **Verify:** Re-run the same safe read or component render once. A successful HTTP response is not proof of business-level correctness.
7. **Escalate:** If verification fails, show a support reference and preserve the user’s ability to continue in unaffected modules.
8. **Learn:** Add only redacted incident category, playbook version, and outcome to a future tenant-safe knowledge store. Do not train on raw customer payloads.

## Initial recovery policy

| Class | Example | Automatic action | Limit |
|---|---|---|---|
| Safe transient read | GET/HEAD 408, 429, 502, 503, 504 | Retry with exponential backoff, jitter and Retry-After | 2 retries; 10s total default deadline |
| Route render error | React/Next route exception | Show isolated recovery screen; user-triggered reset | One reset at a time |
| Stale UI state | Component has an explicit safe refresh callback | Reset that component only | One recovery attempt |
| Session expired | 401 | Stop requests; direct user to re-authenticate | No token fabrication or retry loop |
| Authorization / tenant denial | 403 / non-enumerating 404 | Fail closed and explain access boundary | Never bypass or switch identity |
| Missing tenant route | Broker bridge not provisioned | Explain pending provisioning and open support incident | Never allocate or borrow a route |
| Security signal | Origin, signature, RLS, tenant guard failure | Stop affected operation and escalate | No automated mutation |
| Unknown / write failure | Any mutation with uncertain result | Do not retry; reconcile with server or human | No automatic replay |

## Frontend contract

- frontend/lib/nova-diagnostics.js creates correlation IDs and sanitizes diagnostics without collecting raw error messages, stack traces, query strings, tokens, or account data.
- frontend/lib/nova-safe-fetch.js retries only GET/HEAD transient failures. Callers must opt in; mutation methods are never retried.
- frontend/app/error.jsx isolates route failures and offers a controlled reset.
- frontend/app/global-error.jsx provides the root-layout fallback.
- Existing shared navigation and dashboard layout remain the single navigation owner.

## Backend contract (next implementation gate)

Add an authenticated diagnostics endpoint to the System Hub only after its schema, rate limits, abuse controls, RLS, and retention policy are reviewed. It must:
- validate Supabase user sessions server-side;
- derive user/tenant identity from the validated session, never from client-supplied IDs;
- accept a strict allowlist of incident fields and bounded payload sizes;
- redact or reject tokens, secrets, account IDs, email addresses, raw URLs and free-form payloads;
- apply per-user and per-tenant rate limits;
- store incidents under owner-scoped RLS and expose only the owner’s incidents;
- return an opaque incident reference, not internal diagnostics;
- never expose a remediation endpoint that accepts arbitrary code, URL, SQL, shell command, or tool name.

## Tenant isolation and privacy

- Every incident is scoped from the verified Supabase session at the backend.
- Cross-user incident lookup returns non-enumerating 404.
- Frontend telemetry is minimized and does not include request bodies, response bodies, cookies, authorization headers, broker account identifiers, or secret values.
- Support staff access must be audited and separately authorized.
- Retention, deletion, consent and PDPA notices must be defined before durable telemetry is enabled.

## Approval tiers

- **L0 automatic:** bounded GET retry, route reset, local widget reload.
- **L1 approval / user confirmation:** re-authentication, reconnect request, changing user preferences.
- **L2 human-only:** permissions, tenant routing, secret rotation, data deletion, provider configuration, billing, broker account changes.
- **Prohibited:** order submission, live trading activation, arbitrary model-generated code execution, cross-tenant repair.

## Observability and resilience requirements

- Correlation IDs must flow from browser to Hub and downstream services where supported.
- Use structured error codes, bounded retries, jitter, request deadlines, circuit breakers and per-service concurrency limits.
- Avoid retry storms: honor Retry-After, stop after deadline, and open a circuit after repeated upstream failures.
- A playbook is successful only after a relevant verification read succeeds.
- Add a kill switch for all automated recovery and separate switches per playbook.
- Recovery failures must not block unaffected dashboard workspaces.

## Acceptance criteria

- [x] Sanitized client correlation IDs and error classification foundation.
- [x] Route-level and root-level fallback UI with controlled reset.
- [x] GET/HEAD-only bounded retry helper with Retry-After support.
- [x] Tests cover sanitization, retry allowlist, retry bounds and mutation non-retry.
- [ ] Authenticated System Hub incident ingestion, owner-scoped storage and RLS tests.
- [ ] Staging integration tests for owner access, foreign-user denial and rate limits.
- [ ] Instrument key Dashboard/Hub calls and verify correlation propagation.
- [ ] Netlify Preview, Frontend CI and responsive/accessibility review on exact PR head.
- [ ] Explicit approval before any production activation.

## Delivery rule

This PR implements the safe frontend foundation and architecture contract only. It does not claim durable incident storage, complete application-wide instrumentation, staging verification, or production activation. Keep the feature gated until all unchecked acceptance criteria are evidenced.

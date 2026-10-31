# NOVA CODE AI — External API Integration

**Consumer:** Voom studio ai (Base44)  
**App ID:** `6ae5de7da764c8825610ef62`  
**Allowed browser origin:** `https://voom-studio-ai.base44.app`  
**API host:** `https://voomsystem.netlify.app` (production commit must be verified before use)

## Current API contract

All responses are JSON and use `Cache-Control: no-store`.

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| GET | `/api/code/agents` | Public metadata | List six NOVA CODE AI agents |
| GET | `/api/code/skills` | Public metadata | List Video, Affiliate, API and Social Media skills |
| POST | `/api/code/requests` | Supabase JWT or Base44 server-to-server Bearer token + App ID header | Validate an agent request; returns 503 until a reviewed runtime is enabled |

The registry endpoints disclose capability metadata only. They do not expose source code, repository data, customer information or secrets.

## CORS

The exact Base44 published origin is allowlisted in the code CORS helper. CORS is not authentication. Do not use wildcard origins or credentialed cookies. The existing Supabase user-session path remains supported. Base44's access token is not a Supabase JWT and must never be sent as one.\n\nFor the Base44 server-side adapter only, NOVA accepts `Authorization: Bearer <NOVA_CODE_BASE44_SERVICE_TOKEN>` and `X-NOVA-Client-App-Id: 6ae5de7da764c8825610ef62`. NOVA verifies the exact App ID and compares the configured token using a constant-time digest comparison. The tenant identity is read only from `NOVA_CODE_BASE44_TENANT_ID` in the server environment; caller-supplied tenant IDs are not trusted. Missing token or tenant configuration fails closed with 503; invalid credentials return 401; an unapproved App ID returns 403.\n\nConfigure `NOVA_CODE_BASE44_SERVICE_TOKEN` (random secret, at least 32 characters) and `NOVA_CODE_BASE44_TENANT_ID` in the NOVA server environment. Never place either value in browser JavaScript, Git, public build variables or chat.

## Request example

```http
POST /api/code/requests
Authorization: Bearer <NOVA_CODE_BASE44_SERVICE_TOKEN>\nX-NOVA-Client-App-Id: 6ae5de7da764c8825610ef62
Content-Type: application/json
Origin: https://voom-studio-ai.base44.app
```

```json
{
  "agent_id": "code_reviewer",
  "task": "Review the current feature branch for auth and tenant isolation regressions.",
  "repository": "vutting895/VOOM_SYSTEM-NOVA-AI",
  "base_ref": "main",
  "idempotency_key": "review-20261031-0001"
}
```

Until the agent runtime, tenant-scoped durable job store, and approval lifecycle are reviewed and deployed, this endpoint returns `503 nova_code_agent_runtime_not_enabled`. It never runs code or starts a model.

## Base44 integration requirements

1. Call GET `/api/code/agents` and GET `/api/code/skills` from a Base44 backend function or server-side integration; do not embed service credentials in browser code.
2. Store the service token only in a Base44 server-side secret store; never expose it to the browser.\n3. Keep the tenant mapping server-side and provision a distinct tenant identity before allowing another app/customer.

4. Keep repository writes, test execution, secret access and deployments disabled until each action has explicit scopes and human approval.
5. Production activation requires exact-head CI, independent security review, tenant isolation tests and explicit release approval.

## Cost and safety policy

- Free-only. Paid APIs, paid GPU, trial credits and automatic billing are prohibited.
- All 46 skills and all six agents are metadata-only; `executionEnabled=false`, `estimatedCost=0`.
- No arbitrary shell execution, repository writes, code execution, deployment, or model inference is enabled by this registry release.

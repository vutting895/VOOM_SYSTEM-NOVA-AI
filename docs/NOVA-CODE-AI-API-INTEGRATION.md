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
| POST | `/api/code/requests` | Supabase Bearer token | Validate a proposed agent request; returns 503 until a reviewed runtime is enabled |

The registry endpoints disclose capability metadata only. They do not expose source code, repository data, customer information or secrets.

## CORS

The exact Base44 published origin is allowlisted in the code CORS helper. CORS is not authentication. Do not use wildcard origins or credentialed cookies. The request API still requires a valid Supabase access token; a Base44 session token is not interchangeable with a Supabase JWT.

## Request example

```http
POST /api/code/requests
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
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
2. Do not send the Base44 access token as a Supabase Bearer token.
3. Before enabling POST requests, provision a supported service-to-service identity mapped to the Base44 app tenant, or integrate a verified Supabase Auth session. Do not share a user's token across tenants.
4. Keep repository writes, test execution, secret access and deployments disabled until each action has explicit scopes and human approval.
5. Production activation requires exact-head CI, independent security review, tenant isolation tests and explicit release approval.

## Cost and safety policy

- Free-only. Paid APIs, paid GPU, trial credits and automatic billing are prohibited.
- All 46 skills and all six agents are metadata-only; `executionEnabled=false`, `estimatedCost=0`.
- No arbitrary shell execution, repository writes, code execution, deployment, or model inference is enabled by this registry release.

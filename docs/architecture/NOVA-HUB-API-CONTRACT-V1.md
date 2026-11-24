# NOVA Hub API Contract — Gateway Integration

Contract version: `v1`  
Status: Canonical target contract for the Central MCP Gateway migration. Route additions and implementation must be tested before the Gateway is switched over.

## Boundary

The only production MCP endpoint is the NOVA MCP Gateway (`voom-system-mcp`). The Gateway calls the NOVA System Integration Hub (`voom-system-hub`) using this versioned service API. Provider/compute Workers are adapters behind the Hub and must not implement MCP.

Base path: `/v1`  
Required headers for protected calls:

- `Authorization: Bearer <Supabase access token>`
- `Accept: application/json`
- `Content-Type: application/json` for requests with a body
- `X-NOVA-Contract-Version: 1`
- `X-NOVA-Request-ID: <UUID>` (Gateway-generated; Hub validates and echoes it)

The Hub must independently validate the bearer token with Supabase Auth, derive the user identity from the validated session, and apply tenant/connection authorization. The Gateway must not send a trusted tenant ID or user ID as an authorization claim.

## Canonical response envelope

Success:

```json
{
  "ok": true,
  "contractVersion": "1",
  "requestId": "uuid",
  "data": {}
}
```

Failure:

```json
{
  "ok": false,
  "contractVersion": "1",
  "requestId": "uuid",
  "error": {
    "code": "stable_machine_code",
    "message": "Sanitized, non-secret description",
    "retryable": false
  }
}
```

No raw upstream body, stack trace, bearer token, credential, or secret reference may be returned.

## Route families

| Route | Method | Purpose | Authorization |
|---|---|---|---|
| `/v1/gateway/capabilities` | GET | Hub capability registry for Gateway startup/discovery | Authenticated |
| `/v1/gateway/tools/{toolName}` | POST | Execute one allowlisted tool operation | Authenticated + tool scope + tenant ownership |
| `/v1/integrations` | GET | Integration and adapter status | Authenticated |
| `/v1/connections` | GET | Current user's own connection inventory | Authenticated + RLS |
| `/v1/connections/{connectionId}/status` | GET | Ownership-checked connection status | Authenticated + owner |
| `/v1/connections/{connectionId}/check` | POST | Bounded read-only reachability probe | Authenticated + owner |
| `/v1/connections/{connectionId}/account` | GET | Read-only account summary | Authenticated + owner + connected route |
| `/v1/connections/{connectionId}/quotes` | GET | Bounded market data | Authenticated + owner + symbol/timeframe allowlist |

The gateway tool execution route is a typed dispatch surface, not a generic proxy. The Hub maps each approved tool name to a fixed handler. Unknown tool names, methods, providers, symbols, or capabilities fail closed.

## Tool registration

Each Gateway tool must have a Hub capability record with:

- stable tool name and contract version;
- input JSON schema and maximum serialized size;
- fixed Hub handler identifier (never a URL);
- required scope and tenant/connection ownership rule;
- allowed provider/environment and operation;
- timeout and rate-limit policy;
- response schema and data classification;
- explicit `readOnly` flag;
- audit event name.

A tool is callable only when both Gateway registration and Hub capability policy permit it. A Gateway-only tool definition is not authorization.

## Standard error mapping

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Schema or contract validation failed |
| 401 | `authentication_required` / `invalid_session` | Missing, invalid, or expired session |
| 403 | `capability_denied` / `tenant_access_denied` | Authenticated caller lacks permission |
| 404 | `resource_not_found` | Unknown route/tool/resource or non-enumerating ownership denial |
| 409 | `connection_not_ready` | Connection exists but adapter/bridge is not provisioned |
| 429 | `rate_limited` | Request budget exceeded |
| 502 | `adapter_unavailable` | Upstream adapter failed or returned invalid data |
| 503 | `auth_or_dependency_unavailable` | Authorization/dependency state cannot be verified safely |
| 504 | `upstream_timeout` | Bounded adapter request timed out |

## Operational constraints

- Use fixed service bindings or fixed allowlisted HTTPS origins. Do not accept arbitrary upstream URLs.
- Do not automatically forward Authorization across redirects.
- Bound request/response bytes, list sizes, candle counts, and execution time.
- Retry only idempotent reads, with a small bounded retry budget.
- Generate/validate correlation IDs and emit sanitized audit metadata.
- Never log request bodies by default. Redact token-like strings and provider secrets.
- Do not expose service-role credentials to Gateway, browser, or model context.
- Keep order execution, broker writes, transfers, and withdrawals absent from this contract.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.

## Compatibility and implementation rule

The currently deployed Hub already implements a subset of `/v1/integrations` and `/v1/connections`. The Gateway currently contains direct Supabase and provider-read logic. This contract does not imply that the new `/v1/gateway/*` routes exist yet.

Implement Hub routes and contract tests first. Only then migrate Gateway handlers to call them. Do not point production clients at unimplemented routes or remove current working handlers before parity tests pass.

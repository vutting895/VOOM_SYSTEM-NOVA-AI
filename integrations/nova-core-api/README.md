# NOVA Core API — read-only foundation

This Worker is a new, isolated API boundary. It is not deployed and is not yet connected to the NOVA UI or VOOM AI clients.

## Implemented in this first slice

- `GET /v1/health`: public process/configuration status. The Supabase flag means configuration is present; it does not prove Supabase is reachable.
- `GET /v1/me`: authenticated identity and NOVA role.
- All other paths return 404 until a route has a verified source of truth and tests.
- Only `app_metadata.nova_role` is trusted. Allowed roles are `admin`, `operator`, and `viewer`; missing or unknown roles fail closed.
- Supabase Auth is called server-side at `/auth/v1/user`. Redirects are rejected to prevent forwarding bearer tokens.
- Browser origins are allowlisted through `ALLOWED_ORIGINS`.
- Only GET and CORS preflight are accepted. No broker writes, order routes, execution routes, or trading activation exist.

## Runtime configuration

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `ALLOWED_ORIGINS` in the Worker environment. Use the public publishable key only. Never configure a Supabase service-role key or broker credentials in this Worker.

## Local verification

Requires Node.js 22 or newer:

```sh
npm test
```

Tests stub Supabase Auth. They do not prove production Supabase connectivity.

## Deliberate gaps

The following contract routes are not implemented in this first slice: services, bridge status/account, risk policy, approvals, audit, and assistant status. They must not return fabricated or inferred status. Each requires a reviewed data source, tenant/role policy, response schema, and integration tests before implementation.

No deployment workflow is added here. Deploy only after local tests, CI, runtime configuration review, and explicit approval.

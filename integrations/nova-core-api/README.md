# NOVA Core API — read-only foundation

This Worker is an isolated API boundary. It is not deployed and is not connected to the NOVA UI or VOOM AI clients.

## Implemented
- Public `GET /v1/health` matching the documented contract: status, version, timestamp, and explicit trading/broker-write false flags.
- Authenticated `GET /v1/me` matching the documented identity/role contract.
- JWT verification against Supabase JWKS using `jose`; verifies signature, issuer, expiration, and `aud=authenticated`.
- Only `app_metadata.nova_role` is trusted. Allowed roles are admin, operator, and viewer; missing/unknown roles fail closed.
- GET-only enforcement, allowlisted browser origins, no-store/security headers.
- No order, execution, broker-write, deposit, withdrawal, or transfer routes.

## Runtime configuration
Set `SUPABASE_URL` and comma-separated `ALLOWED_ORIGINS` in the Worker environment. JWKS is fetched from `/auth/v1/.well-known/jwks.json` on the configured HTTPS Supabase origin. Never configure a service-role key or broker credentials in this Worker.

## Local verification
Requires Node.js 22 or newer:

```sh
npm install
npm test
```

Tests generate a local RSA signing key and mock the Supabase JWKS response. They verify JWT signature, issuer/audience enforcement, role claim source, and read-only route restrictions. They do not prove production Supabase connectivity.

## Deliberate gaps
The contract routes for services, bridge status/account, risk policy, approvals, audit, and assistant status are not implemented. Each requires a verified authoritative data source, tenant/role policy, response schema, and integration tests before implementation.

No deployment workflow is added. Deploy only after CI, runtime configuration/security review, and explicit approval.

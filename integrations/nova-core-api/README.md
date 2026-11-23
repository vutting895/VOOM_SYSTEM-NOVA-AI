# NOVA Core API — read-only foundation

This Worker is an isolated API boundary. A staging deployment is live for verification; it is not yet connected to the NOVA Command Center frontend or VOOM AI clients.

## Staging endpoint

- Worker: `nova-core-api-staging`
- Base URL: `https://nova-core-api-staging.suwapat787.workers.dev`
- Health: `GET /v1/health`
- Identity: `GET /v1/me` (requires a Supabase access token)
- Allowed browser origin: `https://voomsystem.netlify.app`
- Supabase project: `rovhmjeowracayicbqij`
- The staging Worker is isolated from existing production Workers and has no custom production route.

## Implemented

- Public `GET /v1/health` checks bounded Supabase JWKS reachability and reports `degraded` when the auth dependency is unavailable; it also returns version, timestamp, and explicit trading/broker-write false flags.
- Authenticated `GET /v1/me` matching the documented identity/role contract.
- JWT verification with native Web Crypto against Supabase JWKS; verifies RS256/ES256 signature, issuer, expiration, not-before, and `aud=authenticated`.
- Only `app_metadata.nova_role` is trusted. Allowed roles are admin, operator, and viewer; missing/unknown roles fail closed.
- JWKS response body capped at 64 KiB, 5-minute cache, 8-second timeout, and manual redirect handling (redirects are not followed).
- GET-only enforcement, allowlisted browser origins, no-store/security headers.
- No order, execution, broker-write, deposit, withdrawal, or transfer routes.

## Runtime configuration

Set `SUPABASE_URL` and comma-separated `ALLOWED_ORIGINS` in the Worker environment. JWKS is fetched from `/auth/v1/.well-known/jwks.json` on the configured HTTPS Supabase origin. This Worker does not need a service-role key, publishable key, or broker credentials. Never configure service-role keys or broker credentials in this Worker.

## Local verification

Requires Node.js 22 or newer:

```sh
npm install
npm test
```

Tests generate local RSA and EC signing keys and mock the Supabase JWKS response. They verify both JWT algorithms, issuer/audience enforcement, role claim source, bounded JWKS reads, redirect rejection, and read-only route restrictions. The local tests do not replace verification with a real user's access token.

## Not yet connected / remaining gates

- The existing Netlify `voomsystem` site builds the repository root application, not `apps/nova-command-center`; its current Supabase environment values point to a different project. Do not change its production variables to connect the Command Center.
- The existing Cloudflare `voom-system-nova-ui` Worker is a separate OpenNext application, not this Command Center build. Do not overwrite it.
- The Command Center frontend must be deployed as its own preview/site and configured with `VITE_NOVA_API_BASE_URL` before claiming UI integration.
- A real authenticated `/v1/me` request still requires a valid user's Supabase session token; no session token was available to this deployment test.
- Contract routes for services, bridge status/account, risk policy, approvals, audit, and assistant status are not implemented. Each requires a verified authoritative data source, tenant/role policy, response schema, and integration tests.

No production deployment or merge is authorized by this staging deployment. Keep the PR Draft until CircleCI failure logs are reviewed, frontend target is established, runtime/security gates pass, and explicit production approval is given.

# NOVA Core Read-only API Worker

Implements the read-only `/v1/*` contract in `apps/nova-command-center/docs/worker-api-contract.md`.

## Security
- Verifies Supabase access-token signatures against the canonical project's JWKS.
- Requires the canonical issuer, `aud=authenticated`, valid expiry, and trusted `app_metadata.nova_role`.
- Roles are `viewer`, `operator`, and `admin`; missing or unknown roles fail closed.
- Only GET and CORS preflight are accepted. No order, execution, position mutation, withdrawal, transfer, or deposit routes exist.
- Uses a publishable key only for user-scoped PostgREST reads. No service-role key or broker credential is required.
- Trading and broker writes remain disabled.

## Production database
The owner-scoped `nova` schema has already been applied to canonical Supabase project `rovhmjeowracayicbqij` through migrations:
- `20261123120144_nova_core_owner_scoped_schema`
- `20261123120159_nova_core_owner_fk_indexes`

Tables have RLS enabled; authenticated users have SELECT-only grants; anon has no table access. This does not by itself prove that `nova` is included in the project's Data API exposed-schema setting.

## Configure
Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the exact approved `ALLOWED_ORIGIN`. Optional `ASSISTANT_PROVIDER` and `ASSISTANT_MODEL` are informational only.

## Deployment gates — NOT CLEARED
Do not deploy until all of the following are verified:
1. `nova` is enabled in Supabase Data API exposed schemas.
2. The active Supabase Auth signing algorithm and JWKS key type are compatible with the verifier (`ES256` or `RS256`).
3. The exact production frontend origin is confirmed and set as `ALLOWED_ORIGIN`.
4. CI and authenticated API smoke tests pass using a controlled test account.
5. Worker bindings are configured without service-role or broker credentials.

## Deliberate limitations
- Bridge status remains disconnected until a verified tenant-scoped heartbeat integration is implemented.
- Bridge account and risk policy return explicit 503 source-not-configured errors.
- Approvals and audit query the `nova` PostgREST schema and return an error if the schema is unavailable; they never fabricate empty results.
- Health reports degraded until downstream sources are integrated.

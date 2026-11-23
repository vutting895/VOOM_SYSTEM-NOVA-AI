# NOVA Core Read-only API Worker

Implements the read-only /v1/* contract in apps/nova-command-center/docs/worker-api-contract.md.

## Security
- Verifies Supabase JWT signatures against the canonical project's JWKS.
- Requires the canonical issuer, aud=authenticated, valid expiry, and trusted app_metadata.nova_role.
- Roles are viewer, operator, and admin; missing or unknown roles fail closed.
- Only GET and CORS preflight are accepted. No order, execution, position mutation, withdrawal, transfer, or deposit routes exist.
- Uses a publishable key only for user-scoped PostgREST reads. No service-role key or broker credential is required.

## Configure
Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and the exact approved ALLOWED_ORIGIN. Optional ASSISTANT_PROVIDER and ASSISTANT_MODEL are informational only. No secrets are required for this read-only API.

Do not deploy until the draft NOVA schema migration has been reviewed and applied through a separate approved database migration process, and the production frontend origin has been confirmed.

## Deliberate limitations
- Bridge status remains disconnected until a verified tenant-scoped heartbeat integration is implemented.
- Bridge account and risk policy return explicit 503 source-not-configured errors.
- Approvals and audit query the nova PostgREST schema and return an error if the schema is unavailable; they never fabricate empty results.
- Health reports degraded until downstream sources are integrated. Trading and broker writes remain disabled.

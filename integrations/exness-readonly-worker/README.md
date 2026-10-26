# Exness Read-only Adapter (NOVA)

This is a fail-closed first-stage adapter for the VOOM_SYSTEM Broker Hub. It does **not** claim an Exness connection and it has no order-placement endpoints.

## Current behavior

- `GET /health`: reports service mode and that API access still needs user verification.
- `GET /api/exness/status`: requires a valid Supabase user access token and reports only whether server-side configuration variables are present.
- `GET /api/exness/account`: intentionally returns HTTP 501 until the account's Exness API eligibility, official authentication/signing procedure, and read-only account endpoint are verified against the official developer documentation.
- All other methods are rejected. No order, trade, withdrawal, or mutation endpoint exists.
- Live trading and order endpoints are hard-coded off.

## Cloudflare Worker configuration

Set these in the Worker environment (never in GitHub, the frontend, or chat):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `EXNESS_API_BASE_URL` (only after confirming the official host for this account/API product)
- `EXNESS_API_KEY`
- `EXNESS_API_SECRET`
- `ALLOWED_ORIGINS` (optional comma-separated exact origins)

Do not configure Exness variables until API access is confirmed in the Exness Personal Area. Do not put credentials in Vercel `NEXT_PUBLIC_*` variables.

## Verification sequence

1. Confirm the API menu and eligibility for the user's Exness MT5 account in the Exness Personal Area.
2. Confirm the API product and official authentication/signing scheme in the Exness Developer Portal.
3. Configure credentials as Cloudflare Worker secrets only.
4. Implement one documented read-only account-details request and test it against the authorized account.
5. Keep Demo/Paper validation as a separate stage. This adapter does not execute any orders.

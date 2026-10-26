# Exness Read-only Adapter (NOVA)

This is a fail-closed first-stage adapter for the VOOM_SYSTEM Broker Hub. It does **not** claim an Exness connection and it has no order-placement endpoints.

## Current behavior

- `GET /health`: reports service mode and that API access still needs user verification.
- `GET /api/exness/status`: requires a valid Supabase user access token and reports only whether server-side configuration variables are present.
- `GET /api/exness/account`: makes one signed `GET /v1/configuration/accounts/{account_id}/account` request and returns a limited, sanitized account summary. This endpoint never sends a trading request.
- All other methods are rejected. No order, trade, withdrawal, or mutation endpoint exists.
- Live trading and order endpoints are hard-coded off.

## Cloudflare Worker configuration

Set these in the Worker environment (never in GitHub, the frontend, or chat):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `EXN_API_BASE_URL` (copy the exact HTTPS host shown by Exness Key Management / DNS host widget; do not guess it)
- `EXN_API_KEY`
- `EXN_PRIVATE_KEY` (PKCS#8 PEM Ed25519 private key; current adapter expects this format)
- `ALLOWED_ORIGINS` (optional comma-separated exact origins)

Create an **Info/read-only key** in Key Management, if the UI offers this key type; grant only account-information/read scopes. Do not enable trading, order, or payment/transfer scopes. Copy the exact account-specific API host shown by Exness. Configure these values as Worker secrets/vars only, never in GitHub, Vercel, frontend variables, or chat. If the key setup flow provides an Exness-generated private key in a format other than PKCS#8 PEM, stop and adapt the parser to the official format rather than pasting or converting the secret in chat. Do not put credentials in Vercel `NEXT_PUBLIC_*` variables.

## Verification sequence

1. Confirm the API menu and eligibility for the user's Exness MT5 account in the Exness Personal Area.
2. Confirm the API product and official authentication/signing scheme in the Exness Developer Portal.
3. Configure credentials as Cloudflare Worker secrets only.
4. Implement one documented read-only account-details request and test it against the authorized account.
5. Keep Demo/Paper validation as a separate stage. This adapter does not execute any orders.

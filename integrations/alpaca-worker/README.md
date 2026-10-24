# VOOM_SYSTEM — Alpaca OAuth (Paper Trading)

This is a focused integration scaffold for the private repository `vutting895/VOOM_SYSTEM-NOVA-AI`. It adds a Cloudflare Worker OAuth backend, a Supabase migration, and a React component. It does not modify or replace the rest of the application.

## What it implements

- Supabase Auth bearer-token verification on connect/account/disconnect endpoints.
- Alpaca OAuth authorization URL with `env=paper`; callback exchanges the temporary code on the server.
- Random OAuth `state`, SHA-256 state hashing, 10-minute expiry, and one-time atomic consumption via SQL RPC.
- Access token encrypted using AES-256-GCM before storage in Supabase.
- Paper account read-only summary endpoint.
- Disconnect deletes the stored connection. For a full OAuth revocation, implement the provider's supported revocation flow if available for your approved app.
- No order placement endpoint is included.

## Prerequisites

1. A Supabase project with Supabase Auth enabled.
2. A Cloudflare account with Workers and Wrangler access.
3. An Alpaca account and an OAuth app registered in Alpaca's developer dashboard. OAuth apps may require review/approval before trading scopes are enabled.
4. A frontend already using Supabase Auth.

## OAuth redirect URI

Choose the final Worker URL first, for example:

`https://voom-alpaca-oauth.<your-subdomain>.workers.dev/api/alpaca/callback`

Register that exact URI in the Alpaca OAuth app. It must exactly match `ALPACA_REDIRECT_URI` and the URI sent during authorization/token exchange. For local development, register a separate local redirect URI if Alpaca permits it for your app.

Alpaca's OAuth token exchange endpoint is `https://api.alpaca.markets/oauth/token`; after authorization with `env=paper`, this Worker calls the paper trading API at `https://paper-api.alpaca.markets`. Verify the current OAuth app settings and endpoint behavior in the official Alpaca docs before production.

## 1. Apply the Supabase migration

Run `supabase/migrations/202610240001_alpaca_oauth.sql` in the Supabase SQL Editor or through your existing migration workflow. Confirm both tables exist. The tables have RLS enabled and intentionally have no client policies; only the Worker service-role credential accesses them.

## 2. Configure Cloudflare Worker secrets

From `integrations/alpaca-worker`:

```bash
npm init -y
npm install --save-dev wrangler typescript
npx wrangler login
npx wrangler secret put ALPACA_CLIENT_ID
npx wrangler secret put ALPACA_CLIENT_SECRET
npx wrangler secret put ALPACA_REDIRECT_URI
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ALPACA_TOKEN_ENCRYPTION_KEY
npx wrangler secret put FRONTEND_ORIGIN
```

When prompted, paste each value. Do not put secret values into `wrangler.toml`, frontend environment variables, screenshots, chat, or Git. Set `FRONTEND_ORIGIN` to the exact origin only, such as `https://your-site.example` (no path or trailing slash).

Generate the AES-256 key locally with:

```bash
openssl rand -base64 32
```

Keep a secure backup of the encryption key. If it is lost, saved tokens cannot be decrypted. Rotate it with a planned re-encryption migration, not by simply replacing the key.

For local development, copy `.env.example` to `.dev.vars`, fill it locally, and never commit `.dev.vars`.

## 3. Configure and deploy

The repository does not yet contain a root package manager configuration or a full existing frontend app. Install dependencies in this integration directory, then run:

```bash
npx wrangler deploy
```

The first deployment creates the Worker URL. If the URL differs from the one registered with Alpaca, update the redirect URI in both places and redeploy.

## 4. Connect the frontend

Copy `frontend/AlpacaConnect.tsx` into your React app. Pass the existing Supabase client and Worker base URL:

```tsx
<AlpacaConnect
  supabase={supabase}
  apiBaseUrl={import.meta.env.VITE_ALPACA_WORKER_URL}
/>
```

Only the public Worker URL belongs in frontend config. Do not expose Alpaca client secret, Supabase service-role key, or token encryption key.

## 5. Test checklist

1. Sign in to VOOM_SYSTEM with Supabase Auth.
2. Click **เชื่อมบัญชี Alpaca (Paper)** and verify the Alpaca consent page says Paper.
3. Approve; confirm the browser returns to `/settings/broker?alpaca=connected`.
4. Verify the account summary endpoint returns only account status/cash/equity summary.
5. Verify unauthenticated calls return 401 and another website origin is rejected.
6. Verify the browser Supabase client cannot select either OAuth table.
7. Verify no tokens, authorization codes, or secrets appear in logs.
8. Confirm no live trading or order-placement endpoint is exposed.

## Important limitations / before production

- Alpaca must approve/register the OAuth app and the redirect URI.
- The app's existing frontend router must serve `/settings/broker`; adjust `safeFrontendUrl` if your route differs.
- This integration uses Supabase service-role access only from the Worker. Keep the service-role key private.
- Add rate limiting, monitoring/alerting, and an operational token/key rotation process before production.
- The callback stores the encrypted access token; this scaffold does not implement refresh-token handling because the OAuth grant behavior must be confirmed for the specific Alpaca app.
- Trading permissions are requested as `trading data`, but this scaffold exposes account summary only. No orders can be placed through these endpoints.
- Do not switch to live trading without a separate explicit design review and safety controls.

## Official references

- Alpaca OAuth: https://docs.alpaca.markets/us/docs/using-oauth2-and-trading-api
- Cloudflare Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare + Supabase: https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/

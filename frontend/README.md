# NOVA Frontend — Netlify

This folder contains the customer-facing Next.js App Router frontend for VOOM_SYSTEM-NOVA-AI.

## Hosting boundary

- **Frontend:** Netlify — https://voomsystem.netlify.app/
- **Backend:** Cloudflare Workers/APIs only.
- **Auth and data:** Supabase.
- **Broker:** Exness Demo through the authenticated System Hub and tenant-scoped MT5 read-only proxy.
- **Safety:** Read-only + AI Analysis. Live Trading and order submission must remain disabled.

The production build configuration is in the repository-root `netlify.toml`. It sets this folder as the Netlify base directory and runs `npm run build`. Netlify's Next.js runtime handles App Router rendering. Do not deploy this customer-facing UI through the Cloudflare backend deployment workflow.

## Required Netlify environment variables

Configure these in the Netlify site settings for the production and Deploy Preview contexts as appropriate. Do not commit values, print secrets in logs, or paste secret values into pull requests.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key used by the browser client |
| `NEXT_PUBLIC_SYSTEM_HUB_URL` | Cloudflare System Hub base URL; defaults in the app to `https://voom-system-hub.suwapat787.workers.dev` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key used by the login flow |

These are required deployment configuration, not proof of a successful login. Never place Supabase service-role keys, broker passwords, bridge tokens, or Cloudflare API tokens in `NEXT_PUBLIC_*` variables.

## Local checks

Run from this folder:

```sh
npm ci
npm run typecheck
npm run build
```

The `cf:build`, `cf:preview`, `cf:deploy`, and `cf:typegen` scripts in `package.json` are legacy/alternate Cloudflare OpenNext tooling; they are not the production frontend deployment path.

## Frontend-to-backend contract

- The browser signs in through Supabase and sends the signed-in user's access token to the System Hub.
- The System Hub validates the session and scopes connection records to the authenticated user. It is the control plane; the browser must not bypass it to call the MT5 Proxy directly.
- CORS must allow the exact production origin `https://voomsystem.netlify.app`; do not use a wildcard origin for authenticated requests.
- A healthy Cloudflare Worker does not prove that the frontend, Supabase login, tenant authorization, MT5 bridge, or broker terminal is healthy.

## Deployment verification checklist

- [ ] Netlify is connected to `vutting895/VOOM_SYSTEM-NOVA-AI` and deploys the intended branch.
- [ ] Netlify base directory is `frontend`; build command is `npm run build`.
- [ ] Required public environment variables are present in the correct Netlify contexts.
- [ ] Deploy Preview succeeds for the latest reviewed commit.
- [ ] Production `/`, `/login`, and `/settings/broker` routes return HTTP 200.
- [ ] A real Supabase session can log in and reach only its own connection records.
- [ ] MT5 account/quotes read is verified through the tenant-scoped read-only path.
- [ ] Live Trading and order submission remain disabled.

**Current status:** This file documents the intended deployment contract. It does not assert that Netlify is currently healthy. The latest Deploy Preview was reported as failed, and the cause must be checked in the Netlify build log before marking the frontend ready.

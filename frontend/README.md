# NOVA Frontend — Netlify

This folder contains the customer-facing Next.js App Router application for VOOM_SYSTEM-NOVA-AI.

## Hosting boundary

- **Frontend:** Netlify — https://voomsystem.netlify.app/
- **Backend:** Cloudflare Workers/APIs.
- **Auth and data:** Supabase.
- **Broker:** Exness Demo through the authenticated System Hub and tenant-scoped MT5 read-only Proxy/Relay.
- **Safety:** Read-only + AI Analysis. Live Trading and order submission remain disabled.

The repository-root `netlify.toml` sets `frontend/` as the build base and runs `npm run build`. Netlify's Next.js runtime handles App Router rendering. Do not deploy the customer-facing frontend through the Cloudflare backend deployment workflow.

## Required build environment

Configure these names in the Netlify project settings; do not place values in this document or the repository:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only)
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

## Verification boundary

A ready deployment and successful route smoke test do not prove the signed-in broker path. Require a real Supabase OTP session, owner-scoped account read, and denial for a foreign connection ID before declaring the authenticated broker flow ready.

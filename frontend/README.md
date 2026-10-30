# NOVA Frontend — Netlify + Cloudflare Worker verification

This folder contains the customer-facing Next.js App Router application for VOOM_SYSTEM-NOVA-AI.

## Hosting boundary

- **Current public production frontend:** Netlify — https://voomsystem.netlify.app/
- **Cloudflare frontend validation target:** OpenNext Worker — https://voom-system-nova-ui.suwapat787.workers.dev
- **Backend:** Cloudflare Workers/APIs.
- **Auth and data:** Supabase.
- **Broker:** Exness Demo through the authenticated System Hub and tenant-scoped MT5 read-only Proxy/Relay.
- **Safety:** Read-only + AI Analysis. Live Trading and order submission remain disabled.

The repository-root `netlify.toml` continues to serve the current public production site. For PR #85, Frontend CI builds and deploys the exact PR head to the isolated staging Cloudflare Worker. The stable `voom-system-nova-ui` Worker is not updated by default; the main workflow requires the explicit GitHub Actions variable `DEPLOY_CLOUDFLARE_FRONTEND_MAIN=true` to opt in. This does not change DNS or cut over the public production domain; retain Netlify until a separately approved cutover.

## Required build environment

Configure these names in the Netlify project settings; do not place values in this document or the repository:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only)
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

## Verification boundary

A ready deployment and successful route smoke test do not prove the signed-in broker path. Require a real Supabase OTP session, owner-scoped account read, and denial for a foreign connection ID before declaring the authenticated broker flow ready.

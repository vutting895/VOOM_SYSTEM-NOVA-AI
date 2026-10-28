# Deployment and environment configuration

Updated: 2026-10-25

## Canonical repository

This guide applies to `vutting895/Voom_system` on branch `main`. The repository contains separate services; do not assume that every Cloudflare Worker is deployed from the same folder.

## Vercel frontend + root API

- Vercel Framework Preset: **Other** (the repository configuration sets `framework: null`).
- Static Output Directory: `Dashboard`. The dashboard HTML and its relative assets are served from that directory.
- The root serverless API entry is `api/index.js`, which imports `backend/app.js`.
- The rewrites in `vercel.json` preserve the dashboard page routes and route `/api/*` requests to the API function.
- Use the repository root as Vercel's Root Directory. If the project still reports that `public` is missing, verify that the deployment is linked to this repository/branch and that its Root Directory is the repository root; project settings can differ from the checked-in config.

## Environment variables

Use `.env.example` as a names-only template. It contains no real credentials.

- `VOOM_BRIDGE_SHARED_SECRET`: server-side API/Cloudflare Worker shared secret, at least 32 characters. Configure independently in each runtime; never commit the value.
- `CORS_ORIGINS`: exact comma-separated frontend origins. No wildcard.
- `TRADING_MODE=paper` and `LIVE_TRADING_ENABLED=false`: keep these safety defaults.
- Frontend Supabase browser configuration must use the publishable/anon key only. Never expose a Supabase service-role key via frontend code or a `NEXT_PUBLIC_*` variable.
- Keep actual `.env`, Worker secrets, OAuth client secrets, access tokens, and API keys out of Git. Use Vercel Environment Variables and Cloudflare Worker Secrets for runtime credentials.

## Alpaca OAuth is a separate deployment

The checked-in tree does not contain the source for the Worker URL `https://voom-alpaca-oauth.suwapat787.workers.dev/`. Therefore a commit to this repository cannot by itself fix that Worker's OAuth callback or the observed `GET /api/alpaca/account` HTTP 401. Do not copy Alpaca client secrets or access tokens into this repository. To fix the 401, inspect the actual Alpaca Worker source and its configured OAuth/token state, then verify the callback URL matches the provider's registered redirect URI and test only against Paper Trading.

## Safety verification

After deployment:
1. Check `GET /api/health` returns `tradingMode: paper`, `liveTradingEnabled: false`, and `orderExecution: disabled`.
2. Check dashboard page routes and `GET /api/dashboard/status`.
3. Confirm no secret values appear in build logs, browser bundles, or Git history.
4. Keep order execution disabled; this repository's telemetry API is not an order-placement API.

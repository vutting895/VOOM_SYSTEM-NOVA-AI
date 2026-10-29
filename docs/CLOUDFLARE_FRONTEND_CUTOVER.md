# Cloudflare Frontend Cutover — Historical Inspection Record

> **SUPERSEDED (2026-10-29):** Retained as a record of the earlier deployment attempt only. The active architecture is Netlify frontend (`https://voomsystem.netlify.app/`) plus Cloudflare backend Workers. Do not use the Cloudflare UI deployment steps in this historical document as the current runbook.

Inspection date: 2026-10-27  
Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`  
Canonical branch: `main`  
Safety mode: Read-only + AI Analysis; Live Trading remains OFF.

## Historical intended deployment path (superseded)

- Frontend Worker: `voom-system-nova-ui`
- Frontend URL: https://voom-system-nova-ui.suwapat787.workers.dev
- API Worker: `voom-system-nova-ai`
- API URL: https://voom-system-nova-ai.suwapat787.workers.dev
- Frontend source directory: `frontend/`
- Worker configuration: `frontend/wrangler.jsonc`
- OpenNext configuration: `frontend/open-next.config.ts`
- CI workflow: `.github/workflows/frontend-ci.yml`
- Cloudflare deployment workflow: `.github/workflows/cloudflare-deploy.yml`

## Evidence observed

1. GitHub confirms the repository exists, is private, and has `main` as its default branch.
2. The frontend package includes Next.js 15, React 19, OpenNext/Cloudflare build and deploy scripts.
3. The Cloudflare account lists both `voom-system-nova-ui` and `voom-system-nova-ai` Workers.
4. The Cloudflare settings API returned successfully for both Worker names.
5. The frontend Worker's inspected settings reported compatibility date `2026-10-24` and an empty compatibility-flags list. The committed `frontend/wrangler.jsonc` specifies compatibility date `2026-10-27` and `nodejs_compat`.
6. The latest Vercel deployments inspected for the separate `voom_system_nova` project were `CANCELED`. Vercel is not the intended frontend host, but the existence of that project/integration has not been removed.
7. A live browser check of the Cloudflare URL could not be completed with the available web inspection. The Worker listing/settings responses do not prove that the expected pages render or that frontend API calls succeed.

## Historical verdict at the time of inspection

**Cloudflare is configured as the intended frontend target, but the cutover is not yet verified end-to-end.** The Worker exists, but its observed configuration appears older than the repository's current Wrangler config. Do not mark the frontend as fully deployed until the Cloudflare build/deploy workflow completes successfully and the live URL is checked.

## Required verification sequence

1. Confirm GitHub Actions secrets exist without displaying their values:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SYSTEM_HUB_URL` (defaults to `https://voom-system-hub.suwapat787.workers.dev`)
2. Run `Frontend CI` on the exact `main` commit and require Hub tests, type-check, Next.js build, and Cloudflare OpenNext build to pass.
3. Let `Deploy VOOM Workers to Cloudflare` deploy changed backend Workers and, when `frontend/**` changed, the `voom-system-nova-ui` frontend from the exact commit that passed CI.
4. Inspect the new Cloudflare Worker version/deployment and confirm its configuration matches `frontend/wrangler.jsonc`.
5. Open the frontend URL and verify home, login, markets, learning universe, broker status, and AI analysis routes.
6. Verify API status and errors without exposing secrets or account identifiers.
7. The Broker Settings page now sends the signed-in Supabase access token to `voom-system-hub`. The Hub validates the session and scopes the connection lookup to the authenticated user before calling the MT5 Proxy. Verify this exact browser path with a real signed-in session; do not bypass Hub auth or use service-role credentials in the browser.
8. Verify broker integration remains read-only and all order routes stay disabled. Do not submit any live orders.

## Safety and change boundaries

- Do not enable Live Trading or introduce order submission during this cutover.
- Do not paste secrets into source files, commits, issues, logs, or chat.
- Do not delete the old Vercel project or integrations as part of this code update; disconnect them separately only after confirming they are no longer needed.
- Do not report a build, deployment, browser check, or broker connection as successful without observable evidence.


## Historical blockers and observations (recorded 2026-10-29 before the Netlify architecture correction)

- The earlier build failure referenced `NEXT_PUBLIC_ALPACA_WORKER_URL`; that variable is obsolete and the legacy Cloudflare Worker `voom-alpaca-oauth` has been retired.
- Broker Settings now uses `NEXT_PUBLIC_SYSTEM_HUB_URL` and routes authenticated account/quote requests through `voom-system-hub` instead of calling the MT5 Proxy directly.
- At the time this historical record was written, the Cloudflare workflow detected frontend changes and deployed `voom-system-nova-ui`; that frontend deployment path has since been superseded and is no longer the production target.
- Live direct Relay tests returned HTTP 200 for the Exness Demo account summary and XAUUSDm M1 quotes. The authenticated per-user browser path must still be verified from a real signed-in Supabase session before claiming full frontend-to-broker success.
- No live trading or order execution is enabled.

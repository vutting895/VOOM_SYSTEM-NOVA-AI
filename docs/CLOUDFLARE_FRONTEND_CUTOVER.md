# Cloudflare Frontend Cutover — Historical Inspection Record

> **Current verification boundary (2026-10-30):** Netlify (`https://voomsystem.netlify.app/`) remains the public production frontend. PR #85 adds a parallel OpenNext deployment to `voom-system-nova-ui.suwapat787.workers.dev` after the exact `main` commit passes Frontend CI. This Cloudflare Worker is a frontend validation target; it does not change DNS or cut over the public production domain. Do not describe the Cloudflare Worker as production until a separately approved cutover is completed.

Inspection date: 2026-10-27  
Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`  
Canonical branch: `main`  
Safety mode: Read-only + AI Analysis; Live Trading remains OFF.

## Intended deployment path

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
7. A live browser check of the Cloudflare URL could not be completed with the available web inspection. The Worker listing/settings responses do not prove that the expected pages render or that frontend API calls succeed.

## Current verdict

**Historical verdict (2026-10-27):** Cloudflare was configured as a frontend target, but that approach was not accepted as the current production target. The Worker exists, but its observed configuration appears older than the repository's current Wrangler config. Do not mark the frontend as fully deployed until the Cloudflare build/deploy workflow completes successfully and the live URL is checked.

## Required verification sequence

1. Confirm GitHub Actions secrets exist without displaying their values:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SYSTEM_HUB_URL` (defaults to `https://voom-system-hub.suwapat787.workers.dev`)
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (falls back to the existing `VOOM_SYSTEM_AUTH` public site key)
2. Run `Frontend CI` on the exact `main` commit and require Hub tests, type-check, Next.js build, and Cloudflare OpenNext build to pass.
3. After PR #85 merges, `Deploy VOOM Workers to Cloudflare` deploys the customer frontend through OpenNext only when `frontend/` changed, using the exact SHA validated by Frontend CI. It then smoke-tests `/`, `/login`, `/command-center`, `/settings/broker`, and unauthenticated API denial. Backend Worker deployments remain change-scoped.
4. Verify the Cloudflare UI Worker deployment timestamp/version and live route responses against the exact merged SHA. Netlify remains production until the customer explicitly approves DNS cutover.
5. Open the frontend URL and verify home, login, markets, learning universe, broker status, and AI analysis routes.
6. Verify API status and errors without exposing secrets or account identifiers.
7. The Broker Settings page now sends the signed-in Supabase access token to `voom-system-hub`. The Hub validates the session and scopes the connection lookup to the authenticated user before calling the MT5 Proxy. Verify this exact browser path with a real signed-in session; do not bypass Hub auth or use service-role credentials in the browser.
8. Verify broker integration remains read-only and all order routes stay disabled. Do not submit any live orders.

## Safety and change boundaries

- Do not enable Live Trading or introduce order submission during this cutover.
- Do not paste secrets into source files, commits, issues, logs, or chat.
- Repository source contains no alternate hosting-provider deployment configuration or CI workflow. Provider-side GitHub App authorization and any separately retained hosting projects are managed outside this repository and are not changed by source commits.
- Do not report a build, deployment, browser check, or broker connection as successful without observable evidence.


## Historical blockers and current resolution (updated 2026-10-29)

- The earlier build failure referenced `NEXT_PUBLIC_ALPACA_WORKER_URL`; that variable is obsolete and the Alpaca integration is not part of the active broker workflow. Repository source cleanup does not confirm that a provider-side `voom-alpaca-oauth` Worker is disabled; verify Cloudflare account state separately before any decommissioning.
- Broker Settings now uses `NEXT_PUBLIC_SYSTEM_HUB_URL` and routes authenticated account/quote requests through `voom-system-hub` instead of calling the MT5 Proxy directly.
- Historical observation at the time this record was created: the Cloudflare workflow detected frontend changes, built through OpenNext, deployed `voom-system-nova-ui`, and smoke-tested the home and broker settings pages. The active workflow is being changed to backend-only deployment.
- Live direct Relay tests returned HTTP 200 for the Exness Demo account summary and XAUUSDm M1 quotes. The authenticated per-user browser path must still be verified from a real signed-in Supabase session before claiming full frontend-to-broker success.
- No live trading or order execution is enabled.

# Cloudflare Frontend Cutover — Inspection Record

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
6. The latest Vercel deployments inspected for the separate `voom_system_nova` project were `CANCELED`. Vercel is not the intended frontend host, but the existence of that project/integration has not been removed.
7. A live browser check of the Cloudflare URL could not be completed with the available web inspection. The Worker listing/settings responses do not prove that the expected pages render or that frontend API calls succeed.

## Current verdict

**Cloudflare is configured as the intended frontend target, but the cutover is not yet verified end-to-end.** The Worker exists, but its observed configuration appears older than the repository's current Wrangler config. Do not mark the frontend as fully deployed until the Cloudflare build/deploy workflow completes successfully and the live URL is checked.

## Required verification sequence

1. Confirm GitHub Actions secrets exist without displaying their values:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_MT5_READONLY_PROXY_URL` (GitHub Actions repository variable)
2. Run `Frontend CI` on the exact `main` commit and require type-check, Next.js build, and OpenNext build to pass.
3. Let `Deploy NOVA Frontend to Cloudflare` deploy the exact commit that passed CI.
4. Inspect the new Cloudflare Worker version/deployment and confirm its configuration matches `frontend/wrangler.jsonc`.
5. Open the frontend URL and verify home, login, markets, learning universe, broker status, and AI analysis routes.
6. Verify API status and errors without exposing secrets or account identifiers.
7. Align frontend authentication with the proxy before claiming broker integration works. The current frontend broker page sends a Supabase Bearer token, while the inspected proxy code validates a Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) and its CORS allow-list does not include the Authorization header. This contract mismatch must be resolved and tested securely.
8. Verify broker integration remains read-only and all order routes stay disabled. Do not submit any live orders.

## Safety and change boundaries

- Do not enable Live Trading or introduce order submission during this cutover.
- Do not paste secrets into source files, commits, issues, logs, or chat.
- Do not delete the old Vercel project or integrations as part of this code update; disconnect them separately only after confirming they are no longer needed.
- Do not report a build, deployment, browser check, or broker connection as successful without observable evidence.


## Additional blocker found during inspection

- The prior Cloudflare deployment workflow failed before build/deploy because `NEXT_PUBLIC_ALPACA_WORKER_URL` was unset. That setting is obsolete for the current Exness MT5 frontend.
- The workflow was updated to use `NEXT_PUBLIC_MT5_READONLY_PROXY_URL` from GitHub Actions repository variables, and CI now supplies a non-production placeholder for that variable.
- Configure the public proxy URL as a repository Actions variable named `NEXT_PUBLIC_MT5_READONLY_PROXY_URL`; do not store credentials in it.
- Authentication contract mismatch: the current frontend sends `Authorization: Bearer <Supabase access token>`, but the deployed `voom-mt5-readonly-proxy` code checks `Cf-Access-Jwt-Assertion` and its CORS response only allows `Content-Type`. The browser request will not work reliably as currently wired. Resolve the contract intentionally (for example, authenticate the Supabase token server-side in the proxy or redesign the request around Cloudflare Access), then validate preflight/CORS and the authorized read-only account endpoint.
- No live trading or order execution was enabled by these repository changes.

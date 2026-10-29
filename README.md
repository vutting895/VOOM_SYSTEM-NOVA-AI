# VOOM_SYSTEM — NOVA

## Purpose
Modular market-research and paper-trading platform: market-data ingestion, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation, and broker integration.

## Current safety state
- Live order execution remains disabled. The active broker target is Exness Demo via MT5 read-only bridge; Alpaca is not part of the active broker workflow.
- Public market data is read-only. Never commit secrets or real credentials.
- Gen AI currently uses rule-based strategy templates unless an LLM provider is explicitly configured; it is not a model trained from scratch.
- Backtests use historical OHLCV and are not tick-accurate or predictive.
- ML examples under `workers/feature` are research prototypes, not a production pipeline.

## Frontend hosting and deployment
- **Selected frontend target: Netlify** at `https://voomsystem.netlify.app`, matching the updated architecture. This is the intended target, not a claim that cutover is complete.
- **Current verified fallback: Cloudflare Worker `voom-system-nova-ui`**. The live `/` and `/settings/broker` routes returned HTTP 200 in a sanitized check on 2026-10-29.
- The current `.github/workflows/cloudflare-deploy.yml` still deploys the Cloudflare frontend when `frontend/**` changes. Keep this rollback path active until Netlify passes production route, login/session, and tenant-isolation checks; do not change DNS or Supabase redirects prematurely.
- PR #54 adds the root `netlify.toml` configuration for the `frontend/` app. Its verification notes recorded a historical HTTP 404 from Netlify. A config file alone does not prove site linkage or successful deployment.
- A fresh Netlify probe on 2026-10-29 returned no HTTP status, and the inspected Windows machine has no Netlify CLI or `NETLIFY_AUTH_TOKEN`; the site is **not production-verified** at this checkpoint.
- Frontend CI runs Worker tests, type-check, Next.js build, and Cloudflare OpenNext validation. Netlify must also be verified against its own production deploy and exact commit.
- Required Netlify dashboard build variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only), `NEXT_PUBLIC_SYSTEM_HUB_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Keep their values out of Git and logs.

### Local frontend checks (optional)
Run from the repository root:
```powershell
Set-Location .\frontend
npm ci
npm run typecheck
npm run build
npm run cf:build
```
Build validation is not the same as production deployment. Verify the provider's exact deployed commit and live routes before marking the cutover complete.

## Unified frontend and NOVA Chat
- One Next.js site contains the Dashboard and Chat rather than merging the separate Eve Chat repository.
- Routes include Dashboard, AI Chat, Markets, AI Analysis, Backtest baseline, Learning Universe 16, Broker Hub, Marketplace, Login and Profile.
- Chat calls the same-origin authenticated Next.js API, which verifies the Supabase session and forwards the bounded conversation to the NOVA AI Worker. Provider failure must return an error rather than invent a response.
- Chat history is currently page-memory only and is not persisted across refreshes. Chat is research-only with no order-submission capability.
- The current Backtest page reports a buy-and-hold baseline, not a strategy backtest. Do not describe those baseline metrics as evidence that EMA/RSI has been tested.

## Environment
Configure frontend variables in the Netlify dashboard only and backend secrets in Cloudflare/GitHub Actions as appropriate. Never commit secret values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only; never a service-role key)
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- GitHub Actions backend deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. The authenticated broker UI must show unavailable rather than claim a connection when the System Hub or owner-session path is not verified.

## Current deployment verification limits
The Cloudflare fallback is currently responding on both expected frontend routes, but that does not prove it serves a given commit. Netlify is the selected target but remains unverified: its live probe returned no HTTP status and no Netlify CLI/token was available on the inspected Windows machine. Before cutover, prove the exact deployed commit, HTTP 200 on `/` and `/settings/broker`, Supabase login/callback/session persistence/logout, and owner-session versus foreign-connection denial. Do not update Supabase Site URL/redirect allow-list until those tests pass.

## Architecture
- `frontend/`: Next.js UI; Netlify is the selected target, and Cloudflare remains the verified fallback until cutover gates pass.
- `integrations/remote-mcp-worker/`: primary Cloudflare Remote MCP endpoint; read-only research tools and paper-risk validation.
- `integrations/mt5-readonly-proxy/`: authenticated Cloudflare proxy for the per-tenant read-only bridge.
- `workers/data-ingestion/`: public market-data adapter.
- `workers/feature/`: imported ML research prototypes; dependencies and leakage checks required.
- `workers/gen-ai/`: strategy-draft prototype.
- `workers/backtest/`: deterministic OHLCV EMA crossover simulation.
- `workers/tuning/`: bounded parameter-grid prototype.
- `workers/risk/`: fail-closed paper risk policy.
- `workers/portfolio/`: allocation validator.
- `workers/execution/`: intentionally disabled.
- `shared/`: JSON schemas and feature-store contract.
- `supabase/migrations/`: database migrations.

## Not production-ready yet
OAuth end-to-end verification, leaked-password protection, review of SECURITY DEFINER RPC grants, runtime monitoring, broader tests, and historical-data quality/fee modelling remain necessary before considering any live trading.

## Git-first development and Windows runtime
- **Develop in GitHub, not in the Windows runtime folder.** Use branches and reviewed commits in `vutting895/VOOM_SYSTEM-NOVA-AI`; `main` is the runtime source of truth.
- Windows is required only for the MT5 terminal and the tenant-guarded, read-only MT5 Bridge. Cloudflare Workers cannot run the Windows MT5 terminal.
- The tracked bootstrap is `tools/windows/run-bridge-from-git.ps1`. It refreshes a shallow sparse checkout of `integrations/mt5-readonly-bridge/` and `tools/windows/` into `%LOCALAPPDATA%\VOOM_SYSTEM\runtime\repo` before launching the Bridge, so both the Bridge and bootstrap source come from Git.
- Keep only the small bootstrap copy, runtime checkout and its isolated Python environment, MT5 terminal, and private local tenant files on Windows. Tenant files stay under `%LOCALAPPDATA%\VOOM_SYSTEM\secrets` and must never enter Git.
- Do not remove the existing development checkout until all its modified and untracked files have been compared with GitHub and any unique work preserved. Build caches may be deleted only after the replacement runtime has been verified.
- The Bridge remains read-only; the bootstrap does not submit orders or enable live trading. A process start alone is not proof of a broker connection.

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
- Canonical customer-facing frontend: Netlify at `https://voomsystem.netlify.app/`. Cloudflare is for backend Workers/APIs only; `voom-system-nova-ui` is not the current frontend target.
- Frontend source directory: `frontend/` (Next.js App Router). The root `netlify.toml` sets the base directory to `frontend` and runs `npm run build`; Netlify's Next.js runtime handles the web application.
- Broker Settings calls `voom-system-hub` via `NEXT_PUBLIC_SYSTEM_HUB_URL` (default: `https://voom-system-hub.suwapat787.workers.dev`). The browser sends the signed-in user's Supabase access token; it does not call the MT5 Proxy directly.
- `.github/workflows/frontend-ci.yml` runs worker tests, type-check, the Next.js build, and Cloudflare backend config validation. On pushes to `main`, it also smoke-tests the production Netlify routes.
- `.github/workflows/cloudflare-deploy.yml` deploys changed backend Workers only. It must not build or deploy a customer-facing frontend to Cloudflare.
- Netlify must be connected to this repository and deploy from `main`. Configure public build variables in Netlify's site settings; do not commit values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SYSTEM_HUB_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Configure Cloudflare backend deployment secrets in GitHub Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never print secret values.

### Local frontend checks (optional)
Run from the repository root:
```powershell
Set-Location .\frontend
npm ci
npm run typecheck
npm run build
```
Cloudflare OpenNext scripts/configuration are retained only for alternate/legacy use; they are not the production frontend deployment path.

## Environment
The frontend's required public build variables belong in Netlify's site settings, and backend secrets belong in Cloudflare/GitHub Actions as appropriate. Never commit values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SYSTEM_HUB_URL` (defaults to `https://voom-system-hub.suwapat787.workers.dev`)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

Never print secret values in logs or chat. Cloudflare and Supabase runtime configuration must be complete before the authenticated broker path is considered ready. The UI must show unavailable rather than claim a connection when the authenticated backend path is absent.

## Current deployment verification limits
The repository now defines Netlify as the frontend deployment target and adds a main-branch route smoke test. This configuration alone does not prove that Netlify is connected to the correct repository, that the latest commit is deployed, or that the public routes work. Do not mark the frontend ready until the Netlify smoke test and real authenticated browser checks pass. Cloudflare Worker health is evidence for backend services only.
## Architecture
- `frontend/`: Next.js UI deployed on Netlify; Cloudflare OpenNext scripts are legacy/alternate configuration only.
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

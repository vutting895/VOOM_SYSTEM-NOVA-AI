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
- The current workflow builds the Next.js frontend for **Vercel**. Cloudflare is used for authenticated backend Workers, including the MT5 read-only proxy and Remote MCP endpoint.
- `.github/workflows/frontend-ci.yml` runs frontend checks and worker/bridge safety tests.
- `.github/workflows/cloudflare-deploy.yml` deploys the authenticated Cloudflare backend Workers; it explicitly does **not** deploy the Next.js frontend.
- The workflow's frontend smoke test currently targets `https://voomsystem.vercel.app`. Treat this as a legacy alias until it is confirmed to point at the intended Vercel project. A successful check against this alias alone does not prove the selected Nova frontend deployment is current.
- A Worker named `voom-system-nova-ui` may still exist on Cloudflare from an earlier cutover. Its presence is not proof that the current frontend source is deployed there, and this workflow does not redeploy that frontend Worker.

### Local frontend checks (optional)
Run from the repository root:
```powershell
Set-Location .\frontend
npm ci
npm run typecheck
npm run build
```
Cloudflare build scripts remain available for a separately approved frontend cutover. Do not change the active host or claim a deployment succeeded unless the provider deployment/version and live routes have been verified.

## Environment
Configure frontend build variables in the intended Vercel project and backend secrets in Cloudflare/GitHub Actions as appropriate. Never commit their values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MT5_READONLY_PROXY_URL` (optional until its authenticated endpoint is implemented and verified)
- GitHub Actions deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. Cloudflare and Supabase runtime configuration must be complete before the authenticated broker path is considered ready. The UI must show unavailable rather than claim a connection when the optional MT5 proxy URL is absent.

## Current deployment verification limits
A Cloudflare Worker existing or responding to its settings endpoint does not prove that the latest source is deployed or that the live UI works. Verify the intended Vercel project/alias and browser routes, plus the Cloudflare backend Worker versions and authenticated no-login rejection tests, before marking the cutover complete.

## Architecture
- `frontend/`: Next.js UI, currently built for Vercel by the frontend workflow.
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
- The tracked bootstrap is `tools/windows/run-bridge-from-git.ps1`. It refreshes a shallow sparse checkout of only `integrations/mt5-readonly-bridge/` into `%LOCALAPPDATA%\VOOM_SYSTEM\runtime\repo` before launching the Bridge.
- Keep only the small bootstrap copy, runtime checkout and its isolated Python environment, MT5 terminal, and private local tenant files on Windows. Tenant files stay under `%LOCALAPPDATA%\VOOM_SYSTEM\secrets` and must never enter Git.
- Do not remove the existing development checkout until all its modified and untracked files have been compared with GitHub and any unique work preserved. Build caches may be deleted only after the replacement runtime has been verified.
- The Bridge remains read-only; the bootstrap does not submit orders or enable live trading. A process start alone is not proof of a broker connection.

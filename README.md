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
- **Canonical frontend host:** Cloudflare Workers.
- **Frontend Worker name:** `voom-system-nova-ui`.
- **Frontend URL:** https://voom-system-nova-ui.suwapat787.workers.dev
- **API Worker URL:** https://voom-system-nova-ai.suwapat787.workers.dev
- **Source of truth:** this repository, `vutting895/VOOM_SYSTEM-NOVA-AI`, branch `main`.
- **Build/deploy workflow:** `.github/workflows/frontend-ci.yml` validates the frontend; `.github/workflows/cloudflare-deploy.yml` deploys the validated commit to Cloudflare Workers.
- Vercel is not the intended frontend deployment target. Its project/deployments may still exist separately; changing repository files does not disconnect provider integrations.

### Local frontend checks (optional)
Run from the repository root:
```powershell
Set-Location .\frontend
npm ci
npm run typecheck
npm run build
npm run cf:build
```
Deployments should be made by the guarded Cloudflare workflow after checks pass. Do not claim a deployment succeeded unless the Cloudflare deployment/version and live URL have been verified.

## Environment
Configure these values in the intended Cloudflare build/runtime environment and Supabase project settings. Do not commit their values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MT5_READONLY_PROXY_URL` (optional GitHub Actions repository variable; points to the protected Exness MT5 read-only proxy when that proxy is ready)
- GitHub Actions deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. Cloudflare and Supabase deployment secrets are required; the MT5 proxy URL is optional until its authenticated Cloudflare endpoint is implemented and verified. The UI must show unavailable rather than claim a connection when that URL is absent.

## Current Cloudflare cutover verification
The Cloudflare account currently contains a Worker named `voom-system-nova-ui`, and its settings endpoint is reachable. However, the deployed Worker settings last inspected did not show the `nodejs_compat` flag present in `frontend/wrangler.jsonc`, and its modification time predates the latest frontend repository changes. Therefore the presence of the Worker is **not proof** that the latest Next.js frontend is deployed or that the live UI works. Run the Cloudflare CI/build/deploy workflow and verify the deployed version and browser routes before marking the cutover complete.

## Architecture
- `frontend/`: Next.js UI, built for Cloudflare Workers with OpenNext.
- `integrations/remote-mcp-worker/`: primary Cloudflare Remote MCP endpoint; read-only research tools and paper-risk validation.
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

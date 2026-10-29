# VOOM_SYSTEM — NOVA

## Purpose
Modular market-research and paper-trading platform: market-data ingestion, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation, and broker integration.

## Current safety state
- Live order execution remains disabled. The active broker target is Exness Demo via the tenant-isolated MT5 read-only Bridge; Alpaca is not part of the active broker workflow.
- Public market data is read-only. Never commit secrets or real credentials.
- Gen AI currently uses rule-based strategy templates unless an LLM provider is explicitly configured; it is not a model trained from scratch.
- Backtests use historical OHLCV and are not tick-accurate or predictive.
- ML examples under `workers/feature` are research prototypes, not a production pipeline.

## Frontend hosting and deployment
- **Canonical production frontend: Cloudflare Worker `voom-system-nova-ui`.** Do not use Vercel as the intended deployment target.
- The active alternative-host decision is documented in [`docs/FRONTEND-HOSTING-DECISION.md`](docs/FRONTEND-HOSTING-DECISION.md). Netlify PR #54 is a proposal only; its reported HTTP 404 does not qualify it as a production host.
- Broker Settings uses the central `voom-system-hub` endpoint via `NEXT_PUBLIC_SYSTEM_HUB_URL` (default: `https://voom-system-hub.suwapat787.workers.dev`) for Exness Demo account and quotes. The browser sends the signed-in user's Supabase access token; it does not call the MT5 Proxy directly.
- `.github/workflows/frontend-ci.yml` runs Worker tests, type-check, the Next.js build, and the Cloudflare OpenNext build.
- `.github/workflows/cloudflare-deploy.yml` deploys changed backend Workers and, when `frontend/**` changes, builds and deploys the canonical Cloudflare frontend and smoke-tests the home and broker routes.
- The existence of a Worker or a successful settings API call alone does not prove that a given source commit is serving traffic. Verify the workflow's checked-out commit and its live-route smoke tests.
- Required GitHub Actions secrets include `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never print secret values.

### Local frontend checks
Run from the repository root:
```powershell
Set-Location .\frontend
npm ci
npm run typecheck
npm run build
npm run cf:build
```
The generic Next.js build validates application compilation; `cf:build` validates the Cloudflare/OpenNext artifact. The production deploy workflow runs `cf:deploy` only for a reviewed `main` commit that passed Frontend CI. Do not change the active host based on configuration alone.

## Environment
Configure public build-time values and provider credentials only in the intended GitHub Actions / Cloudflare configuration; do not configure Vercel as the production target:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only; never a service-role key)
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- GitHub Actions deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. Cloudflare and Supabase runtime configuration must be complete before the authenticated broker path is considered ready. The UI must show unavailable rather than claim a connection when the authenticated System Hub or broker path is not verified.

## Current deployment verification limits
Use the exact Frontend CI commit, the corresponding successful Cloudflare deployment run, and successful live-route smoke tests before marking a deployment complete. The latest baseline recorded in Issue #57 is commit `2cbfc27734e22ecba49242e8227fc8544c5e7aa8`; evidence is linked from that issue. A successful frontend deployment proves the routes deployed in that commit, not that draft Zero-Menu features or the real Supabase owner-session / tenant-isolation flow are complete.

Netlify remains unapproved as a production replacement until its site is connected to this repository and `main`, the candidate deploy serves HTTP 200 for `/` and `/settings/broker`, the commit/deploy identity is verified, and the signed-in Supabase login/callback/session flow is tested. Do not change DNS, Supabase Site URL, authentication redirects, or primary-host references during that evaluation.

## Architecture
- `frontend/`: Next.js UI built and deployed to the canonical Cloudflare Worker frontend.
- `integrations/remote-mcp-worker/`: Cloudflare Remote MCP endpoint; authenticated, read-only research tools and paper-risk validation. Protocol support must be limited to versions covered by conformance tests; see its README.
- `integrations/mt5-readonly-proxy/`: authenticated Cloudflare proxy for the per-tenant read-only Bridge.
- `integrations/system-hub/`: authenticated application control plane; checks the signed-in user owns a connection before proxying reads.
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
- **Develop in GitHub, not in the Windows runtime folder.** Use branches and reviewed commits in `vutting895/VOOM_SYSTEM-NOVA-AI`; `main` is the canonical runtime source of truth.
- Windows is required only for the MT5 terminal and the tenant-guarded, read-only MT5 Bridge. Cloudflare Workers cannot run the Windows MT5 terminal.
- The tracked bootstrap is `tools/windows/run-bridge-from-git.ps1`. It refreshes a shallow sparse checkout of `integrations/mt5-readonly-bridge/` and `tools/windows/` into `%LOCALAPPDATA%\VOOM_SYSTEM\runtime\repo` before launching the Bridge, so both the Bridge and bootstrap source come from Git.
- Keep only the small bootstrap copy, runtime checkout and its isolated Python environment, MT5 terminal, and private local tenant files on Windows. Tenant files stay under `%LOCALAPPDATA%\VOOM_SYSTEM\secrets` and must never enter Git.
- Do not remove the existing development checkout until all its modified and untracked files have been compared with GitHub and any unique work preserved. Build caches may be deleted only after the replacement runtime has been verified.
- The Bridge remains read-only; the bootstrap does not submit orders or enable live trading. A process start alone is not proof of a broker connection.

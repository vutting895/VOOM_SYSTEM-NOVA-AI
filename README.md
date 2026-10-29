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

- **Selected target for the new architecture: Netlify** at `https://voomsystem.netlify.app`. This is the intended destination, not a claim that cutover is complete.
- **Current fallback: Cloudflare Worker `voom-system-nova-ui`**. Its `/` and `/settings/broker` routes returned HTTP 200 in a sanitized runtime check on 2026-10-29. Keep Cloudflare deploys and the Windows MT5 Bridge available until Netlify passes all acceptance gates.
- The current `.github/workflows/cloudflare-deploy.yml` still deploys the Cloudflare frontend when `frontend/**` changes. This is a documented transition mismatch; do not disable that rollback path before Netlify is proven live. A separate reviewed cutover change must update the workflow after the candidate passes.
- PR #54 adds the root `netlify.toml` configuration so the Netlify build uses `frontend/`. Its verification notes recorded an HTTP 404 from the Netlify URL before the config was merged. A configuration file alone does not prove that Netlify is connected to this repository, built the expected commit, or serves the site.
- Netlify remains **not verified for production** at this checkpoint: a fresh probe from the authorized Windows machine returned no HTTP status, and the machine has neither Netlify CLI nor `NETLIFY_AUTH_TOKEN` configured. Do not interpret this as either success or a new HTTP 404.
- Required Netlify environment variables must be configured in the Netlify dashboard only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only), `NEXT_PUBLIC_SYSTEM_HUB_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Never put their values in Git or logs.
- `.github/workflows/frontend-ci.yml` runs Worker tests, type-check, the Next.js build, and Cloudflare OpenNext validation. The Netlify target must also be tested via its actual production build and live routes.
- Supabase Site URL / redirect allow-list must **not** be changed until the Netlify candidate passes. Before cutover, test `/`, `/settings/broker`, login/callback, session persistence, logout, and authenticated Exness Demo account/quote reads on the exact deployed commit.
- Do not use Vercel as the target. Keep the fallback and rollback routes available until the candidate is approved.

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

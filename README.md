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

- **Selected target for the new architecture: Netlify** at `https://voomsystem.netlify.app`. This is the intended destination, not a claim that cutover is complete.
- **Current fallback: Cloudflare Worker `voom-system-nova-ui`**. The live `/` and `/settings/broker` routes returned HTTP 200 in a sanitized check on 2026-10-29.
- The current workflow still deploys the frontend to Cloudflare when frontend files change. Keep this fallback path and the Windows MT5 Bridge available until Netlify passes its route, authentication, and tenant-ownership acceptance gates. Do not change DNS or Supabase redirects yet.
- PR #54 adds root `netlify.toml` so Netlify builds from `frontend/`. Its verification notes recorded an HTTP 404 before that config was merged. A config file is not proof that the Netlify site is connected or serving the reviewed commit.
- Fresh Netlify probe on 2026-10-29 returned no HTTP status from the available Windows device; this is not interpreted as either success or a current 404. The device has neither Netlify CLI nor `NETLIFY_AUTH_TOKEN` configured.
- Configure Netlify build environment only in the Netlify dashboard: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only), `NEXT_PUBLIC_SYSTEM_HUB_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Never commit their values.
- `.github/workflows/frontend-ci.yml` runs the worker/bridge tests, typecheck, Next.js build, and Cloudflare OpenNext validation. A separate host cutover must verify the exact Netlify deploy and live routes before making it primary.
- Do not use Vercel as the target. Cloudflare remains fallback until the Netlify candidate is approved and its Supabase login/callback/session and Exness Demo owner-isolation tests pass.

## Unified frontend and NOVA Chat

- Frontend direction is documented in [docs/FRONTEND-UNIFIED-EXPERIENCE.md](docs/FRONTEND-UNIFIED-EXPERIENCE.md): one Next.js site, one shared navigation, and Chat integrated into NOVA rather than merging the separate Eve Chat repository.
- Routes include Dashboard, AI Chat, Markets, AI Analysis, Backtest baseline, Learning Universe 16, Broker Hub, Marketplace, Login and Profile.
- Chat calls the same-origin authenticated Next.js API, which verifies the Supabase session and forwards the bounded conversation to the NOVA AI Worker. The Worker uses its existing Cloudflare Workers AI binding; if that provider is unavailable, the chat reports an error rather than inventing a response.
- Chat history is currently page-memory only. It is not persisted across refreshes. Chat is research-only and has no order-submission capability.
- The current Backtest page reports the present engine's buy-and-hold baseline, not a strategy backtest. Do not describe these baseline metrics as predictive or as evidence that EMA/RSI has been tested.

## Environment
Configure frontend build variables in the selected Netlify site and backend secrets in Cloudflare/GitHub Actions as appropriate. Never commit their values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MT5_READONLY_PROXY_URL` (optional until its authenticated endpoint is implemented and verified)
- GitHub Actions deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. Cloudflare and Supabase runtime configuration must be complete before the authenticated broker path is considered ready. The UI must show unavailable rather than claim a connection when the optional MT5 proxy URL is absent.

## Current deployment verification limits
A Cloudflare Worker existing or responding to its settings endpoint does not prove that the latest source is deployed or that the live UI works. Verify the intended Netlify production commit and browser routes, plus the Cloudflare backend Worker versions and authenticated no-login rejection tests, before marking the cutover complete.

## Architecture
- `frontend/`: Next.js UI, selected Netlify target; Cloudflare remains the verified fallback until cutover gates pass.
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

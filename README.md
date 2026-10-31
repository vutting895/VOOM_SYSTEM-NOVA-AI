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

- **Primary customer-facing frontend: Netlify** at `https://voomsystem.netlify.app/`. After PR #74 merged as `a53623063d8cf9ebcc30f6c508d2a44b7ba8d9fd`, main-branch smoke tests returned HTTP 200 for `/`, `/login`, and `/settings/broker`; however, the connected Netlify project API still reports published deploy `6ae38a561eb1efe24a5a1105` on older commit `f8845887ebf2619e2723727735634246a4a54be9`. Exact Production commit reconciliation remains open.
- Netlify Observability recorded HTTP 200 for the production root, Next.js RSC requests for `/login`, `/profile`, and `/broker`, and static frontend assets after that deployment. The anonymous broker-status endpoint returned HTTP 401 as expected. These observations do not prove a real OTP login/session or the complete broker route.
- The legacy Cloudflare UI `voom-system-nova-ui` is retained temporarily as a rollback option, not the desired production target. The deployment workflow change to backend-only Cloudflare deploys and the root `netlify.toml` are in review in the Netlify alignment PR; do not describe that repository cutover as merged until it is.
- A historical Netlify Deploy Preview failed in the UI-installed `netlify-plugin-checklinks` post-build phase. Later previews for PRs #69 and #71 succeeded. The new hosting-alignment PR still needs its own Preview and logs verified; do not assume older failures or successes transfer to a new commit.
- Required Netlify dashboard variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only), `NEXT_PUBLIC_SYSTEM_HUB_URL`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Configure them in site settings and never commit their values.
- `.github/workflows/frontend-ci.yml` validates worker/security tests, type-check, and the Next.js build. Its production smoke-test job checks Netlify routes on a push to `main`. `.github/workflows/cloudflare-deploy.yml` is being aligned to deploy backend Workers only.

## Unified frontend and NOVA Chat

- Use this repository's `frontend/` as the single web application; integrate Chat into NOVA rather than merging the separate Eve Chat repository.
- The shared navigation links Dashboard, AI Chat, AI Analysis and other existing routes.
- Chat calls a same-origin authenticated Next.js API route. That route verifies the Supabase session before forwarding a bounded conversation to the NOVA AI Worker; the Worker returns an error rather than inventing a response when the provider is unavailable.
- Structured intent is a data-only `nova.intent.v1` envelope with a strict allow-list of intents, parameters and component types. Both the Worker and the API boundary validate it. The frontend renders only the fixed React component catalog; it does not evaluate model-supplied HTML or JavaScript.
- The current classifier is deterministic first-pass routing, not yet a model-generated Zod/Pydantic structured output parser. Intent cards are research-only and have no execution controls.
- Chat history is page-memory only and is not persisted across refreshes. Durable threads, LangGraph checkpoint/resume, approval lifecycle and real two-user session tests remain open.
- The current Backtest page reports a buy-and-hold baseline, not a strategy backtest. Do not describe baseline metrics as evidence of EMA/RSI performance.

## Environment
Configure frontend variables in the selected Netlify site and backend secrets in Cloudflare/GitHub Actions as appropriate. Never commit secret values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key only; never a service-role key)
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- GitHub Actions backend deployment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`

Never print secret values in logs or chat. The UI must show unavailable rather than claim a broker connection when authenticated System Hub or owner-session reads are not verified.

## Current deployment verification limits

The current Netlify Production deploy is ready on the expected main-branch application commit, and Observability records HTTP 200 for the root, login/profile/broker Next.js RSC routes, and static assets after deployment. Remaining checks are still material: a direct `/settings/broker` response was not observed in the reviewed log window, no post-deploy direct `/auth/callback` request was observed, and the user's real email OTP/session flow has not been demonstrated.

The actual Supabase owner-session path through System Hub/MT5 Proxy is not yet verified with a signed-in browser session. A valid owner connection read and a foreign connection-ID denial are still required. Anonymous HTTP 401 checks are only negative unauthenticated evidence, not proof of cross-user isolation.

Netlify Observability also recorded repeated `PUT /api/inngest` HTTP 404 requests; current repository search found no Inngest handler/reference. Identify the source before changing application routes. Historical preview 401 responses are expected because non-production Netlify deploys require SSO; old preview 404/500 entries are not evidence of a current Production failure.

Do not change Supabase Site URL/redirect settings or mark cutover fully accepted until the route smoke test, real OTP session persistence/logout, owner access, and foreign-connection denial have passed against a commit/deploy recorded in evidence. Keep Exness Demo/MT5 read-only, and keep order submission and Live Trading disabled.

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


## Wave3 + SMC research (PR #66; feature branch only)

The v6.2.6.3 Wave3/Fibonacci + SMC + XGBoost/60-bar PyTorch LSTM research pipeline is isolated in [Draft PR #66](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/66), not yet part of `main`. Historical Exness Demo XAUUSDm M15 bars and the validated USD high-impact calendar are research inputs only. The calendar CSV is `datasets/exness-demo/news/VOOM_USD_High_Impact_2022_2026.csv` (2,166 high-impact USD events; coverage [2022-07-21T00:00:00Z, 2026-10-30T00:00:00Z)).

Latest completed calendar-filtered training artifact: [workflow run #2](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/41051313086), training SHA `817b0d328d49e2cd80de139fe08183ada8c7cd29`, artifact SHA-256 `565d40daadc58f4e7216dd47a0373d9fa093b9c476fdde21645d10478ddc5267`. Final OOS accuracy 41.3246% versus 45.9708% majority baseline; 0 closed trades; PF unavailable; all five walk-forward folds below their baselines; maximum SMC on Wave3 entry rows 75/100. The performance gate is blocked.

Keep Fib >=80, SMC >=85, XGB BUY >=75%, LSTM BUY >=80%, ensemble BUY >=85%, XGB/LSTM weights 60/40, all RSI/volume/momentum/trend/spread/news rules and fixed risk limits unchanged. No broker orders, deployment or Live Trading. The branch must be reviewed against current `main` before any merge; the PR remains Draft.

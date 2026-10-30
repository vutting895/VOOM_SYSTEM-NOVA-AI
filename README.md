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
- Canonical frontend target: Cloudflare Worker `voom-system-nova-ui`; the Vercel project is not the intended deployment path.
- Broker Settings uses the central `voom-system-hub` endpoint via `NEXT_PUBLIC_SYSTEM_HUB_URL` (default: `https://voom-system-hub.suwapat787.workers.dev`) for Exness Demo account and quotes. The browser sends the signed-in user's Supabase access token; it does not call the MT5 Proxy directly.
- `.github/workflows/frontend-ci.yml` runs worker tests, type-check, the Next.js build, and the Cloudflare OpenNext build.
- `.github/workflows/cloudflare-deploy.yml` deploys only changed backend Workers and, when `frontend/**` changes, builds and deploys the canonical Cloudflare frontend and smoke-tests the home and broker routes.
- The presence of `voom-system-nova-ui` in Cloudflare is not alone proof that a particular source commit is deployed. Use the workflow run and live route checks as evidence.
- Required GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never print secret values.

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
- The tracked bootstrap is `tools/windows/run-bridge-from-git.ps1`. It refreshes a shallow sparse checkout of `integrations/mt5-readonly-bridge/` and `tools/windows/` into `%LOCALAPPDATA%\VOOM_SYSTEM\runtime\repo` before launching the Bridge, so both the Bridge and bootstrap source come from Git.
- Keep only the small bootstrap copy, runtime checkout and its isolated Python environment, MT5 terminal, and private local tenant files on Windows. Tenant files stay under `%LOCALAPPDATA%\VOOM_SYSTEM\secrets` and must never enter Git.
- Do not remove the existing development checkout until all its modified and untracked files have been compared with GitHub and any unique work preserved. Build caches may be deleted only after the replacement runtime has been verified.
- The Bridge remains read-only; the bootstrap does not submit orders or enable live trading. A process start alone is not proof of a broker connection.


## VOOM v6.2.6.3 Wave3 + SMC model research (XGBoost + 60-bar LSTM)

A reproducible training and backtest pipeline is available in the feature branch. It uses the redacted MT5 Demo XAUUSDm M15 history at datasets/exness-demo/, includes time-purged walk-forward folds, an untouched final OOS period, and training-artifact reload checks.

Run from the repository root with Python 3.11:

    python -m pip install -r requirements-wave3.txt
    python tools/train_wave3_models.py --news-calendar datasets/news/high_impact_utc.csv

Omit `--news-calendar` only for a fail-closed diagnostic run; without a genuine historical high-impact calendar the +/-30 minute news filter denies every entry.

Current nested auto-tuned result: docs/WAVE3_MODEL_TRAINING_PLAN.md and reports/wave3_auto_tuned_20261030_report.json. Five chronological walk-forward windows and the final OOS fit completed, and model artifact reload checks passed. The final OOS gate remains blocked: 41.5135% accuracy versus a 45.9708% majority baseline, 39.4037% balanced accuracy, 0 trades, and no Wave3 entry reached SMC >=85 or the XGB/ensemble confidence gates. The historical high-impact news calendar was not supplied and therefore fails closed. No deployment or trading is enabled; artifacts are research-only.

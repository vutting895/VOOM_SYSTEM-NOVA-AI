# VOOM_SYSTEM — NOVA

Production-oriented modular market-research and paper-trading platform. The Nova repository is the source of truth.

## Purpose

Market-data ingestion, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation, broker integration, and the Learning Universe 16 + Auto-Learning Loop.

## Current safety state

- Live order execution remains disabled. Keep Alpaca integration in Paper Trading during validation.
- Public market data is read-only. Never commit secrets or real credentials.
- Gen AI currently uses rule-based strategy templates unless an LLM provider is explicitly configured; it is not a model trained from scratch.
- Backtests use historical OHLCV and are not tick-accurate or predictive.
- ML examples under workers/feature are research prototypes, not a production pipeline.
- Preserve original prototype files during refactors. Clearly label capabilities as implemented, simulated, or unavailable.

## Deployment architecture

- **Frontend:** Next.js in frontend/, Vercel project **voom_system_nova**.
- **API / remote MCP / integrations:** Cloudflare Workers. Do not delete a Worker until callers, routes, bindings, secrets, and traffic have been checked.
- **Database and authentication:** Supabase project ref **tlyyxufuiimrbaksoitf**.
- **Broker:** Alpaca Paper Trading only. Live trading and real orders remain disabled.

## Vercel project setup

- GitHub repository: **vutting895/VOOM_SYSTEM-NOVA-AI** (private)
- Production branch: **main**
- Root Directory: **frontend**
- Framework: Next.js
- Install Command: **npm ci**
- Build Command: **npm run build**

**Verified status on 2026-10-26:** the latest observed Vercel deployment was cancelled. A production deployment request returned **403 Forbidden** because the connected integration lacked permission to create a Production Deployment. Production is not confirmed live. Resolve team/project permissions through the Vercel project owner, then deploy and verify the Ready state and runtime health. Do not bypass authorization or claim success before verification.

## Frontend setup (Windows PowerShell)

```powershell
Set-Location 'C:\\Program Files\\voom_system\\frontend'
npm ci
npm run build
npm run start
```

The frontend production build has not yet been confirmed successful. Run it and inspect its exit status before release.

## Environment and secrets

Set variable values in Vercel/Cloudflare/Supabase configuration without committing them. Keep .env and .dev.vars files out of Git; .env.example files must contain placeholders only. Do not use Google Cloud Secret Manager for this project.

Frontend variable names:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_TURNSTILE_SITE_KEY
- NEXT_PUBLIC_ALPACA_WORKER_URL

Never print secret values. Verify only variable names, environment scopes, and whether required values are configured. The Supabase anon/publishable key is client-visible by design; privileged service-role keys must never be exposed to frontend code.

## Architecture

- frontend/: Next.js UI.
- integrations/remote-mcp-worker/: primary Cloudflare Remote MCP endpoint; read-only research tools and paper-risk validation.
- workers/data-ingestion/ and workers/data_ingestion/: market-data adapters/prototypes; verify which is canonical before consolidating.
- workers/feature/: imported ML research prototypes; dependencies and leakage checks required.
- workers/gen-ai/ and workers/gen_ai/: strategy-draft/LLM integration prototypes; verify canonical path before consolidation.
- workers/backtest/: deterministic OHLCV EMA crossover simulation and data-contract components.
- workers/tuning/: bounded parameter-grid prototype.
- workers/risk/: fail-closed paper risk policy.
- workers/portfolio/: allocation validator.
- workers/execution/: intentionally disabled for real-order execution.
- shared/: JSON schemas and feature-store contract.
- supabase/migrations/: database migrations.

## Learning and trading safety

Learning Universe 16 and Auto-Learning Loop are a core priority. Do not describe a scaffold as a trained model or a simulation as a live integration. Before promoting a strategy, require reproducible market data, deterministic backtests, fee/spread assumptions, out-of-sample evaluation, versioned results, monitoring, rollback, and human review. Backtests are research evidence, not a promise of future returns.

## Release checklist

1. Preserve local changes and the rescue branch; inspect Git divergence before syncing. Never force-push or merge blindly.
2. Inspect diffs, untracked files, and temporary upload folders before staging.
3. Check secrets and ignore rules without exposing values.
4. Run Python regression tests and the frontend production build.
5. Reconcile intended changes with GitHub main through a reviewed branch/PR.
6. Resolve Vercel project/team permissions and verify Git connection.
7. Deploy from the reviewed commit; wait for Ready and inspect build/runtime logs.
8. Verify frontend routes, Cloudflare Worker/API health, Supabase Auth/database/RLS, and broker status.
9. Confirm Alpaca remains in Paper Trading and no real orders were sent.
10. Only then declare Production live and Windows unnecessary for runtime.

See docs/PRODUCTION_DEPLOYMENT_READINESS.md for the detailed deployment status and acceptance criteria.

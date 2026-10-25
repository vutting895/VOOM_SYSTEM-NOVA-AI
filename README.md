# VOOM_SYSTEM — NOVA

## Purpose
Web-first AI market research and paper-trading platform: market-data ingestion, AI-assisted strategy analysis, historical simulation, tuning, risk validation, portfolio allocation, and a web dashboard.

## Current safety state
- Live order execution remains disabled. Keep all broker integration in Paper Trading during validation.
- No Trading Webhook or MT5 EA/bridge is part of the current architecture.
- Broker connectivity must be implemented through authenticated server-side APIs initiated from the web application; do not expose broker secrets to the browser.
- Public market data is read-only. Never commit secrets or real credentials.
- Gen AI currently uses rule-based strategy templates unless an LLM provider is explicitly configured; it is not a model trained from scratch.
- Backtests use historical OHLCV and are not tick-accurate or predictive.
- ML examples under `workers/feature` are research prototypes, not a production pipeline.

## Frontend setup (Windows PowerShell)
```powershell
Set-Location 'C:\Program Files\voom_system\frontend'
npm ci
npm run typecheck
npm run build
npm run start
```

## Environment
Set these values in Vercel/Supabase configuration without committing their values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ALPACA_WORKER_URL`

Use server-side, least-privilege broker credentials only after authentication, authorization, audit logging, and paper-trading checks are complete.

## Architecture
- `frontend/`: Next.js web UI and AI interaction.
- `integrations/remote-mcp-worker/`: primary Cloudflare Remote MCP endpoint; read-only research tools and paper-risk validation.
- `workers/data-ingestion/`: public market-data adapter.
- `workers/feature/`: imported ML research prototypes; dependencies and leakage checks required.
- `workers/gen-ai/`: strategy-draft prototype.
- `workers/backtest/`: deterministic OHLCV simulation.
- `workers/tuning/`: bounded parameter-grid prototype.
- `workers/risk/`: fail-closed paper risk policy.
- `workers/portfolio/`: allocation validator.
- `workers/execution/`: intentionally disabled; no order placement.
- `shared/`: JSON schemas and feature-store contract.
- `supabase/migrations/`: database migrations.

## Not production-ready yet
The web-first order workflow is not implemented for live trading. OAuth end-to-end verification, leaked-password protection, review of SECURITY DEFINER RPC grants, runtime monitoring, broader tests, and historical-data quality/fee modelling remain necessary before considering any live trading.

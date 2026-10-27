# VOOM_SYSTEM — NOVA

## Purpose
Modular market-research and paper-trading platform: market-data ingestion, strategy drafting, historical simulation, tuning, risk validation, portfolio allocation, and broker integration.

## Current safety state
- Live order execution remains disabled. Keep all Alpaca integration in Paper Trading during validation.
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
Configure these values in the intended Cloudflare frontend/runtime environment and Supabase project settings. Do not commit their values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ALPACA_WORKER_URL`

The frontend deployment target is Cloudflare, not Vercel. Confirm that the selected Cloudflare deployment adapter supports the current Next.js app before deploying. Removing Vercel-specific references from this repository does not disconnect an existing Vercel project or GitHub integration; that connection must be disabled separately in Vercel/GitHub settings.

Use read-only broker credentials where possible; never enable withdrawals. Keep MT5 bridge settings isolated until independently secured and tested.

## Architecture
- `frontend/`: Next.js UI.
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

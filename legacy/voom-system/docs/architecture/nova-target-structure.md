# VOOM_SYSTEM — NOVA MCP Target Architecture

## Status and scope

This document defines the canonical target structure for the NOVA AI MCP architecture. It is a migration target, not a claim that every service is already implemented or deployed. Existing legacy folders are retained until each component is mapped, tested, and migrated; do not delete or move source files blindly.

## Deployment boundaries

- **Frontend:** Vercel-hosted Next.js app, single canonical entry point under `frontend/`.
- **Edge API / lightweight orchestration:** Cloudflare Workers under `workers/`.
- **Database and authentication:** Supabase PostgreSQL/Auth with RLS and versioned SQL migrations under `shared/supabase/migrations/` (or the currently deployed migration directory until migration is verified).
- **MCP control plane:** `mcp-server/`; tool registry and schemas are centralized here. It orchestrates services; it does not contain duplicate copies of worker business logic.
- **Heavy compute:** Python workers for backtests, tuning, and model jobs run separately from Cloudflare Workers when runtime or dependency limits require it.
- **Safety:** Paper/test mode by default. No real order execution while integrating or testing.

## Canonical layout

```text
voom_system/
├── frontend/                    # One Vercel Next.js application
│   ├── app/                     # Dashboard, Market, Trading, Portfolio, Gen AI, Broker
│   ├── components/              # Shared UI and widgets
│   ├── lib/                     # API clients; no server secrets in browser code
│   └── tests/
├── mcp-server/                  # One MCP server/control plane
│   ├── app.py
│   ├── tools/                   # Thin tool adapters and validated schemas
│   └── tests/
├── workers/                     # Canonical edge/compute worker packages
│   ├── data-ingestion/
│   ├── feature/
│   ├── gen-ai/
│   ├── backtest/
│   ├── tuning/
│   ├── risk/
│   ├── portfolio/
│   └── execution/               # Paper-only adapter until explicitly approved
├── shared/
│   ├── schemas/                 # Shared request/response contracts
│   ├── feast/                   # Feature definitions/store integration if used
│   └── supabase/
│       └── migrations/
├── infra/
│   ├── docker-compose.yml
│   ├── monitoring/
│   └── k8s/                     # Optional; do not deploy until configured
├── docs/
│   ├── architecture/
│   ├── runbooks/
│   └── decisions/
├── tests/                       # Cross-service contract and safety tests
├── .env.example                 # Names/placeholders only; never real secrets
└── README.md
```

## Service responsibilities and single-source-of-truth rules

| Component | Responsibility | Must not duplicate |
|---|---|---|
| MCP Server | Tool discovery, schema validation, orchestration, trace/correlation IDs | Market ingestion, risk formulas, broker execution logic |
| Data Ingestion Worker | Normalize market/news feeds and publish validated data | Feature calculations and strategy decisions |
| Feature Worker | Compute/version features and publish feature records | LLM prompts or order submission |
| Gen AI Strategy Worker | Produce explainable strategy candidates with model/version metadata | Final risk approval or direct order placement |
| Risk Worker | Validate limits, sizing, exposure, and kill-switch state | Portfolio persistence or broker transport |
| Portfolio Manager | Positions, allocation, P&L views and reconciliation | Recomputing market feeds |
| Backtest Worker | Historical simulations, metrics and reproducible run metadata | Live trading |
| Tuning Worker | Propose parameter changes from reviewed results | Automatically promoting unreviewed strategies |
| Execution Worker | Validate and route approved **paper-only** commands during integration | Strategy generation or risk policy |
| Supabase | Persistent application data, auth and RLS | Secrets embedded in frontend code |

## Migration rules

1. Keep current production/deployed paths intact while inventorying them.
2. Map each legacy directory to exactly one canonical owner before moving anything.
3. Consolidate duplicate MCP implementations only after comparing tools, callers, tests, and persistent data.
4. Move shared request/response definitions into `shared/schemas/`; version breaking changes.
5. Store secrets in Cloudflare/Vercel/Supabase secret settings as appropriate. Commit only `.env.example`.
6. Label simulated quotes, paper orders, and test telemetry explicitly; never present them as live broker data.
7. Require tests for auth/RLS, MCP tool contracts, risk gates, and paper-only execution before deployment.
8. Do not enable live trading, automatic strategy promotion, or unattended order execution as part of structural cleanup.

## Verification checklist

- [ ] Confirm actual local folder tree and Git branch/commit match.
- [ ] Inventory every worker and identify its deployed URL/name before consolidation.
- [ ] Confirm only one canonical MCP server is used by the selected frontend/workers.
- [ ] Confirm Cloudflare Worker bindings and secret *names* without printing secret values.
- [ ] Confirm Supabase migrations and RLS policies match application queries.
- [ ] Run frontend build, Python tests, worker tests, and cross-service contract tests.
- [ ] Verify Vercel Root Directory and build output against the selected frontend.
- [ ] Confirm Paper/Test mode and real execution disabled.
- [ ] Only then perform moves/removals and deploy.

## Current repository observation

The GitHub `main` tree currently contains many parallel top-level areas (for example `Dashboard/`, `VOOM_AI_Web/`, `backend/`, `Worker/`, `Cloudflare_API/`, `Supabase/`, `Research/`, and `nova/frontend/`). The canonical `frontend/`, `mcp-server/`, `workers/`, `infra/`, and `shared/` paths are not present at the repository root in the inspected Git tree. This differs from the previously reported local Windows layout, so local-vs-Git reconciliation is required before file moves or deletions.

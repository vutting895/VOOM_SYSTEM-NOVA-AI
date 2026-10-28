# VOOM_SYSTEM — NOVA (canonical repository)

**Canonical repository:** [vutting895/VOOM_SYSTEM-NOVA-AI](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI)  
**Production branch:** `main`  
**Consolidation:** migration branch imports unique material from the former `Voom_system` repository while preserving the original repository unchanged until verification is complete.

## What is canonical

- `frontend/`: canonical Next.js application and its UI routes. The checked-in CI runs typecheck/build from this directory.
- `integrations/remote-mcp-worker/`: authenticated Remote MCP Worker; do not confuse it with a local stdio knowledge server.
- `integrations/mt5-readonly-proxy/` and `integrations/mt5-readonly-bridge/`: the intended per-tenant, read-only MT5 path. They must reject unauthenticated private-account requests.
- `workers/`: market-data and research prototypes. These are not automatically production-grade model pipelines.
- `supabase/migrations/`: current NOVA migration directory. Historical migrations under `legacy/voom-system/Supabase/migrations/` are archived for comparison and must **not** be applied automatically.
- `tools/`: supported local bootstrap/runtime tooling.

## Links and migration map

- [NOVA target architecture](docs/architecture/nova-target-structure.md)
- [Repository consolidation and ownership map](MIGRATION_MAP.md)
- [Imported legacy inventory and deliberately retained external files](legacy/voom-system/IMPORT_INDEX.md)
- [Legacy integration status](legacy/voom-system/Docs/CURRENT_INTEGRATION_STATUS.md)
- [Legacy environment/deployment notes](legacy/voom-system/Docs/DEPLOYMENT_AND_ENV.md)
- [Legacy backtest harness documentation](legacy/voom-system/Backtest/README.md)
- [Legacy local MCP knowledge server notes](legacy/voom-system/Research/MCP_Server/README.md)

The `legacy/voom-system/` path is a **preserved source archive**, not a second production application. Its Dashboard, API, EA/bridge, Worker, local MCP server, and historical Supabase migrations have not been promoted to active service owners just because they are in this repository. Do not launch/deploy them without a separate reviewed migration.

## Hosting and link correctness

- The current frontend build workflow builds `frontend/`; the Cloudflare deployment workflow deploys backend Workers and does not deploy the Next.js frontend.
- The former workflow hard-coded `https://voomsystem.vercel.app`, which may be a legacy alias. It is replaced by the GitHub repository variable `VOOM_FRONTEND_URL`. Set that variable only to the verified HTTPS URL for the intended frontend; backend deployment must stop if it is missing or invalid.
- Do not assume a Cloudflare UI Worker or a responding legacy domain proves the latest NOVA UI is deployed. Verify the Vercel project/alias and authenticated UI/API routes before declaring a cutover complete.
- Build scripts for Cloudflare frontend cutover are available but do not switch hosting by themselves. Do not change the active host without checking deployment configuration and runtime routes.

## Environment and secret handling

Use the root `.env.example` as a names-only template. It contains placeholders, not credentials. Configure frontend-public variables in the intended frontend hosting project and backend-only secrets in the appropriate server/Worker environment. Never commit `.env`, service-role keys, OAuth client secrets, access tokens, broker credentials, or private tenant files. Never print secret values to chat or logs.

## Trading safety defaults

- Keep `TRADING_MODE=paper`, `LIVE_TRADING_ENABLED=false`, and `VOOM_LIVE_TRADING_ENABLED=false`.
- The MT5 connection remains read-only; do not send real trade orders during consolidation, CI, or smoke testing.
- An absent proxy URL or failed authenticated health check must show unavailable, not a connected account.
- Backtest inputs/results and ML examples are research evidence, not a guarantee of profitability or a production confidence score.
- Do not combine duplicate source-1 risk logic, local MCP logic, or old EA command paths into production without specific contract/security tests.

## Verification before removing a source/archive

The source repository `vutting895/Voom_system` remains unchanged for rollback and comparison. Only truly duplicate files may be deleted after content/hash, reference, deployment, and test checks pass. At inspection, the three same-path files (`README.md`, `.env.example`, `.gitignore`) differed in content; they were merged manually rather than treated as safe duplicates. Large historical market-data CSVs, compressed datasets, and export bundles are listed in the import index and are not yet copied. Keep the source repository until those exclusions and runtime/deployment dependencies are reviewed.

## Local frontend checks

Run from the repository root:
```powershell
Set-Location .\frontend
npm ci
npm run typecheck
npm run build
```

A local process start, passing CI, or HTTP status by itself is not proof of a broker connection or deployment parity. Keep Read-only + AI Analysis enabled and Live Trading OFF.

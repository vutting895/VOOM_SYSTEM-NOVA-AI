# NOVA AI — AI Context

## Repository identity
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Primary branch: `main`
- This document is repository context, not evidence of deployment or runtime health.

## Architecture observed in source
- Root application: React + TypeScript frontend, Vite build, Express server in `server.ts`.
- Additional services: Python FastAPI research worker and multiple Cloudflare Worker integrations.
- Root frontend calls same-origin `/api/*` routes.
- External runtime URLs and production base URLs must be confirmed from deployment configuration; do not infer them from local route declarations.

## Mandatory operating rules
1. Inspect the current `refs/heads/main` SHA before every repository task. Treat the current main tree as the source of truth.
2. Read the exact files and runtime paths in scope. Do not rely on stale chat summaries or invent files, endpoints, environment variables, or deployment status.
3. Keep all trading capabilities fail-closed:
   - `ordersEnabled=false`
   - `executionEnabled=false`
   - `liveTradingEnabled=false`
   - `mt5BridgeEnabled=false`
   - mode remains `read-only`
4. Never add broker order placement, modification, cancellation, withdrawal, transfer, or credential-intake capability.
5. Do not enable MT5 Bridge or Live Trading through frontend or backend toggles.
6. Do not claim training, backtest, model, market-feed, broker, Kaggle or cloud-runtime success without verifiable evidence.
7. Do not start Kaggle compute or any other cost-incurring job without a separately approved, tested cost/quota gate. Current Kaggle routes are intentionally unavailable.
8. Keep secrets out of source, docs, logs, browser storage, and commit messages. Use environment/secret management only after the approved runtime and access boundary are established.
9. Prefer a feature branch and pull request. Do not push unreviewed changes directly to `main`.
10. Run local checks before requesting merge. Report exact commands, results, and failures; never label an unrun check as passed.

## Current verified backend constraints
- Root Express Auto-Train endpoints return HTTP 503 with `TRAINING_RUNTIME_NOT_CONFIGURED`.
- Root broker status is intentionally unverified; the broker status GET is intercepted with HTTP 503.
- Trading mutation routes are blocked by fail-closed middleware.
- Kaggle status reports not configured; Kaggle search returns unavailable; Kaggle session trigger is forbidden.
- Market candlesticks use synthetic/demo generation; backtest handler is simulated. Neither is historical/OOS validation evidence.

## API contract
See [API_CONTRACT.md](./API_CONTRACT.md) for the source-based route inventory, observed response behavior, known unknowns, and security invariants. Values marked `[ต้องยืนยัน]` are intentionally unresolved.

## Change acceptance checklist
- [ ] Re-read current main SHA and compare with branch base.
- [ ] Confirm no trading invariant was weakened.
- [ ] Confirm no secrets or credential examples were introduced.
- [ ] Confirm API request paths/methods match frontend callers.
- [ ] Run `bun run lint` and `bun run build` (or the repository-supported equivalents).
- [ ] Review changed files and diff before opening/merging the PR.
- [ ] State clearly what is implemented, what is blocked, and what remains unverified.

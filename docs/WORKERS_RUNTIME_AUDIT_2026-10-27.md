# Workers Runtime Audit — 2026-10-27

## Scope and evidence

Reviewed the `main` branch of `vutting895/VOOM_SYSTEM-NOVA-AI` and the repository files listed below. This is a source-code/configuration audit, **not** a live Cloudflare account inspection or deployment verification.

## Findings

### 1. The eight folders under `workers/` are not eight deployed Cloudflare Workers

The repository README labels these as separate modules. Their own READMEs indicate that several are scaffolds or research prototypes:

| Folder | Source status | Next action |
| --- | --- | --- |
| `data-ingestion/` | Scaffold; adapters and contract tests pending | Implement schema validation, stale-data rejection, provenance, and tests before scheduling |
| `feature/` | ML/research prototypes; dependencies and leakage checks needed | Test modules independently; do not expose as production predictions yet |
| `gen-ai/` | Local Ollama-compatible adapter; output is a draft | Verify model availability and explicit fallback labeling |
| `backtest/` | Research module; results must be evidence-based | Verify deterministic historical-data tests, fees, spread, slippage, and look-ahead protections |
| `tuning/` | Prototype | Bound compute/parameter ranges and test for overfitting |
| `risk/` | Paper-risk policy | Add boundary and fail-closed tests |
| `portfolio/` | Allocation validator | Add validation and persistence tests |
| `execution/` | Intentionally disabled | Keep disabled; no live broker/exchange orders |

### 2. Existing Cloudflare Remote MCP Worker is the primary integrated endpoint

Source: `integrations/remote-mcp-worker/src/index.js`; deployment endpoint documented in `integrations/remote-mcp-worker/README.md`.

The source exposes an authenticated MCP endpoint, a health endpoint, public Binance candle reads, research backtests, SMC analysis, and paper-risk validation. It explicitly reports `liveTradingEnabled: false` and does not submit broker orders. MCP requests require a valid Supabase access token.

The README says deployment is managed independently. No Wrangler configuration file was found at the expected paths in this integration directory during this audit, so repository-driven redeployment is not yet reproducible from this directory alone. **Do not deploy from this branch until the active Worker settings/configuration are reconciled.**

### 3. Automation is only partially represented in CI

`.github/workflows/smc-research-ci.yml` runs Python compilation, focused SMC tests, and Worker SMC classification tests when relevant paths change. This does not establish that all eight worker modules are deployed or run automatically. No general deploy workflow was found by the targeted source search.

Cloudflare Cron Triggers require both a configured trigger and a `scheduled()` handler; simply having a folder or Worker script does not schedule it. See the official [Wrangler configuration documentation](https://developers.cloudflare.com/workers/wrangler/configuration/) and [Cron Triggers documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

### 4. Important research-validity limitation

The archived `integrations/nova-ai-mcp-full-clean` prototype README explicitly warns that its backtest/tuning metrics are random mock data and it is not production-ready. Do not use its generated scores as evidence of strategy performance.

## Ordered next steps

1. **Inventory live Cloudflare state (read-only):** compare the existing Worker names, deployed versions, routes, bindings, Cron Triggers, and last invocation/errors against the repository. Do not create duplicate Workers.
2. **Reconcile configuration:** obtain the active configuration for `voom-system-mcp` and the existing UI/API Workers. Add sanitized Wrangler config to the repo only after matching the live names, entrypoints, bindings, compatibility date, and routes. Keep secret values in Cloudflare Secrets, never in Git.
3. **Run local/CI checks:** run the existing SMC workflow tests, then add focused tests for MCP authentication, `tools/list`, each read-only tool, malformed market data, stale data, and paper-risk boundary cases.
4. **Verify endpoints without credentials:** GET the documented `/health` endpoints and confirm JSON/status; do not treat a browser page or a successful HTTP status alone as proof that authenticated MCP works.
5. **Verify authenticated MCP:** using a signed-in test session only, call `initialize`, `tools/list`, then read-only `tools/call` for status and market candles. Never paste tokens into chat or logs.
6. **Automate only proven safe tasks:** after the previous checks pass, add scheduled ingestion/health tasks with bounded frequency, retries, timeouts, and stale-data guards. Do not schedule training, tuning, or execution until resource use and data quality are tested.
7. **Keep execution disabled:** maintain Read-only + AI Analysis, Paper/Test only, and `executionEnabled=false`. No live trading or order-placement route is authorized by this audit.

## Acceptance criteria

- One clearly identified primary Cloudflare Worker per service; no duplicates created.
- Deployment configuration is reproducible and contains no secrets.
- CI tests pass and report real deterministic results, not mocked performance presented as real.
- Health checks and authenticated MCP smoke tests are recorded separately.
- Python prototypes are labelled as local modules until actually hosted and verified.
- Live order execution remains disabled.

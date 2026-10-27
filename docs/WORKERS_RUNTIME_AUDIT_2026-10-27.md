# Workers Runtime Audit — 2026-10-27

## Scope and evidence

Reviewed source files in `vutting895/VOOM_SYSTEM-NOVA-AI` and queried the connected Cloudflare account using read-only API calls on 2026-10-27. This is a configuration/runtime inventory, **not** an end-to-end authenticated UI or MCP smoke test. Direct outbound HTTP checks from this tool were blocked, so public endpoints still require a user/browser or approved runtime test.

## Live Cloudflare inventory

The account currently has these eight deployed scripts. Their deployed handlers are `fetch`; the Cron Trigger schedule API returned an empty schedule list for every script checked.

| Cloudflare script | Latest deployment observed (UTC) | Observability |
| --- | --- | --- |
| `smart-scalping-cloud-ai` | 2026-10-23 13:58 | Enabled |
| `voom-ai-private-chat` | 2026-10-23 18:17 | Not reported enabled |
| `voom-alpaca-oauth` | 2026-10-24 23:51 | Enabled |
| `voom-customer-portal` | 2026-10-23 21:55 | Enabled |
| `voom-system-api` | 2026-10-23 19:42 | Enabled |
| `voom-system-mcp` | 2026-10-26 06:26 | Not reported enabled |
| `voom-system-nova-ai` | 2026-10-24 14:15 | Enabled |
| `voom-system-nova-ui` | 2026-10-24 14:16 | Enabled |

Important interpretation:
- These are deployed **service scripts**, not evidence that all eight folders under repository `workers/` are deployed individually.
- No Cron Triggers were configured on the eight scripts at the time of inspection. They can still respond to HTTP requests, but scheduled/automatic background jobs are not configured through Cron Triggers.
- `voom-system-mcp` is the primary integrated research endpoint documented by the repository. Its current Cloudflare settings expose binding names `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; no secret values were read or recorded. The latter is a publishable key, not a service-role secret.
- The API Worker settings include `DASHBOARD_ORIGIN`, a KV binding named `DATA`, and a secret binding named `VOOM_BRIDGE_SHARED_SECRET`. Only binding names were inspected; secret values were not read.
- UI and API Workers have active deployments; the direct public HTTP check could not be completed from this tool because outbound requests were blocked. Do not label them end-to-end tested based on deployment metadata alone.

## Repository worker folders

The eight folders under `workers/` are not eight deployed Cloudflare Workers. Their own READMEs show that several are scaffolds or research prototypes:

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

## Existing integrated MCP Worker

Source: `integrations/remote-mcp-worker/src/index.js`; deployment endpoint documented in `integrations/remote-mcp-worker/README.md`.

The source exposes an authenticated MCP endpoint, a health endpoint, public Binance candle reads, research backtests, SMC analysis, and paper-risk validation. It explicitly reports `liveTradingEnabled: false` and does not submit broker orders. MCP requests require a valid Supabase access token.

The README says deployment is managed independently. No Wrangler configuration file was found at the expected paths in this integration directory during this audit, so repository-driven redeployment is not yet reproducible from this directory alone. **Do not deploy from this branch until the active Worker settings/configuration are reconciled.**

## Automation and research validity

- Cloudflare reported an empty Cron schedule list for all eight scripts inspected. The scripts therefore do not have Cron Trigger schedules configured at the time of inspection. A fetch handler alone does not make a service run continuously in the background.
- `.github/workflows/smc-research-ci.yml` runs Python compilation, focused SMC tests, and Worker SMC classification tests when relevant paths change. This does not establish that all eight worker modules are deployed or run automatically.
- The archived `integrations/nova-ai-mcp-full-clean` prototype README explicitly warns that its backtest/tuning metrics are random mock data and it is not production-ready. Do not use its generated scores as evidence of strategy performance.
- Cloudflare Cron Triggers require both a configured trigger and a `scheduled()` handler. See the official [Wrangler configuration documentation](https://developers.cloudflare.com/workers/wrangler/configuration/) and [Cron Triggers documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Ordered next steps

1. **Keep current deployments unchanged** while configuration and endpoint behavior are verified. Do not create duplicate Workers.
2. **Verify endpoints from a permitted client:** GET the documented `/health` endpoints and confirm HTTP status and JSON response. Direct outbound checks from this tool were blocked.
3. **Verify authenticated MCP:** using a signed-in test session only, call `initialize`, `tools/list`, then read-only `tools/call` for status and market candles. Never paste tokens into chat or logs.
4. **Reconcile configuration:** obtain the active configuration for `voom-system-mcp` and existing UI/API Workers. Add sanitized Wrangler config to the repo only after matching live names, entrypoints, bindings, compatibility dates, and routes. Keep secret values in Cloudflare Secrets, never in Git.
5. **Run and expand CI checks:** run the existing SMC workflow tests, then add focused tests for MCP authentication, `tools/list`, each read-only tool, malformed market data, stale data, and paper-risk boundary cases.
6. **Automate only proven safe tasks:** after the previous checks pass, add scheduled ingestion/health tasks with bounded frequency, retries, timeouts, and stale-data guards. Do not schedule training, tuning, or execution until resource use and data quality are tested.
7. **Keep execution disabled:** maintain Read-only + AI Analysis, Paper/Test only, and `executionEnabled=false`. No live trading or order-placement route is authorized by this audit.

## Acceptance criteria

- One clearly identified primary Cloudflare Worker per service; no duplicates created.
- Deployment configuration is reproducible and contains no secrets.
- CI tests pass and report real deterministic results, not mocked performance presented as real.
- Health checks and authenticated MCP smoke tests are recorded separately.
- Python prototypes are labelled as local modules until actually hosted and verified.
- Live order execution remains disabled.

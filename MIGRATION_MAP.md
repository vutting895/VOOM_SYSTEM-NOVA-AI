# VOOM_SYSTEM repository consolidation map

## Canonical owner by runtime responsibility

| Concern | Canonical path | What remains historical |
|---|---|---|
| Frontend UI | `frontend/` | `legacy/voom-system/Dashboard/`, `legacy/voom-system/VOOM_AI_Web/`, `legacy/voom-system/customer-portal/` |
| Authenticated Remote MCP endpoint | `integrations/remote-mcp-worker/` | `legacy/voom-system/Research/MCP_Server/` is local stdio/knowledge server, not a public endpoint |
| Read-only MT5 path | `integrations/mt5-readonly-proxy/`, `integrations/mt5-readonly-bridge/` | `legacy/voom-system/Python/`, `legacy/voom-system/EA/`, `legacy/voom-system/Worker/` are not automatically connected |
| NOVA AI Worker | `integrations/nova-ai-worker/` | `legacy/voom-system/Source1_Extracted/` is retained for source comparison |
| NOVA backend worker prototypes | `workers/` | `legacy/voom-system/Cloudflare_API/`, `legacy/voom-system/VOOM_AI_Web/`, `legacy/voom-system/api/`, `legacy/voom-system/backend/` |
| Active migration path | `supabase/migrations/` | `legacy/voom-system/Supabase/migrations/` must be reviewed against the deployed schema before any migration is moved/applied |
| Frontend deploy config | `frontend/package.json`, `.github/workflows/frontend-ci.yml` | `legacy/voom-system/vercel.json`, `legacy/voom-system/render.yaml`, `legacy/voom-system/Worker/` are legacy configs, not active deployment instructions |
| Backtest/research source | `workers/backtest/`, `workers/feature/`, `docs/DEEP_RESEARCH_AUTO_LEARNING_SMC.md` | `legacy/voom-system/Backtest/`, `legacy/voom-system/Reports/`, `legacy/voom-system/Research/` remain source/evidence only |

## Links and deployment rules

- Canonical repository: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI
- Original source repository, preserved unchanged: https://github.com/vutting895/Voom_system
- The frontend URL is not assumed from an old alias. Set repository variable `VOOM_FRONTEND_URL` to the verified HTTPS origin before the Cloudflare backend deploy workflow can run.
- Only `frontend/` is used for the checked-in Next.js CI build. Historical Vercel/Render/Worker configuration inside `legacy/voom-system/` is not active configuration.
- Do not expose `legacy/voom-system/Research/MCP_Server/` publicly; it is distinct from the Remote MCP endpoint.
- No real orders, live trading, or production strategy promotion are part of this consolidation.

## Removal criteria

No same-path source files were byte-identical to their target counterparts at initial comparison (the only shared names were `README.md`, `.env.example`, and `.gitignore`, all with different content). Therefore no files qualify for deletion solely as duplicates. Keep the original repository and all omitted large data/export files until the PR, tests, deployment/reference checks, and data retention review pass.

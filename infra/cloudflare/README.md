# VOOM_SYSTEM backend on Cloudflare

## Hosting boundary
- Customer-facing frontend: Netlify — https://voomsystem.netlify.app/
- Cloudflare is used for API, authentication-aware routing, the MT5 read-only proxy/relay, and the Remote MCP backend.
- The legacy `voom-system-nova-ui` Worker is not the current customer-facing frontend and must not be deployed by the production workflow.

## Backend Workers
- System Integration Hub: https://voom-system-hub.suwapat787.workers.dev
- Exness MT5 read-only proxy: https://voom-mt5-readonly-proxy.suwapat787.workers.dev
- MT5 bridge relay: https://voom-mt5-bridge-relay.suwapat787.workers.dev
- Remote MCP: https://voom-system-mcp.suwapat787.workers.dev
- NOVA AI Worker: https://voom-system-nova-ai.suwapat787.workers.dev
- AI strategy draft: `POST /api/gen-ai/generate` on the NOVA AI Worker
- Marketplace catalog: `GET /api/marketplace`
- OHLCV baseline only: `POST /api/backtest`

The frontend is configured with `NEXT_PUBLIC_SYSTEM_HUB_URL` and sends the signed-in user's Supabase access token to the System Hub. Active browser-facing Workers allow the exact Netlify origin; non-approved origins must not receive CORS access. The deployment workflow explicitly sets the System Hub `ALLOWED_ORIGINS` variable to the Netlify site.

The NOVA AI Worker uses the Cloudflare Workers AI binding with `@cf/meta/llama-3.2-3b-instruct`. Drafts are schema-validated and `executionEnabled` is always false. The backtest endpoint reports a buy-and-hold baseline only, not a strategy backtest.

The additional Meta AI artifact named Nova Mcp Complete was inspected as an archive. Its signed download endpoint returned 401 Unauthorized, so its file contents were not imported. Previously imported artifact files are in `artifacts/meta-ai-nova-mcp-all-workers/extracted/nova-mcp-package`.

## Safety and verification
- Read-only + AI Analysis; Live Trading and order submission remain OFF.
- A Worker health response proves backend availability only; it does not prove the Netlify UI or authenticated browser path is working.
- Verify the Netlify production route smoke test and real Supabase-session authorization before marking the frontend-to-broker path ready.

# VOOM_SYSTEM on Cloudflare

## Deployed Workers
- UI: https://voom-system-nova-ui.suwapat787.workers.dev
- API: https://voom-system-nova-ai.suwapat787.workers.dev
- API health: /health
- AI strategy draft: POST /api/gen-ai/generate
- Marketplace catalog: GET /api/marketplace
- OHLCV baseline only: POST /api/backtest

The API uses the Cloudflare Workers AI binding with @cf/meta/llama-3.2-3b-instruct. Drafts are schema-validated and executionEnabled is always false. Backtest endpoint reports a buy-and-hold baseline only, not strategy backtest.

The additional Meta AI artifact named Nova Mcp Complete was inspected as an archive. Its signed download endpoint returned 401 Unauthorized, so its file contents were not imported. Previously imported artifact files are in artifacts/meta-ai-nova-mcp-all-workers/extracted/nova-mcp-package.

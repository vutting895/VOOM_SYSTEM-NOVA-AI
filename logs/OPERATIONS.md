# NOVA Remote MCP Operations Log

Append-only integration history. Timestamps are UTC. Never record bearer tokens, Supabase secrets, Tunnel tokens, or private connection credentials.

## 2026-11-24 — NOVA-DATACENTER-001

- Actor: ChatGPT GitHub integration, acting on the repository owner's instruction to connect Datacenter through the existing NOVA API.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; all implementation writes were made on `main`.
- Datacenter repository: `vutting895/Datacenter`.
- NOVA main SHA before this log entry: `db4173af84dc7505e00bf281b6830e2b92b41250`.
- Changes:
  1. Added `integrations/remote-mcp-worker/src/datacenter-client.js` with fixed HTTPS `DATACENTER_MCP_URL` validation, stateless MCP initialize/notification/tool-call flow, bounded timeout, and forwarding of the signed-in user's existing Supabase Bearer session.
  2. Routed the Datacenter Learning tool group through the existing `voom-system-mcp` Gateway. No second NOVA Gateway or per-worker MCP server was created.
  3. Added `dataset_collect_mt5`, a read-only wrapper over the existing Exness MT5 Demo Bridge. It requests closed candles, excludes the still-forming candle, preserves source order and exact broker symbol casing, builds a typed UTC manifest, and forwards rows to Datacenter ingestion. It never approves the dataset.
  4. Updated tool catalog smoke checks to 41 tools and added Node tests for session forwarding, fixed endpoint rules, stateless MCP initialization, and closed-candle conversion.
  5. Updated the existing Cloudflare deployment workflow to pass the operator-controlled GitHub Actions variable `DATACENTER_MCP_URL` to the existing Worker when configured. The deployment smoke check verifies an unauthenticated Datacenter endpoint returns 401 when the variable is configured.
- Key code commits:
  - Client scaffold: `b4200552e8f78d96839818c0ce47b31b801f21b0`
  - Gateway tool routing: `f6b3ce221c975dcde716086886f52f532b7c4c4c`
  - MT5 ingestion adapter: `4b92e7f1b77a25bca8faf97866a79b7e90be6c39`
  - Latest Worker code/config commit before this log: `db4173af84dc7505e00bf281b6830e2b92b41250`
- Security invariants:
  - No caller-controlled upstream URL, owner ID, or tenant ID.
  - Original signed-in user session is forwarded and independently verified by Datacenter.
  - No Supabase service-role key or new shared service token.
  - MT5 source remains Demo/read-only; no order, position, withdrawal, transfer, or execution capability.
  - Missing Datacenter endpoint fails closed; no mock or local fallback.
- Validation: tests were added but the consolidated test run is deferred by owner instruction until the Datacenter host endpoint is provisioned and configured. No test PASS or production connection is claimed.
- Deployment state: Oracle Cloud VM and Cloudflare Tunnel hostname are not yet provisioned; `DATACENTER_MCP_URL` is not yet recorded as configured.
- Outcome: IN PROGRESS — code-level Gateway integration committed; hosted endpoint configuration and one final combined test run remain pending.

# NOVA Customer Command Center — implementation tracker

## Scope
Add a customer-specific, authenticated Zero-Menu Command Center at `/command-center` in the canonical `frontend/` Next.js application. The route is a split-view workspace: approximately 35% conversational control and 65% dynamic workspace. It hides global navigation while active and keeps a customer session identity in the header.

## Implemented in this slice
- Authenticated Supabase session gate; unauthenticated users are redirected to `/login`.
- Chat requests use the existing same-origin `/api/chat` route and bounded in-memory conversation history.
- AI intent metadata is reduced to the fixed `nova.intent.v1 / draft_strategy` contract. The browser does not render arbitrary model-supplied components or HTML.
- Durable strategy-draft review reuses the existing owner-scoped `/api/agent/threads`, thread approvals, and approval decision routes. The feature remains gated by `NEXT_PUBLIC_NOVA_APPROVALS_ENABLED`.
- Broker status is fetched for the authenticated customer via the existing MT5 Demo status API.
- Chart, equity, margin, and drawdown remain explicitly unavailable until a verified owner-scoped data source supplies them. No illustrative values are presented as live data.
- Activity panel labels its entries as local UI activity, not FastMCP/Worker server logs.
- Responsive layout collapses to one column on tablet/mobile.
- The command center is added to shared navigation but the navigation itself is hidden on the command-center route.

## Important integration gaps (not claimed complete)
1. Existing `/api/chat` is bounded request/response JSON, not AG-UI SSE streaming. LangGraph interrupt/resume is not wired into this route yet.
2. CopilotKit is not installed or configured in the current frontend package. The current fixed intent envelope is the security boundary; do not add dynamic component execution.
3. SMC chart is a verified-data placeholder. TradingView Lightweight Charts and OB/FVG overlays require a validated candle/annotation contract and dependency review.
4. RiskGauge currently shows unavailable values until the Integration Hub exposes owner-scoped equity, margin, and drawdown data with source timestamps.
5. Terminal panel is local UI activity only. Server-side sanitized event streaming from the approved Worker/MCP observability path remains future work.
6. MT5 status can still report pending provisioning where a per-customer Bridge route has not been allocated. Do not infer a connected account from a configured record.
7. Multi-broker aggregation (MT5, IBKR, Binance) is not implemented in this UI slice. Each adapter must prove provider identity, tenant ownership, and freshness before aggregation.

## Security invariants
- Supabase session is mandatory; server APIs independently verify the bearer token.
- Never trust a user ID, tenant ID, connection ID, or model-selected component as authorization.
- Keep all data reads server-side and owner-scoped; never expose broker credentials or provider secrets to the browser.
- Keep `ordersEnabled=false`, `executionEnabled=false`, broker mutation disabled, and Live Trading OFF.
- Do not present placeholder numbers, chart shapes, or client logs as real-time market/account/server data.

## Verification / definition of done
- [ ] Frontend CI typecheck and production build pass for this branch.
- [ ] Customer A cannot read Customer B's broker account, risk data, logs, threads, or approvals.
- [ ] Existing approval create/edit/reject flow passes against isolated staging Supabase with two test users.
- [ ] Verified Exness Demo account and quote/candle reads return source timestamps and are owner-scoped.
- [ ] AG-UI/SSE and LangGraph interrupt/resume contract is implemented and tested end-to-end before claiming streaming/HITL execution flow.
- [ ] Chart annotations and RiskGauge values are rendered only from validated server contracts.
- [ ] Server event stream is sanitized, tenant-scoped, rate-limited, and does not include tokens, credentials, or raw private payloads.
- [ ] Mobile/tablet visual and accessibility checks pass.
- [ ] Preview deployment is checked against the exact commit SHA before describing this route as deployed.

## Current safety status
Research and read-only UI only. Approval means approval of a stored strategy research draft, not authorization to place a trade. Live Trading remains OFF.

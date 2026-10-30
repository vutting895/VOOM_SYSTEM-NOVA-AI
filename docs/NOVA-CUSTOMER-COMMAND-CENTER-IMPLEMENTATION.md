# NOVA Customer Command Center — implementation tracker

## Scope
Add a customer-specific, authenticated Zero-Menu Command Center at `/command-center` in the canonical `frontend/` Next.js application. The route is a split-view workspace: approximately 35% conversational control and 65% dynamic workspace. It hides global navigation while active and keeps a customer session identity in the header.

## Implemented in this slice
- Authenticated Supabase session gate; unauthenticated users are redirected to `/login`.
- Chat requests use the existing same-origin `/api/chat` route and bounded in-memory conversation history.
- AI intent metadata is reduced to the fixed `nova.intent.v1 / draft_strategy` contract. The browser does not render arbitrary model-supplied components or HTML.
- Customer identity changes clear chat, approval, broker and local activity state; in-flight responses from the previous identity are discarded.
- Chat prompts are redacted server-side for bearer/basic auth, JWTs, common provider tokens, labeled credentials, URL query secrets and PEM private keys before Worker forwarding.
- Durable strategy-draft review reuses the existing owner-scoped `/api/agent/threads`, thread approvals, and approval decision routes. The feature remains gated by `NEXT_PUBLIC_NOVA_APPROVALS_ENABLED`.
- Broker status is fetched for the authenticated customer via the existing MT5 Demo status API.
- Chart, equity, margin, and drawdown remain explicitly unavailable until a verified owner-scoped data source supplies them. No illustrative values are presented as live data.
- Activity panel labels its entries as local UI activity, not FastMCP/Worker server logs.
- Responsive layout collapses to one column on tablet/mobile.
- The command center is added to shared navigation but the navigation itself is hidden on the command-center route.

## Staging and deployment work added
- Staging project `rovhmjeowracayicbqij` is isolated from production. Applied the existing `mt5_customer_connections` migration there so `broker_connections` and its owner-only RLS policies exist alongside the durable approval lifecycle.
- Added an exact-PR-SHA Cloudflare staging preview Worker (`voom-system-nova-ui-pr85-preview`) using only the staging Supabase project; disabled external AI/System Hub/proxy destinations on that preview. The existing `VOOM_SYSTEM_AUTH` Turnstile widget was extended by one hostname while preserving its existing allowlist.
- Added `tests/staging-customer-isolation.mjs` and a PR #85-only Frontend CI job that runs against the Cloudflare preview. It creates two temporary `system_test_only` Auth users, exercises the actual broker/thread/approval APIs against staging, attempts cross-user reads/writes/decisions, signs out and deletes both users, then verifies Auth users and owned rows are absent. It uses only the staging secrets and never prints their values. The job is currently blocked because the configured staging Auth Admin secret equals the publishable key.
- Added Cloudflare OpenNext build validation to Frontend CI and an exact-SHA staging preview deployment/smoke-test path. Updating the stable Cloudflare UI Worker from `main` is opt-in via `DEPLOY_CLOUDFLARE_FRONTEND_MAIN=true`; Netlify remains the public production host and DNS is unchanged.

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
- [ ] Frontend CI typecheck, Next.js production build and Cloudflare OpenNext build pass for the final PR head.
- [ ] Hosted two-customer staging acceptance job passes, including verified cleanup.
- [ ] Customer A cannot read Customer B's broker account, risk data, logs, threads, or approvals. Staging acceptance currently covers broker connections, threads and approvals; risk data is not served by this UI slice and activity logs are local-only.
- [ ] Existing approval create/edit/reject flow passes against isolated staging Supabase with two test users.
- [ ] Verified Exness Demo account and quote/candle reads return source timestamps and are owner-scoped.
- [ ] AG-UI/SSE and LangGraph interrupt/resume contract is implemented and tested end-to-end before claiming streaming/HITL execution flow.
- [ ] Chart annotations and RiskGauge values are rendered only from validated server contracts.
- [ ] Server event stream is sanitized, tenant-scoped, rate-limited, and does not include tokens, credentials, or raw private payloads.
- [ ] Mobile/tablet visual and accessibility checks pass.
- [ ] Netlify Preview and Cloudflare Worker validation are checked against the exact commit SHA before describing this route as deployed.

## Current safety status
Research and read-only UI only. Approval means approval of a stored strategy research draft, not authorization to place a trade. Live Trading remains OFF.

# NOVA Unified Frontend Direction

## Product decision

Use `frontend/` in `vutting895/VOOM_SYSTEM-NOVA-AI` as the single web application. Keep NOVA as the source of truth and place Dashboard, AI Chat, Markets, AI Analysis, Backtest, Learning Universe 16, Broker Hub, Marketplace, Login, and Profile behind one shared navigation and one application origin. Do not merge the entire Eve Chat repository; use it only as a UX reference where useful.

## Shared information architecture

- Dashboard: overview and entry points to the main capabilities.
- AI Chat: authenticated conversational research assistant.
- Markets: verified market-data state; never label placeholders as live prices.
- AI Analysis: strategy-draft workflow.
- Backtest: clearly label the present OHLC buy-and-hold calculation as a baseline, not a strategy backtest.
- Learning Universe 16: research roadmap and auto-learning lifecycle.
- Broker Hub: connection status only; keep the MT5 bridge read-only.
- Marketplace: strategy templates.
- Profile/Login: existing Supabase Auth flow.

Every route should use a shared navigation component from the root layout. Route content may keep its own domain-specific panels, but it must not create a competing site navigation.

## AI Chat first implementation

- Authenticate in the browser for UX and re-verify the bearer token on the server and AI Worker.
- Keep the model call server-side through the NOVA AI Worker and its Cloudflare Workers AI binding.
- Send only a bounded recent conversation (up to eight user/assistant messages) and cap each message.
- Show provider failures honestly; do not fabricate a model response or claim the model accessed live prices, private broker data, MCP tools, or external sources.
- The initial implementation keeps conversation history in page memory only. Do not persist chat transcripts until retention, privacy, and user-isolation behavior have been reviewed.
- Do not accept broker passwords, API secrets, or authentication credentials in chat.
- There is no order tool or order route in chat. Execution flags must remain false and Live Trading stays OFF.

## Security and deployment constraints

- Supabase session verification is mandatory before private AI calls; missing configuration fails closed.
- Browser calls go to same-origin Next.js API routes. Those routes forward authenticated requests to Cloudflare server-to-server.
- Never expose Cloudflare bindings/secrets to client code, commit secret values, or log bearer tokens or chat contents.
- Keep Vercel as the Next.js frontend host and Cloudflare Workers as backend services. Do not change domains or cut over hosting as part of a UI-only PR.
- Preserve existing routes and domain logic while introducing shared navigation. Do not delete old project files or the separate Eve Chat project.
- Keep Read-only + AI Analysis active. Live Trading and order submission remain disabled.

## Verification checklist

1. Frontend typecheck and production build.
2. AI Worker authentication, request-boundary, response-validation, and no-execution tests.
3. No-login requests to the chat API are rejected.
4. No AI provider/binding produces an explicit unavailable response rather than a fake answer.
5. Existing markets, strategy-draft, broker, learning and marketplace routes remain present.
6. Confirm the Preview URL and deployment version before describing the UI as deployed or production-ready.

## Current limitations to communicate

- Chat is not a broker controller and does not send orders.
- A chat response is not proof of a live market feed or account connection.
- Backtest baseline metrics are not predictive and do not include fees, spreads, slippage, funding, or latency.
- Chat history is currently session/page-memory only and is lost on refresh.

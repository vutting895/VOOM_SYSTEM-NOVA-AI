# NOVA AI Worker — authenticated research interface

This folder is the source of truth for the deployed `voom-system-nova-ai` Cloudflare Worker.

## Security contract
- `GET /health` is public and exposes only service/binding readiness flags.
- Every other supported route requires a valid Supabase access token in `Authorization: Bearer …`; the Worker verifies it through Supabase Auth `/auth/v1/user`.
- Browser CORS allows only the NOVA UI origin. CORS is not treated as authentication.
- JSON requests are size-limited and validated. Unknown routes, including order routes, are rejected.
- Generated strategies are research drafts only; `executionEnabled` and `liveTradingEnabled` remain false.

## Runtime configuration
The deployment workflow passes the existing GitHub Actions values `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Worker as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public Supabase project settings, not service-role credentials. Never configure a service-role key here. Gemini text generation reads `GEMINI_API_KEY` from a Cloudflare Worker secret binding; it must be a Google AI Studio Authorization Key restricted to the Gemini API. Do not place it in GitHub, source files, browser variables, or logs.

## Gemini provider
- Chat and strategy generation use the server-side Gemini Developer API (`gemini-3.8-flash`) through the `x-goog-api-key` header.
- The key is read only from the Cloudflare secret binding `GEMINI_API_KEY`; `/health` exposes only a boolean readiness flag, never the value.
- The Worker makes one bounded request with a 20-second timeout and does not automatically fall back to a second LLM provider. Strategy generation may return an explicitly labelled deterministic rule-based draft if Gemini is not configured or unavailable; chat fails closed with HTTP 503.
- Before enabling production use, verify in Google AI Studio that the bound key is an Authorization Key (not Standard), restricted to the Gemini API, then run a non-sensitive live smoke test. The existence of a Cloudflare secret binding alone does not prove its key type or validity.

## Local test
Run `npm test` from this directory with Node.js 22+. Tests mock both Supabase Auth and Gemini API responses; they do not use production credentials or place orders.

## Deploy
The dedicated GitHub Actions workflow deploys this Worker only when this folder changes on main. Cloudflare AI binding is declared in `wrangler.toml`. The frontend API route forwards the authenticated user's access token to this Worker; it must never forward an unauthenticated request.


## Authenticated Chat and Zero-Menu intent contract

- `POST /api/chat` requires an authenticated Supabase bearer session. It accepts only bounded user/assistant messages; it does not accept system-role messages or any order/execution tool.
- Worker responses include a `nova.intent.v1` data-only envelope classified for research and validated by the API route before it reaches the browser.
- The shared schema is `shared/nova-intent-envelope.schema.json`; the allow-listed renderer is `frontend/components/intent-result.jsx`. No model-generated HTML/JavaScript is evaluated.
- This first pass is deterministic and research-only. It does not yet connect MCP tools, persist conversation threads, or implement LangGraph checkpoint/approval/resume.
- Live Trading, order submission and broker mutations remain disabled.

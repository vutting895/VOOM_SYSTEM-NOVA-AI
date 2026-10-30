# NOVA AI Worker — authenticated research interface

This folder is the source of truth for the deployed `voom-system-nova-ai` Cloudflare Worker.

## Security contract
- `GET /health` is public and exposes only service/binding readiness flags.
- Every other supported route requires a valid Supabase access token in `Authorization: Bearer …`; the Worker verifies it through Supabase Auth `/auth/v1/user`.
- Browser CORS allows only the NOVA UI origin. CORS is not treated as authentication.
- JSON requests are size-limited and validated. Unknown routes, including order routes, are rejected.
- Generated strategies are research drafts only; `executionEnabled` and `liveTradingEnabled` remain false.

## Runtime configuration
The deployment workflow passes the existing GitHub Actions values `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Worker as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public Supabase project settings, not service-role credentials. Never configure a service-role key here.

## Local test
Run `npm test` from this directory with Node.js 22+. Tests mock the Supabase Auth response; they do not use production credentials or place orders.

## Deploy
The dedicated GitHub Actions workflow deploys this Worker only when this folder changes on main. Cloudflare AI binding is declared in `wrangler.toml`. The frontend API route forwards the authenticated user's access token to this Worker; it must never forward an unauthenticated request.


## Authenticated Chat and Zero-Menu intent contract

- `POST /api/chat` requires an authenticated Supabase bearer session. It accepts only bounded user/assistant messages; it does not accept system-role messages or any order/execution tool.
- Worker responses include a `nova.intent.v1` data-only envelope classified for research and validated by the API route before it reaches the browser.
- The shared schema is `shared/nova-intent-envelope.schema.json`; the allow-listed renderer is `frontend/components/intent-result.jsx`. No model-generated HTML/JavaScript is evaluated.
- This first pass is deterministic and research-only. It does not yet connect MCP tools, persist conversation threads, or implement LangGraph checkpoint/approval/resume.
- Live Trading, order submission and broker mutations remain disabled.

## Google Gemini provider

- Gemini is preferred when the Worker secret `GEMINI_API_KEY` is configured. Optional non-secret `GEMINI_MODEL` selects a supported model; default: `gemini-flash-latest`.
- Requests use the Gemini Interactions API from the Worker only, with the key in the `x-goog-api-key` header. The key is never placed in a URL, response, browser bundle, or logs.
- Gemini receives bounded chat text or validated strategy input only. No tools/function calling, broker credentials, private account data, or order capabilities are provided.
- If Gemini is not configured, the existing Cloudflare Workers AI path remains active. If Gemini is configured but fails, chat returns 503 without silent provider switching; strategy generation returns a clearly labelled, non-executable rule-based fallback.
- Configure with `npx wrangler secret put GEMINI_API_KEY` from this directory. Do not commit the value. Set `GEMINI_MODEL` as a non-secret Worker variable only if needed.
- `GET /health` reports only whether the Gemini secret is configured, never its value.

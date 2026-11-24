# NOVA AI Worker — authenticated research interface

This folder is the source of truth for the deployed `voom-system-nova-ai` Cloudflare Worker.

## Security contract
- `GET /health` is public and exposes only service/binding and boolean provider-readiness flags.
- Every other supported route requires a valid Supabase access token in `Authorization: Bearer …`; the Worker verifies it through Supabase Auth `/auth/v1/user`.
- Browser CORS allows only the NOVA UI origin. CORS is not treated as authentication.
- JSON requests are size-limited and validated. Unknown routes, including order routes, are rejected.
- Generated strategies are research drafts only; `executionEnabled` and `liveTradingEnabled` remain false.

## Provider gateway

`provider-gateway.js` is the only AI provider dispatch layer used by authenticated chat and strategy draft generation.

Default order:
1. Gemini 3.8 Flash is the primary provider when `GEMINI_API_KEY` is configured (override with the non-secret `GEMINI_MODEL` setting).
2. Cloudflare Workers AI is the explicit fallback when Gemini is missing, fails, or returns invalid output.
3. OpenAI and Anthropic are optional server-selected adapters. Set the non-secret Worker variable `NOVA_AI_PROVIDER=openai` or `NOVA_AI_PROVIDER=anthropic` to select one as the primary for a controlled evaluation; failures fall back to Cloudflare AI. They are never silently tried as a fallback and are not browser-selectable.

Provider model overrides are non-secret Worker variables: `GEMINI_MODEL`, `OPENAI_MODEL`, and `ANTHROPIC_MODEL`. Defaults are defined in `provider-gateway.js` and should be reviewed against provider model lifecycle documentation before production activation.

## Secret custody — important distinction

Platform AI keys are deployment-level Cloudflare Worker Secrets, not customer credentials:
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Provision each key only in the Cloudflare Worker secret store (for example, `npx wrangler secret put OPENAI_API_KEY` from this directory). Never put key values in Git, GitHub Actions variables, `.env.example`, Netlify, frontend `NEXT_PUBLIC_*` variables, prompts, logs, URLs, responses, or chat.

The Supabase customer Vault is a separate system for future customer-owned provider credentials. Its runtime access remains blocked by the current Vault readiness gate until the dedicated role, trusted System Hub identity assertion, least-privilege and two-user isolation checks pass. The AI Worker does not read or write customer Vault secrets and does not accept credential material from requests. This gateway is therefore ready to consume platform Worker Secrets, but is not evidence that the customer Vault has been activated.

## Provider request controls
- Provider calls run server-side with fixed HTTPS endpoints, bounded messages, a 20-second timeout, redirect rejection, and no tools/function calling.
- Credential-like content is redacted again inside the Worker provider gateway; frontend redaction is only defense-in-depth.
- Chat and strategy generation require the authenticated-user Cloudflare rate-limit binding (30 requests / 60 seconds). Missing or failing limiter configuration blocks billable model calls; Cloudflare's limiter is approximate and provider-side spend controls remain required.
- Gemini sends the key in `x-goog-api-key`; OpenAI sends it in the Authorization header; Anthropic sends it in `x-api-key`.
- Provider errors are reduced to fixed internal error codes. Provider response bodies and keys are not logged or returned.
- Responses include the actual provider/model and `fallbackFrom` provenance, never credentials.
- The worker passes no broker credentials, account data, order tools, or execution capability to providers.
- Provider-side quotas and spend limits must be configured independently; Worker availability flags are not a spend control.

## Runtime configuration
The deployment workflow passes the existing GitHub Actions values `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the Worker as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These are public Supabase project settings, not service-role credentials. Never configure a service-role key here.

## Local test
Run `npm test` from this directory with Node.js 22+. Provider tests mock all HTTP calls and Worker AI; they do not use production credentials or place orders.

## Deploy
The dedicated GitHub Actions workflow deploys this Worker only when this folder changes on main. Cloudflare AI binding is declared in `wrangler.toml`. The frontend API route forwards the authenticated user's access token to this Worker; it must never forward an unauthenticated request.

## Authenticated Chat and Zero-Menu intent contract
- `POST /api/chat` requires an authenticated Supabase bearer session. It accepts only bounded user/assistant messages; it does not accept system-role messages or any order/execution tool.
- Worker responses include a `nova.intent.v1` data-only envelope classified for research and validated by the API route before it reaches the browser.
- The shared schema is `shared/nova-intent-envelope.schema.json`; the allow-listed renderer is `frontend/components/intent-result.jsx`. No model-generated HTML/JavaScript is evaluated.
- This first pass is deterministic and research-only. It does not yet connect MCP tools, persist conversation threads, or implement LangGraph checkpoint/approval/resume.
- Live Trading, order submission and broker mutations remain disabled.

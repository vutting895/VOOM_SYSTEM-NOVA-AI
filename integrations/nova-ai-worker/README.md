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


## Multi-provider research chat (free-tier guarded)

The authenticated `POST /api/chat` route uses this provider order:

1. Gemini Developer API (Primary)
2. Cloudflare Workers AI (Fallback 1)
3. Groq API (Fallback 2)

A provider is not eligible merely because a key or binding exists. Each provider also requires an explicit free-tier confirmation variable:

- `GEMINI_API_KEY` and `GEMINI_FREE_TIER_CONFIRMED=true`
- Cloudflare `AI` binding and `CLOUDFLARE_AI_FREE_TIER_CONFIRMED=true`
- `GROQ_API_KEY` and `GROQ_FREE_TIER_CONFIRMED=true`

The confirmation flags are operational assertions, not automated billing verification. Before enabling one, the account owner must verify the provider account's plan, billing settings, model eligibility, and current quotas. Do not enable a provider if usage can spill into paid billing. Provider keys must be configured only as Cloudflare Worker secrets; never commit them or place them in frontend variables.

The router permits at most three provider attempts per chat request. It advances only after retryable failures (network/timeout, 5xx, or 429). Provider authentication/configuration failures and request/safety rejections fail closed. The authenticated `GET /api/status` endpoint returns configuration booleans and the provider order, never secret values.

Default model candidates are configurable with `GEMINI_MODEL`, `CLOUDFLARE_AI_MODEL`, and `GROQ_MODEL`. Model availability and free quotas must be verified against the provider account before enabling.

This implementation does not verify billing plans, maintain daily quota ledgers, guarantee zero cost, persist chat memory, or deploy itself. Production rollout remains blocked pending code review, CI evidence, account-level free-tier verification, and separate deployment approval.

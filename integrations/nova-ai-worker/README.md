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

## Auto Flow draft endpoint

- `POST /api/workflows/draft` requires a verified Supabase bearer session and accepts only `{"prompt":"..."}` (maximum 1,200 characters).
- The existing Cloudflare Workers AI binding generates a data-only `nova.workflow.v1` proposal. Every result is validated against the server-owned node registry and graph validator before return.
- This endpoint does not persist or execute workflows. Unsupported node types or invalid graphs are rejected; unavailable AI fails closed.
- External effects, broker writes, order submission and Live Trading remain disabled.


## Deterministic draft simulator

The workflow contract exports \`simulateWorkflowDraft(draft, sampleData)\` for local, in-memory preview only. It revalidates input and emits a stable trace/output without persistence, schedules, provider calls, external effects, or broker actions. It is not a workflow runtime or production data connector.


- Workflow prompt and model-generated text fields pass through credential-pattern redaction before AI submission/return. Do not enter secrets; redaction is defense-in-depth and is not exhaustive.

# NOVA AI Worker — authenticated research interface

This folder is the source of truth for the NOVA AI Worker.

## Security contract
- `GET /health` is public and exposes only service/binding readiness flags.
- `GET /diagnostics/supabase-auth` is a public, read-only connectivity probe. It calls the fixed Supabase Auth `/auth/v1/settings` endpoint with the Worker-bound publishable key and returns only a sanitized status/result; it never returns provider response bodies, keys, tokens, or user data. This does not verify user login or JWT refresh.
- Every other supported route requires a valid Supabase access token in `Authorization: Bearer …`; the Worker verifies it through Supabase Auth `/auth/v1/user`.
- Browser CORS allows only the explicitly configured NOVA UI origins. CORS is not treated as authentication.
- JSON requests are size-limited and validated. Unknown routes, including order routes, are rejected.
- Generated strategies are research drafts only; `executionEnabled` and `liveTradingEnabled` remain false.

## Runtime configuration
The Worker receives `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as deployment variables. These must be Supabase project URL and publishable/anon key only. Never configure a service-role key.

## Local test
Run `npm test` from this directory with Node.js 22+. Tests mock Supabase Auth; they do not use production credentials or place orders.

## Environments and deployment
- Production worker: `voom-system-nova-ai`. The existing production workflow remains restricted to pushes on `main`; do not use it for staging.
- Staging worker: `voom-system-nova-ai-staging`, configured under Wrangler `env.staging`. Its AI binding and observability are declared explicitly because Wrangler environments do not implicitly inherit all bindings.
- The staging-only workflow runs only for pushes to `fix/staging-supabase-auth-diagnostic-20261127` or manual dispatch. It deploys with `wrangler deploy --env staging` and uses GitHub Environment `nova-staging`.
- Configure these secrets in GitHub Settings → Environments → `nova-staging`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_STAGING_URL`, and `SUPABASE_STAGING_PUBLISHABLE_KEY`. They must belong to the staging Cloudflare account/zone and a non-production Supabase project. Do not copy production credentials into this environment.
- The workflow runs the complete Node test suite before deployment, then checks staging health, Supabase Auth diagnostic reachability, and unauthenticated API rejection.
- No Production deployment, Main update, database migration, order submission, broker mutation, or trading execution is part of this staging workflow.

## Authenticated Chat and intent contract
- `POST /api/chat` requires a valid Supabase bearer session. It accepts bounded user/assistant messages only; no system-role message or order/execution tool is accepted.
- Worker responses include a `nova.intent.v1` data-only envelope classified for research and validated by the API route before it reaches the browser.
- The renderer is allow-listed; model-generated HTML/JavaScript is never evaluated.
- This first pass does not connect MCP tools, persist conversation threads, or implement LangGraph checkpoint/approval/resume.
- Live Trading, order submission and broker mutations remain disabled.

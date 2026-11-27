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
The Worker receives `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as Worker-bound variables. Use only a Supabase project URL and publishable/anon key; never configure a service-role key.

## Local test
Run `npm test` from this directory with Node.js 22+. Tests mock Supabase Auth; they do not use production credentials or place orders.

## Environments and deployment
- Production Worker: `voom-system-nova-ai`. The existing production workflow remains restricted to pushes on `main`; do not use it for staging.
- Staging Worker: `voom-system-nova-ai-staging`, configured under Wrangler `env.staging`. Its AI binding and observability are declared explicitly because Wrangler environments do not implicitly inherit all bindings.
- The staging-only GitHub Actions workflow runs only for pushes to `fix/staging-supabase-auth-diagnostic-20261127` or manual dispatch. It deploys with `wrangler deploy --env staging --keep-vars`.
- GitHub Environment `nova-staging` requires only `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The workflow preserves the existing isolated Staging Worker's `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` bindings with `--keep-vars`; it does not read `SUPABASE_STAGING_URL` or `SUPABASE_STAGING_PUBLISHABLE_KEY` GitHub secrets and must never inject Production credentials.
- The Staging Worker bindings must be provisioned and verified directly in the isolated Cloudflare Staging Worker before deployment. Use a non-production Supabase project and a publishable/anon key only.
- GitHub Actions runs the full Node test suite before deployment, then checks Staging health, Supabase Auth diagnostic reachability, and unauthenticated API rejection.
- CircleCI runs the same local Node test suite as a separate CI validation only; it does not deploy or access secrets.
- No Production deployment, Main update, database migration, order submission, broker mutation, or trading execution is part of this Staging workflow.

## Authenticated Chat and intent contract
- `POST /api/chat` requires a valid Supabase bearer session. It accepts bounded user/assistant messages only; no system-role message or order/execution tool is accepted.
- Worker responses include a `nova.intent.v1` data-only envelope classified for research and validated by the API route before it reaches the browser.
- The renderer is allow-listed; model-generated HTML/JavaScript is never evaluated.
- This first pass does not connect MCP tools, persist conversation threads, or implement LangGraph checkpoint/approval/resume.
- Live Trading, order submission and broker mutations remain disabled.

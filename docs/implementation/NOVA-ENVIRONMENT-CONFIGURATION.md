# NOVA environment configuration and secret placement

**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Baseline inspected:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Reviewed:** 2026-10-31

This guide maps the proposed environment variables to the runtime that actually consumes them. A variable name in an example does not activate an integration. Do not put real values in Git, chat, issue comments, logs, frontend bundles or shared environment files.

## Files

| File | Purpose |
|---|---|
| Repository-root `.env.example` | Non-secret defaults for the local Ollama-compatible research prototype |
| `frontend/.env.example` | Public Next.js settings for local frontend development |
| Netlify site settings | Production `NEXT_PUBLIC_*` frontend configuration |
| GitHub Actions / Cloudflare Worker settings | Worker deployment configuration and Worker-only secrets |
| `%LOCALAPPDATA%\VOOM_SYSTEM\secrets\` | Tenant-specific Windows MT5 Bridge files; never commit |

## Supabase

| Proposed name | Correct placement / name | Status |
|---|---|---|
| `SUPABASE_URL` | Worker runtime variable `SUPABASE_URL`; frontend uses `NEXT_PUBLIC_SUPABASE_URL` | Used |
| `SUPABASE_KEY` | Do not use this ambiguous alias. Frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`; Workers use `SUPABASE_PUBLISHABLE_KEY` | Used with publishable/anon key only |
| Service-role key | Never use in frontend, browser, ordinary Worker auth, or a shared `.env` | Restricted test/administrative use only, separately gated |

The publishable/legacy anon key is intentionally public and is not a substitute for authorization; Supabase Auth sessions and RLS enforce user access. Never place a Supabase `service_role` or secret key in a `NEXT_PUBLIC_*` variable.

## AI provider keys

| Proposed name | Current runtime | Status |
|---|---|---|
| `GOOGLE_API_KEY` | No Gemini API client currently reads this variable. The active NOVA AI Worker uses the Cloudflare Workers AI binding `AI` | Not consumed; Gemini provider integration remains a separate code/CI task |
| `ANTHROPIC_API_KEY` | No current service reads it | Not consumed |
| `OPENAI_API_KEY` | No current service reads it | Not consumed |

Do not set these keys in the shared root `.env` or expose them to the browser. The desired Gemini-primary / Cloudflare-AI-fallback design is not activated by adding a key alone; it requires a reviewed server-side provider adapter, timeout/fallback behavior, output validation, secret redaction, tests and a Worker deployment.

## Database

| Proposed name | Current status |
|---|---|
| `DATABASE_URL` | No current frontend/Worker runtime consumes a direct PostgreSQL URL or declares a Hyperdrive binding for this purpose. Do not place it in frontend configuration. |

The current application uses Supabase Auth and the Supabase API with the publishable/anon key and user session. A future direct PostgreSQL connection must be server-only and introduced with an explicitly reviewed Hyperdrive/database boundary; it must not bypass RLS or tenant ownership checks.

## Broker credentials and endpoints

| Proposed name | Current status / correct boundary |
|---|---|
| `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` | Not read by the current Bridge. The Windows Bridge reads an MT5 terminal session already logged in to Exness Demo; do not pass broker login/password through a shared `.env`. |
| `MT5_TENANT_ID`, `MT5_BRIDGE_TOKEN` | Private per-tenant Bridge process values, loaded from the local Windows secrets folder by `run-bridge.ps1`. The matching route is stored in Cloudflare secret `MT5_TENANT_ROUTES`. Never use one global token. |
| `IBKR_HOST`, `IBKR_PORT` | No active IBKR adapter consumes them. `127.0.0.1` would identify the adapter host itself; customer Gateway/TWS access requires a separately reviewed local connector/runtime. |
| `BINANCE_API_KEY`, `BINANCE_SECRET_KEY` | No current private Binance account path consumes these names. The existing broker status route intentionally reports private Binance/Bybit account checks as unavailable/blocked. |
| `BINANCE_API_SECRET` | Legacy placeholder removed from the root template; not consumed by the current broker status route. |

Customer-owned API credentials for future providers remain blocked until the dedicated Supabase Vault role/access path, trusted owner binding, privilege review, rotation/revocation and two-customer staging isolation tests pass. Exness MT5 terminal/Bridge credentials remain outside that customer Vault.

## Active frontend settings

Use `frontend/.env.local` for local development, based on `frontend/.env.example`. Set the same required public names in Netlify site settings for production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — publishable/anon only
- `NEXT_PUBLIC_SYSTEM_HUB_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

The Cloudflare deployment workflow maps the existing Supabase project URL and publishable key to Worker runtime names `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Keep Cloudflare Worker secrets at the Worker that consumes them.

## Safety invariants

- Exness Demo / read-only account reads only.
- `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- Never store credentials in Git or frontend configuration.
- Never claim an integration is enabled merely because its environment variable exists.

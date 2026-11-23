# NOVA AI Command Center

Responsive (mobile-first, installable) console for system operations and **read-only** trading intelligence.

## Safety posture
- LIVE TRADING **OFF**, BROKER WRITES **OFF** — frozen constants in `src/lib/nova/safety.ts`, covered by tests.
- No order, withdrawal, transfer or account-mutation code paths. The System Hub API client is GET-only and blocks trading paths.
- AI Chat uses a separate fixed `POST /api/chat` endpoint on the authenticated NOVA AI Worker; it accepts only the current user's bounded user/assistant messages.
- Chat is research-only. It cannot access broker credentials, submit orders, or claim live market/account data that was not supplied with verified provenance.
- All trading data is labeled **DEMO** until an authenticated read-only MT5 bridge is connected.
- Missing auth / API / role ⇒ access denied or "Not connected" (fail closed).
- Emergency stop only reports "request not connected" until a backend endpoint confirms; it never claims to stop broker execution.

## Stack
TanStack Start (React 19, Vite, TypeScript), Tailwind v4, shadcn/ui, Supabase Auth (email/password, PKCE, persistent session, auto refresh). No Lovable Cloud dependency.

## Config
See `.env.example`. Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_NOVA_API_BASE_URL`, and the public `VITE_NOVA_CHAT_API_BASE_URL` are read. Never put secrets in `VITE_*`.

## Chat boundary
- The browser obtains the current Supabase access token and sends it only to the fixed NOVA AI Worker `POST /api/chat`; the Worker verifies it with Supabase Auth before invoking Cloudflare Workers AI.
- The client sends at most 8 recent messages, 1,200 characters per message and 8,000 total characters.
- Conversation history remains in page memory only and is lost on refresh; there is no transcript persistence.
- Chat provider health is read from the Worker's public `GET /health` endpoint.
- Chat output is advisory research only. No MCP tools, verified live market feed, broker mutation, order submission, or autonomous execution is exposed.

## Roles
Admin / Operator / Viewer from `app_metadata.nova_role` in the signed JWT. The UI uses it for visibility only; the Worker enforces it.

## Modules
Overview · AI Assistant · Trading (DEMO) · MT5 Bridge · Risk Center · Approvals · Users & Roles · Audit Logs · Settings.

## Docs
- `docs/worker-api-contract.md` — Cloudflare Worker API contract
- `docs/deployment.md` — local dev, build, deploy, rollback, Supabase steps
- `docs/mobile-packaging.md` — Android/iOS path (not shipped)
- `supabase/migrations/*_DRAFT.sql` — isolated `nova` schema, **review & apply manually**

## Scripts
`bun run dev` · `bun run test` · `bun run build`
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
- The browser obtains the current Supabase access token and sends it only to the fixed NOVA AI Worker `POST /api/chat`; the Worker verifies it with Supabase Auth before invoking Gemini 3.8 Flash as primary when configured, with Cloudflare Workers AI as fallback.
- Gemini free-tier requests are quota-limited and may be used by Google to improve its products. Do not submit credentials or confidential customer data.
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

## Netlify deployment

- The Netlify site build target is `apps/nova-command-center`; the official `@netlify/vite-plugin-tanstack-start` adapter deploys SSR, server routes, and server functions. The client bundle is published from `dist/client`.
- The Netlify build maps the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SYSTEM_HUB_URL` build variables into the app's `VITE_*` config. The Supabase URL must match the AI Worker's auth project.
- Never map service-role keys, provider keys, broker credentials, or other secrets into `VITE_*`; those values would be browser-visible.
- This changes the Netlify production build target from the repository-root Vite app to NOVA Command Center when merged. Keep the PR Draft until its Deploy Preview, authenticated E2E, and the intended production-site replacement are explicitly accepted.

## Session and destination isolation

- Protected React Query keys include the authenticated Supabase user ID.
- The AuthProvider clears query and mutation caches whenever the authenticated identity changes or signs out; token refresh for the same user does not clear the cache.
- The Assistant page resets its in-memory conversation and ignores responses from requests started under a previous identity.
- Supabase, System Hub, and AI Worker URLs are restricted to exact production origins. Local development is limited to explicit localhost ports.

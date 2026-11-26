# NOVA AI Command Center

Responsive (mobile-first, installable) console for system operations and **read-only** trading intelligence.

## Safety posture

- LIVE TRADING **OFF**, BROKER WRITES **OFF** — frozen constants in `src/lib/nova/safety.ts`, covered by tests.
- No order, withdrawal, transfer or account-mutation code paths. The API client is GET-only and blocks trading paths.
- All trading data is labeled **DEMO** until an authenticated read-only MT5 bridge is connected.
- Missing auth / API / role ⇒ access denied or "Not connected" (fail closed).
- Emergency stop only reports "request not connected" until a backend endpoint confirms; it never claims to stop broker execution.

## Stack

TanStack Start (React 19, Vite, TypeScript), Tailwind v4, shadcn/ui, Supabase Auth (email/password, PKCE, persistent session, auto refresh). Netlify hosts the frontend; a separate Cloudflare Worker provides the API. No Lovable Cloud dependency.

## Config

See `.env.example`. Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable) and `VITE_NOVA_API_BASE_URL` are read. Never put secrets in `VITE_*`.

## Roles

Admin / Operator / Viewer from `app_metadata.nova_role` in the signed JWT. The UI uses it for visibility only; the Worker enforces it.

## Modules

Overview · AI Assistant · Trading (DEMO) · MT5 Bridge · Risk Center · Approvals · Users & Roles · Audit Logs · Settings.

## Product UX contracts

- `DESIGN.md` — visual identity, tokens, typography and layout rules
- `UX-CONTRACT.md` — navigation, safety, async states, accessibility and verification behavior
- `premium-ui.json` — machine-readable audit profile and evidence paths

## Docs

- `docs/worker-api-contract.md` — Cloudflare Worker API contract
- `docs/deployment.md` — local development, Netlify build, rollback, and Supabase steps
- `docs/mobile-packaging.md` — Android/iOS path (not shipped)
- `supabase/migrations/*_DRAFT.sql` — isolated `nova` schema, **review & apply manually**

## Scripts

`npm run dev` · `npm run typecheck` · `npm run lint` · `npm run test` · `npm run build`

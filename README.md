# VOOM System - NOVA AI

JARVIS-inspired React SPA on Vite for the VOOM / NOVA intelligence system.

## Frontend authentication

The browser app uses Supabase Auth email/password sign-in. Set these **public** build environment variables in Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (the Supabase publishable/anon key only)

Do not use a Supabase service-role key in the browser. Without both settings, the app fails closed and keeps protected routes unavailable.

## Authenticated API routing

- AI research/chat: `https://voom-system-nova-ai.suwapat787.workers.dev`
- Integration and Exness Demo connection control: `https://voom-system-hub.suwapat787.workers.dev`

The frontend obtains the current Supabase access token from the session and sends it as `Authorization: Bearer` to the appropriate Worker. The Workers validate the session and enforce user/connection ownership. The browser never receives broker credentials or service-role secrets.

The local Express server intentionally provides no mock `/api/*` endpoints. A broker connection is not shown as verified unless the authenticated System Hub read-only check confirms the account path.

## Safety boundary

Read-only + AI Analysis only. Live Trading, execution and order submission remain disabled. No production credentials are committed or required by this source change.

## Running locally

1. Set the two public Supabase variables in a local `.env` file (never commit it).
2. Install dependencies: `npm install`
3. Start the app: `npm run dev`
4. Build: `npm run build`

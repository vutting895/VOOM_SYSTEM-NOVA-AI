# VOOM System - NOVA AI (React SPA)

JARVIS-inspired multi-broker trading command center, AI research chat, Gen-AI strategy lab, marketplace, and learning universe, rewritten as a modern React SPA on Vite with TypeScript and Tailwind CSS.

## Features
- **JARVIS Command Center**: Overview dashboard with AI Core orb, broker connection monitor, market telemetry, and risk guard.
- **NOVA AI Chat**: Interactive research assistant with quick prompts and safety boundaries.
- **Broker Hub**: Exness MT5 Demo and crypto broker connection status monitor.
- **Gen AI Strategy Lab**: Generate strategy drafts with risk parameters and AI worker insights.
- **Strategy Marketplace**: Explore curated strategy templates.
- **Learning Universe 16**: 16 research and AI worker learning modules.
- **Markets & Video Workspace**: Multi-asset telemetry and Gen-AI video studio.

## Running Locally
- Install dependencies: `npm install`
- Start development server: `npm run dev` (runs on port 3000)
- Build for production: `npm run build`

## Frontend authentication

The root Vite SPA is protected by Supabase Auth. Configure these public browser values in Netlify:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key only)

For the existing Netlify site, `vite.config.ts` also maps the existing public `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values to the Vite variables. Only these two explicit public values are exposed to the browser. Never use a service-role key or broker secret in a `VITE_*` variable.

Unauthenticated users are redirected to `/login`; protected workspaces are rendered only after a Supabase session is restored. The browser API helpers obtain the current session token and send it only to the fixed NOVA AI Worker and System Hub HTTPS origins, with redirects disabled. Backend authorization and tenant isolation remain enforced by the Workers and Supabase RLS; the frontend gate is not a substitute for those controls.

The local Express server and the current research/quantum routes are preserved in this change. This PR does not claim that every existing component has already been migrated to the authenticated Worker API.

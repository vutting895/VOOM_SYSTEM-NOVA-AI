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


## Secure QR Connect

The `/connect` route creates a short-lived one-time QR pairing and requires an existing Supabase user session on both devices. The receiving device must sign in as the same user, claim the QR, and wait for explicit approval on the device that created it. The QR value is kept in the URL fragment, removed from the address bar on page load, and held only in memory/session storage until claim or expiry.

Configure these **public browser** environment variables in Netlify (they are not service-role credentials):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`)
- `VITE_SYSTEM_HUB_URL` (the HTTPS `.workers.dev` origin for the NOVA System Hub)

The page fails closed when any required value is missing. Do not place a Supabase service-role key, provider API key, broker password, or other secret in a `VITE_*` variable. The QR pairing flow only approves device-pairing metadata; it does not enable credential intake, secret storage, or broker execution.

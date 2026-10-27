# VOOM_SYSTEM-NOVA-AI — Version 1.0

Status: implementation baseline / not a claim of production readiness.

## 1. Confirmed user requirements

- Primary project/repository: `vutting895/VOOM_SYSTEM-NOVA-AI`.
- Frontend hosting and user entry point: Cloudflare. Do not depend on Vercel for the intended deployment path.
- Trading platform for the current phase: Exness Demo account running MT5.
- User must access the system through the VOOM_SYSTEM web interface.
- Current operating mode: read-only account/market connection and AI analysis.
- Live trading must remain disabled. Do not submit orders or enable order execution automatically.
- Do not place secrets, passwords, access tokens, or account credentials in source code, commits, issues, logs, or chat.
- Preserve prototype/source files unless a change or deletion is explicitly approved.
- Do not report a build, connection, test, or deployment as successful without observable evidence.

## 2. Version 1.0 target

1. A Cloudflare-hosted web frontend with responsive layout for mobile and desktop.
2. A status area showing service health and connection state, distinguishing configured, reachable, authenticated, and data-received states.
3. A broker connection page for Exness Demo / MT5 with safe setup instructions and a read-only status display.
4. Market-data and chart screens where a supported, authorized data source is configured.
5. AI Analysis UI, initially using the project's implemented analysis capabilities only; clearly label unavailable providers and research/prototype models.
6. Strategy-analysis display for EMA 12/26 + RSI 14, without implying profitability or placing trades.
7. Learning Universe 16 + Auto-Learning Loop documented as a development goal; each component must show its actual implementation/readiness state rather than a placeholder marked complete.
8. Health/error reporting that does not reveal credentials or sensitive account information.
9. Cloudflare deployment and repository automation documented, with deployment verified from real build/runtime evidence.

## 3. MT5 integration constraint

Cloudflare Workers/Pages cannot host or launch the desktop MT5 terminal itself. A web frontend therefore needs a separate, secured bridge or a supported broker API to exchange read-only account/market information with MT5. If a bridge is required, it should run on an always-on Windows machine or VPS where MT5 is installed and logged into the Exness Demo account. The bridge must authenticate incoming requests, restrict access, avoid exposing the MT5 terminal to the public internet, and reject all trade/order actions in v1.0.

Do not assume an existing local bridge is connected or always running; verify its actual location, health, and data path before claiming integration works.

## 4. Safety boundaries

- Exness Demo only for this phase.
- Read-only + AI Analysis.
- Order submission, position modification, and account-changing actions disabled at both UI and service/bridge layers.
- No automatic switch to live credentials or live trading.
- Store secrets only in appropriate protected runtime secret settings; never commit them.
- Do not log passwords, tokens, or full credential-bearing connection strings.

## 5. Acceptance checklist

- [ ] Cloudflare frontend URL and deployment target confirmed.
- [ ] Correct repository/branch and build configuration confirmed.
- [ ] Build and type checks run; results recorded.
- [ ] Frontend opens on desktop and mobile.
- [ ] Backend/Worker health endpoint responds.
- [ ] Exness Demo MT5 connection path identified and tested without placing orders.
- [ ] Account status/data timestamps are visible and freshness is distinguishable from a stale connection.
- [ ] AI analysis reports real results or a clear unavailable/error state; no false success placeholders.
- [ ] Live/order actions are disabled and verified server-side.
- [ ] No secrets in repository history, client bundle, or logs.
- [ ] Deployment URL and evidence recorded only after successful verification.

## 6. Questions/blockers to resolve

1. Cloudflare frontend: should the public site use Cloudflare Pages or a Cloudflare Worker with Static Assets? If an existing production URL is already selected, provide/confirm that URL.
2. MT5 bridge: is Exness Demo MT5 installed and logged in on an always-on Windows PC/VPS? If yes, confirm the machine is available for the bridge setup; do not send credentials in chat.
3. v1.0 data scope: should the first milestone show account connection/status only, or account status plus live market prices/charts? No orders in either option.

Until these are confirmed and the acceptance checklist is evidenced, v1.0 is a defined target, not a declaration that the system is already ready or deployed.

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

## 6. Current inspection findings (2026-10-27)

- User confirmed MT5 is installed and logged in on a Windows PC, and requested account status + market prices + charts + AI analysis.
- Remote Windows device `10_3_6_9` is reachable. A process named `terminal64.exe` was observed at `C:\\MT5\\Sounds\\terminal64.exe`; process presence alone does not prove the expected Exness account is logged in.
- Local project folder `C:\\Program Files\\voom_system` exists on the connected Windows device, with a dirty working tree on branch `cloudflare-cutover-wip`. Do not overwrite or reset this tree without reviewing and preserving its uncommitted files.
- `C:\\Program Files\\nova` and `C:\\Program Files\\AI_Bridge` were not found at those exact paths on this device. This does not prove a bridge is absent elsewhere.
- The checked local TCP ports 8081, 8787, 8000, 3000 and 5173 had no listener at inspection time. This is not a complete port scan.
- The repository's Broker Hub Worker currently returns a read-only catalog and `/health` status; its registry marks the MT5 bridge as `catalog-only`, and `/health` reports `connectedProviders: 0`. It does not yet implement the MT5 account/quote adapter.
- Existing `BROKER_SETUP.md` describes `MT5_BRIDGE_HEALTH_URL` and `MT5_BRIDGE_TOKEN` as expected configuration, but explicitly says a broker/terminal-specific bridge is not included. Therefore the web-to-MT5 path still needs implementation and verification.
- The requested market symbol must be discovered from the actual Exness demo terminal. Previous checks did not find `XAUUSDM`/`XAUUSD`; do not hardcode either until the terminal's available symbols are enumerated.

## 7. Remaining questions / blockers

1. Confirm the exact Cloudflare public URL to use as the Version 1.0 frontend. Existing Worker names are not proof that either serves the intended complete frontend.
2. Implement and secure a read-only Windows MT5 bridge, or verify a suitable existing bridge on this PC. Only return account summary, symbol metadata, quotes/candles and connection freshness; explicitly reject all trade/order actions.
3. Discover the correct Exness symbol names and available timeframes from the running terminal.
4. Wire the Cloudflare frontend to the Broker Hub/bridge and actual AI analysis endpoint, then run typecheck/build and end-to-end read-only checks.

Until the acceptance checklist is evidenced, Version 1.0 remains an implementation target, not a declaration that the system is ready or deployed.

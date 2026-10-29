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
- [x] Exness Demo MT5 connection path identified and tested locally without placing orders.
- [x] Bridge account endpoint and market-data timestamps tested locally; frontend display and stale-data UX remain pending.
- [ ] AI analysis reports real results or a clear unavailable/error state; no false success placeholders.
- [x] Bridge rejects POST methods and order-style routes; Cloudflare proxy/UI must still be verified.
- [ ] No secrets in repository history, client bundle, or logs.
- [ ] Deployment URL and evidence recorded only after successful verification.

## 6. Current inspection findings (2026-10-27)

- User confirmed MT5 is installed and logged in on a Windows PC, and requested account status + market prices + charts + AI analysis.
- Remote Windows device `10_3_6_9` is reachable. A read-only Python probe successfully initialized `C:\\MT5\\Sounds\\terminal64.exe`, confirmed terminal connected and an account session available, and reported server `Exness-MT5Trial7`. Terminal `trade_allowed` was `false`; no account number or balance was logged in the test output.
- Local project folder `C:\\Program Files\\voom_system` exists on the connected Windows device, with a dirty working tree on branch `cloudflare-cutover-wip`. Do not overwrite or reset this tree without reviewing and preserving its uncommitted files.
- `C:\\Program Files\\nova` and `C:\\Program Files\\AI_Bridge` were not found at those exact paths on this device. This does not prove a bridge is absent elsewhere.
- The MT5 read-only bridge is now listening on `127.0.0.1:8787` on the Windows PC. It is bound to loopback only; no public port has been opened. This supersedes the earlier observation that port 8787 had no listener.
- The repository's Broker Hub Worker currently returns a read-only catalog and `/health` status; its registry marks the MT5 bridge as `catalog-only`, and `/health` reports `connectedProviders: 0`. It does not yet implement the MT5 account/quote adapter.
- The bridge is installed at `C:\\VOOM_SYSTEM_MT5_READONLY_BRIDGE` on the Windows PC. Python syntax validation passed; the local authenticated `/health`, `/api/account`, `/api/symbols?q=XAU`, and `/api/quotes` checks passed. The probe discovered Exness symbols including `XAUUSDm` and `XAUUSD247m` (plus other XAU pairs), returned 10 M5 bars and a tick for a returned symbol, and confirmed `order_submission_enabled=false`. POST requests were rejected with 405 and `/api/orders` was rejected with 403. A private token is stored under the user's local application-data secrets folder and is not in source control. These are local bridge tests only, not Cloudflare end-to-end tests.
- Existing `BROKER_SETUP.md` describes `MT5_BRIDGE_HEALTH_URL` and `MT5_BRIDGE_TOKEN` as expected configuration, but the complete frontend-to-bridge path still needs wiring and verification.
- The requested market symbol must be discovered from the actual Exness demo terminal. Previous checks did not find `XAUUSDM`/`XAUUSD`; do not hardcode either until the terminal's available symbols are enumerated.

## 7. Remaining questions / blockers

1. The current bridge integration is being moved from a custom-domain/named-Tunnel origin to an authenticated outbound WebSocket relay at `https://voom-mt5-bridge-relay.suwapat787.workers.dev`. The implementation is in a review-only branch until CI and code review pass.
2. After reviewed merge and deployment, provision the relay Worker secret `MT5_TENANT_ROUTES` privately from the Windows tenant files; do not print or commit the route JSON.
3. Start the Windows relay client from the same user session as the intended Exness Demo terminal, then verify protected health, authenticated read-only account access, and tenant isolation end to end.
4. Discover the correct Exness symbol names and available timeframes from the running terminal.
5. Wire and verify the frontend-to-proxy session contract, including that the user's own pending connection can only become connected after successful tenant-route verification.

Until the acceptance checklist is evidenced, Version 1.0 remains an implementation target, not a declaration that the system is ready or deployed.


## 8. Cloudflare frontend cutover inspection (2026-10-27)

- Cloudflare is the canonical frontend target; Vercel is not part of the intended deployment path.
- Frontend Worker: `voom-system-nova-ui` — `https://voom-system-nova-ui.suwapat787.workers.dev`.
- API Worker: `voom-system-nova-ai` — `https://voom-system-nova-ai.suwapat787.workers.dev`.
- GitHub deployment workflow: `.github/workflows/cloudflare-deploy.yml`; CI workflow: `.github/workflows/frontend-ci.yml`.
- Cloudflare API confirmed both Worker names exist and their settings endpoints respond.
- The inspected frontend Worker settings showed compatibility date `2026-10-24` with no compatibility flags, while `frontend/wrangler.jsonc` specifies `2026-10-27` and `nodejs_compat`. This indicates the deployed Worker may be older than the current repository configuration.
- The separate Vercel project's most recent inspected deployments were `CANCELED`; this does not establish Cloudflare frontend health.
- The live browser check could not be completed through the available inspection path. The latest Cloudflare deployment, route rendering, frontend-to-API calls, and AI Analysis UI remain unverified.
- See `docs/CLOUDFLARE_FRONTEND_CUTOVER.md` for the evidence and required verification sequence.

Cutover status: **configured as target, not yet verified end-to-end**. Keep Read-only + AI Analysis and Live Trading OFF until checks pass.

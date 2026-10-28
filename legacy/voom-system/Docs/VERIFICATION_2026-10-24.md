# Voom_system Verification Report — 2026-10-24

## Scope and safety
- Verification was performed against the deployed Cloudflare Worker, the local Source 1 API, Supabase, GitHub, and the Vercel production domain.
- Live trading remains disabled. All observed API responses explicitly reported `tradingMode=paper`, `liveTradingEnabled=false`, and `orderExecution=disabled`.
- No live orders were submitted and no trading settings were enabled.

## Verified pass
- Local API `GET http://127.0.0.1:8000/health` returned HTTP 200 with `version=6.2-safe`, `paper_only=true`, `live_trading_enabled=false`, and `order_execution=disabled`.
- Cloudflare `GET /api/health` returned HTTP 200 and confirmed paper-only safety flags.
- Cloudflare `GET /api/dashboard/status` returned HTTP 200 with `connected=true`, `stale=false`, `source=mt5-ea`, `mode=paper`, `terminalConnected=true`, `accountConnected=true`, symbol `XAUUSDc`, timeframe `M15`. The sample returned `timestamp=2026-10-23T21:35:25Z` and `receivedAt=2026-10-23T21:35:25.219Z`.
- Cloudflare rejected an unauthenticated `POST /api/mt5/telemetry` with HTTP 401, confirming the telemetry endpoint is not open to requests without the bridge secret.
- Cloudflare Worker `voom-system-api` has the `VOOM_BRIDGE_SHARED_SECRET` secret binding and the `DATA` KV binding configured. Secret values are intentionally not recorded in this repository.
- Supabase project status is `ACTIVE_HEALTHY`; previous database smoke tests confirmed customers cannot update their own role or account status.
- Vercel production deployment from commit `443789a83bd5cbbd12b09e838fb80a8fad909495` reported `READY`.

## Remaining blockers
- The Vercel project has SSO protection enabled for `all` deployment targets. Requests to `https://voomsystem.vercel.app/customer-login.html` and `/register.html` returned the Vercel login page instead of the customer pages. Do not disable protection across the existing project without separating the public customer portal from any staff-only UI.
- Supabase table counts at verification time: `customer_profiles=1`, `trading_sessions=0`, `strategy_signals=0`, `system_heartbeats=0`. The Worker telemetry is in Cloudflare KV and is not yet mirrored to these Supabase tables.
- `Dashboard/customer.html` authenticates and reads the customer profile but explicitly shows trading/signals as not connected. Customer-specific live trading data is not implemented in that page yet.
- Supabase leaked-password protection remains disabled. Enable it in Supabase Auth password security settings.
- The Supabase security advisor continues to report four authenticated-callable SECURITY DEFINER marketplace RPCs. They were retained because the customer frontend uses these RPCs and their function bodies enforce authenticated customer access; review them before expanding permissions.

## Next actions
1. Provide a public customer portal route that does not expose staff-only dashboard pages; keep current project SSO protection until the portal is separated or an equivalent safe access policy is in place.
2. Configure Supabase Auth Site URL and Redirect URLs for the actual public customer portal domain, then run a new signup, email-confirmation, login, and logout test.
3. Decide and implement an authenticated, customer-scoped path to surface only appropriate telemetry/account data; do not treat Cloudflare KV telemetry as durable trade history.
4. Enable leaked-password protection in Supabase Auth.
5. Keep paper mode and disabled order execution until backtest, out-of-sample, demo, and risk validation all pass.

## Follow-up on 2026-10-24
- Attempted to create a separate public Vercel project `voom-customer-portal` linked to this repository with root directory `Dashboard`, to avoid removing SSO from the staff-facing project. Vercel rejected project creation with HTTP 403 `forbidden` (no permission to create a project). No existing protection settings were changed.
- The latest live Worker status check again returned `connected=true`, `stale=false`, `mode=paper`, `liveTradingEnabled=false`, and `orderExecution=disabled`. This verifies the Worker currently has recent telemetry, but does not mean telemetry has been persisted to Supabase or that the customer portal is publicly reachable.
- To finish the portal access fix, grant project-creation permission to the connected Vercel integration or create the separate project in Vercel UI with GitHub repository `vutting895/Voom_system` and root directory `Dashboard`; then disable SSO only on that isolated customer-portal project, not on `voom_system`.

## Customer portal isolation attempt — 2026-10-24

- Created a dedicated `customer-portal/` directory containing copies of the customer login, registration, and member pages. Staff dashboard files are not included in this directory.
- Registration email confirmation now points to `https://voom-customer-portal.pages.dev/customer-login.html?confirmed=1`; this hostname is a planned target and is **not yet live/verified**.
- Vercel project creation for `voom-customer-portal` remains blocked with HTTP 403 (project creation permission denied). The existing Vercel project list currently returns only `vsni`, linked to `vutting895/Voom-ai-sniper`; the previously referenced `voom_system` project could not be found in the currently scoped team. No existing SSO protection was changed.
- The first attempt to create a Cloudflare Pages project linked to GitHub was rejected with HTTP 401 / error `8000011` (Cloudflare Pages Git installation issue). A second attempt successfully created a **standalone Direct Upload Pages project** named `voom-customer-portal`, ID `86133dbd-fc5e-46a7-9d41-a010a489da65`, at `https://voom-customer-portal.pages.dev`.
- The Pages project currently has `latest_deployment=null` and `canonical_deployment=null`; it is an empty project, **not a deployed portal**. Direct asset upload and deployment are still pending, and the Git integration needs repair for automatic deployments. Do not present the `pages.dev` URL as working until a deployment is verified.
- Result: source files are isolated and committed; public customer portal is **not deployed yet**. Next blocker is a working Pages Git integration or a supported Direct Upload workflow, or granting Vercel project-creation permission. Keep staff SSO and live trading disabled until hosting and end-to-end auth checks pass.

## Customer portal deployment update — 2026-10-24

- Deployed a separate public Cloudflare Worker named `voom-customer-portal`, deployment ID `525ce3f0db774dbc81bd21c33d4633be`, and explicitly enabled its `workers.dev` endpoint. Public base URL: `https://voom-customer-portal.suwapat787.workers.dev/`.
- The Worker serves only the isolated customer-facing HTML pages; it does not serve the staff Dashboard or any bridge secret. The page responses include `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY`.
- Remote HTTP smoke tests returned status 200 for `/`, `/customer-login.html`, `/register.html`, and `/customer.html`. A content check confirmed the signup confirmation redirect now uses the same-origin `/customer-login.html?confirmed=1` path. This verifies static page delivery only; it does **not** prove signup/login works end-to-end.
- GitHub commit `79373850cefc47d6862eb2ed93d33cb1ddca3867` updates `customer-portal/register.html` to use the same-origin confirmation redirect.
- Supabase Auth still needs the new URL added to its allowed Redirect URLs (at minimum `https://voom-customer-portal.suwapat787.workers.dev/**`) and Site URL reviewed in the Supabase Dashboard before real email confirmation can be considered verified. No test customer was created and no password was requested or recorded.
- The separate Cloudflare Pages project `voom-customer-portal` remains empty and is not the serving host; the live portal is the Worker URL above. Git-connected Pages deployment is still blocked by the Git integration issue.
- Staff SSO remains enabled on the existing staff project. Live trading remains disabled and order execution remains disabled.

## Customer Auth preflight — 2026-10-24

- Public Supabase Auth settings endpoint was queried with the project's publishable key (no account secrets used). Result: email provider enabled, signup enabled (`disable_signup=false`), and email auto-confirm disabled (`mailer_autoconfirm=false`). This is consistent with requiring email confirmation.
- Supabase JS UMD CDN endpoints at jsDelivr and unpkg both returned HTTP 200 from the connected Windows test device.
- The public Auth settings response does not expose the configured Site URL / Redirect URL allow-list. The connected Supabase tool exposes database/project operations but no Auth URL Configuration management action, and no Supabase Management API access token is available in this workflow. Therefore the allow-list was not changed or falsely marked verified.
- Remaining required dashboard action: in Supabase Dashboard for project `tlyyxufuiimrbaksoitf`, open Authentication → URL Configuration and add the exact redirect URL `https://voom-customer-portal.suwapat787.workers.dev/customer-login.html?confirmed=1` (or a supported pattern covering this path) to Redirect URLs. Keep the existing Site URL unchanged unless the customer portal is intentionally the primary site for every auth flow; the staff/admin project may depend on the current Site URL. After saving, test with an owner-controlled email address and confirm that the email link returns to the customer portal.
- End-to-end signup, confirmation, login, and logout remain NOT VERIFIED. No test user was created, no credentials were collected, and no live trades were enabled.


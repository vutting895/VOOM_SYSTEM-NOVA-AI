# NOVA Integration Center — Full Automation Delivery Plan

## Product decision

The NOVA Integration Center is the user-facing control plane for supported integrations. It uses the existing voom-system-hub Worker and does not create a second integration backend.

The selected operating mode is **Full Automation with approval gates**:
- Automatically discover registered integrations and monitor Hub readiness.
- Automatically refresh the signed-in user's connection inventory.
- Guide configuration only through provider adapters that are already registered and tested.
- Require explicit user approval for connection requests, OAuth consent, secret provisioning, tenant route allocation, and permission changes.
- Fail closed when authentication, tenant ownership, provider readiness, or safety state cannot be verified.

## Current implementation in this PR

- Adds /integrations to NOVA navigation.
- Reads public /health and authenticated /v1/integrations + /v1/connections from the existing System Hub.
- Uses the active Supabase browser session and sends its access token only in the HTTPS Authorization header.
- Polls status every 30 seconds and supports manual refresh.
- Supports an explicit, confirmed Exness MT5 Demo request. The Hub creates only a pending row; it does not allocate a route or collect a broker password/API secret.
- Allows a read-only connection check only after a route is allocated.
- Shows the Hub trading safety flags and labels activity as local-only rather than claiming a persistent audit log.

## Integration capability truth table

| Integration | Current evidence | UI behavior |
|---|---|---|
| Supabase Auth | Registered by Hub; browser session is read from Supabase client | Detect session; no credential form |
| Exness MT5 Demo | Existing Hub supports pending request and authenticated read-only verification | Request pending connection; verify only after route allocation |
| NOVA AI Worker | Registry entry exists; runtime verification is not included in this API | Show configured / not checked |
| Remote MCP | Registry entry exists; runtime verification is not included in this API | Show configured / not checked |
| Binance public market data | Isolated adapter pilot exists but is not registered in active Hub | Do not expose as connected |
| Other OAuth/API providers | No reviewed provider-specific callback/configuration contract in this PR | Do not accept credentials or claim auto-connect |

## Security invariants

- No secrets, broker passwords, API keys, or OAuth client secrets are requested or rendered in the browser.
- The Hub validates Supabase sessions and scopes connections to the authenticated user.
- No generic proxy or caller-supplied upstream URL is introduced.
- No order, transfer, deposit, or withdrawal routes are added.
- ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false remain mandatory.
- A configured integration is not described as authenticated, reachable, or data-verified without evidence.
- Local UI activity is not a substitute for a durable server-side audit ledger.

## Follow-on phases

1. Add a persistent audit-event API and storage contract with tenant-scoped RLS and secret redaction.
2. Add provider-specific OAuth/API setup flows one adapter at a time, including callback state/PKCE, token exchange on the server, rotation/revocation, and negative tenant-isolation tests.
3. Add health probes for NOVA AI and Remote MCP with bounded timeouts and explicit verification states.
4. Add an approval lifecycle for route provisioning and permission changes, reusing the existing durable approval lifecycle rather than creating a parallel approval system.
5. Add staging smoke tests for real authenticated owner access and foreign-tenant denial before declaring any connector production-ready.

## Acceptance

- Frontend build and Integration Center contract tests pass.
- The page shows registry data only after a valid Supabase session.
- Missing/expired sessions fail closed.
- Exness request creates only a pending record after confirmation.
- No connector is called connected solely because it appears in the registry.
- No live trading or financial side-effect capability is exposed.


## Deploy Preview origin policy

- The System Hub allows the production NOVA origin and the exact site-specific HTTPS Netlify PR preview hostname pattern `deploy-preview-<number>--voomsystem.netlify.app`.
- Arbitrary `*.netlify.app` origins, lookalike site names, and non-HTTPS preview origins remain rejected.
- The Integration Center CI runs the System Hub CORS contract tests so the preview policy is checked with the UI changes.

## Frontend environment compatibility

The Vite page accepts the existing public Netlify variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SYSTEM_HUB_URL` as compatibility fallbacks, as well as the newer `VITE_*` names. The Supabase anon/publishable key is public client configuration, not a service-role key. No Netlify environment-variable mutation is required by this PR.

## Planned provider cards

The page also displays GitHub, Google AI Studio/Gemini, Cloudflare, Netlify, and Fly.io Sprites as `PLANNED · DISABLED`. These cards are roadmap visibility only: no OAuth consent, token entry, API operation, or connected status is offered until each provider has a reviewed adapter, approved server-side credential custody where applicable, and tenant-isolation tests.

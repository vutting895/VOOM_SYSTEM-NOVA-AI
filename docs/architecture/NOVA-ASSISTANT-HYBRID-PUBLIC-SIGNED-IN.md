# NOVA Assistant — Hybrid Public + Signed-in Architecture

Status: design baseline on feature branch; no production changes.

## Decision

Use two deliberately separate surfaces under one NOVA Assistant product identity:

1. **Public assistant — Quickchat AI**
   - Keep the existing Quickchat scenario `qoz0in5jyh` (NOVA Assistant) as the public website assistant.
   - It may answer general NOVA product/documentation questions and call only the existing public read-only health probes:
     - NOVA Service Health (Action 6027): `GET /health`
     - NOVA System Hub Health (Action 6028): `GET /health`
   - It must not read a visitor's broker account, quotes, private connections, approvals, or tenant data.
   - Do not add shared bearer tokens, Supabase access tokens, service-role keys, broker credentials, or user identifiers as authorization claims to Quickchat.

2. **Signed-in assistant — NOVA native Command Center**
   - Reuse the existing authenticated NOVA Command Center chat surface and same-origin `/api/chat` route.
   - The browser must require a ready Supabase Auth session and send the current user's access token as `Authorization: Bearer <user-session>`.
   - The NOVA AI Worker independently validates the session through Supabase Auth. CORS is not authentication.
   - Preserve bounded request/response chat, server-side sensitive-text redaction, the fixed `nova.intent.v1` research-only intent contract, and the allow-listed UI renderer.
   - Any future private context must be fetched server-side and scoped to the authenticated user. Never authorize using a browser-supplied user ID, tenant ID, connection ID, Quickchat metadata value, or model-generated argument.

3. **No identity bridge between Quickchat and Supabase**
   - Do not pass a Supabase JWT through Quickchat `custom_params`, conversation metadata, an AI parameter, a URL, or a prompt.
   - Quickchat documentation confirms custom parameters are browser-supplied conversation metadata and explicitly warns that browser metadata is not proof of identity or permission. Referenced metadata may also be admitted to model context depending on the active Action configuration.
   - An opaque short-lived ticket would still be a bearer capability and would require atomic single-use redemption, conversation binding, expiry, revocation and leakage analysis. Do not implement that bridge unless a separately reviewed requirement proves it is necessary.
   - The public Quickchat widget and signed-in NOVA chat must not share a private data Action.

## Existing implementation evidence at the base commit

Base `main` SHA: `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`.

- `integrations/nova-ai-worker/README.md` documents Supabase bearer validation for every non-health route and authenticated `POST /api/chat`.
- `integrations/nova-ai-worker/worker.js` independently validates Supabase sessions, bounds chat input, rejects unsupported routes, and returns research-only responses with execution disabled.
- `docs/NOVA-CUSTOMER-COMMAND-CENTER-IMPLEMENTATION.md` documents the existing signed-in Command Center, same-origin chat route, tenant-state reset, and fixed intent contract.
- `integrations/system-hub/worker.js` already authenticates Supabase users, scopes connection reads by authenticated user ID, preserves RLS, and uses fixed MT5 proxy destinations.
- The two Quickchat HTTP Actions currently configured for NOVA Assistant are public health checks only. Their successful health responses do not prove a user's broker, account, quote feed, or execution readiness.

These are source-level findings. They do not prove that the current production UI or Workers are deployed at this exact SHA.

## Public assistant contract

Allowed:
- Explain NOVA modules and documentation.
- Explain Safe Mode, read-only behavior, and what health fields mean.
- Call Action 6027 or 6028 only when asked about the corresponding service health.
- Report returned health fields exactly, with the limitation that `/health` is not a user/broker/feed verification.

Forbidden:
- Private account, balance, equity, margin, broker connection, quotes or candles.
- User-specific approvals, threads, tenant records or logs.
- Order placement, execution toggles, withdrawals, transfers, or broker mutations.
- Inferring broker/feed readiness from service health.

## Signed-in assistant contract

- Require an authenticated Supabase session before rendering or sending chat requests.
- Send the access token only in the HTTPS Authorization header to the NOVA first-party API.
- Revalidate the token server-side on every request; do not rely on client CORS, cached identity, local storage, or UI gating alone.
- Keep chat history bounded and validate roles/content server-side. Only `user` and `assistant` roles are accepted by the Worker; no client-supplied system/developer messages.
- Redact secrets from user text before forwarding to the model; never log bearer tokens or raw credentials.
- Private data tools, if added later, must derive the owner from the validated Supabase session and apply tenant filters/RLS server-side.
- Responses remain research-only. Do not add order tools or execution capability.

## Read-only Trading Safety — non-negotiable

All public and signed-in surfaces must preserve:
- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`
- No order submission, order modification, close-position, withdrawal, transfer, deposit, or funding route.
- Account/quote reads are permitted only through existing authenticated owner-scoped read-only routes and only when explicitly added to the signed-in contract.
- Strategy approvals are approvals of research drafts only, never trading authorization.

## Required tests before any implementation is called complete

### Public / Quickchat
- Public knowledge questions work without an authenticated NOVA session.
- Both existing health Actions remain GET-only and expose only documented health fields.
- No Quickchat Action can call `/v1/connections`, `/account`, `/quotes`, chat, backtest, or any mutation route.
- Public Agent is denied access to private data even if a visitor supplies forged `user_id`, `tenant_id`, `connection_id`, `customer_tier`, or other custom metadata.
- Health failure is reported as unknown/unavailable, never as broker status.

### Signed-in / NOVA
- Missing, malformed, expired and revoked Supabase sessions are rejected.
- User A cannot read User B's connections, broker account, quotes, approvals, threads or other private records.
- Switching signed-in identity clears customer-scoped UI state and discards stale in-flight responses.
- The chat route rejects system/developer roles, oversized messages, invalid ordering and excessive history.
- Sensitive text is redacted before forwarding; tokens are not logged or returned.
- Unknown routes, including order routes, remain rejected.

### Safety / regression
- Assert all three safety flags are false on every relevant response.
- Assert there are no order/execution methods or hidden action routes.
- Run the existing System Hub, AI Worker, Command Center, and security tests offline with mocked Supabase/MT5 dependencies.
- No production endpoint, database, Worker, Quickchat configuration, or deployment is modified by this branch.

## Work plan

1. Audit the current Command Center page and its same-origin chat route against this contract.
2. Add focused regression tests for public/private separation and safety flags where existing coverage is incomplete.
3. Make only the smallest code changes needed on this feature branch.
4. Run local Node tests and the repository's existing frontend checks; record exact commands and results.
5. Open a draft PR against `main` for review. Do not merge or deploy.
6. Any later staging/production deployment requires a separate explicit approval and exact-SHA verification.

## External integration references

- Quickchat Website / custom parameters: https://docs.quickchat.ai/channels/website/
- Quickchat Conversation Metadata / model context and authorization: https://docs.quickchat.ai/api-reference/conversations/
- Quickchat AI Action Variables: https://docs.quickchat.ai/ai-agent/variables/

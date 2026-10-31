# Exness Platform Trading API — Read-only Integration Plan

**Status:** implementation contract / staging-gated  
**Canonical base:** `main` at `54750cd170d72ae3b90c5b28c16cb8c1b76f3a22`  
**Target:** NOVA Dashboard + Exness platform-based trading account (not MT4/MT5)

## 1. Account and API fit

The owner confirmed the Personal Area platform label is **Exness**. Exness documents state that Exness-platform accounts are used with Exness Terminal / Exness Trade and are not compatible with MetaTrader platforms. Exness API eligibility is for Exness trading accounts; standard MetaTrader accounts are not eligible for this API.

The Exness API provides account configuration and state, instrument configuration, historical OHLC candles through REST, real-time Bid/Ask ticks through the dedicated ticks WebSocket stream, and account/trading state snapshots and events.

**Instrument limitation:** Exness Help currently states that the API version does not support stock and index instruments through standard endpoints. Do not expose those as API-verified markets until Exness documentation and a real account response prove support. Initial Dashboard scope is only instruments returned by the authenticated account's instrument list.

## 2. Read-only API allowlist

All upstream calls must be signed server-side using the official Exness request-signing protocol. The browser must never receive the API key, private key, signed headers, or account access-point host.

Allowed operations (all GET):
- Account host discovery / account access-point resolution, as documented by Exness.
- `GET /v1/configuration/accounts/{account_id}/account`
- `GET /v1/configuration/accounts/{account_id}/limits`
- Account instrument-list GET operation (confirm exact current reference path before implementation).
- `GET /v1/market-data/accounts/{account_id}/candles`
- Signed WebSocket GET handshake for `/v1/server-events/accounts/{account_id}/ws/ticks` only.
- Optional later: read-only snapshot/history endpoints after response contracts and access scopes are reviewed.

Do not implement or proxy any mutating API operation. Explicitly deny POST, PUT, PATCH, DELETE, transfer/payment routes, and every trading order/position mutation route. Do not accept arbitrary upstream hostnames or paths from the browser.

The Exness API supports trading mutations on the same API surface. A read-only UI label is not a security boundary; server-side method/path allowlisting is mandatory.

## 3. NOVA architecture

1. **Frontend (Netlify):** authenticated Dashboard calls only same-origin NOVA read endpoints. It displays source, account platform, environment, freshness, and verified/unavailable state.
2. **NOVA Exness Adapter (Cloudflare Worker):** validates Supabase JWT, derives tenant/user identity from the verified token, resolves only that tenant's broker connection, obtains the server-side credential reference, performs the fixed allowlisted GET/signing flow, normalizes responses, and emits audit-safe metadata.
3. **Credential custody:** API key identifier and Ed25519 private key remain in an approved server-side secret custody service. Never store them in browser storage, Supabase client-readable rows, repository files, CI variables exposed to build output, or logs. Existing Supabase Vault must not be assumed safe for private-key custody without reviewed grants and tenant isolation.
4. **Data contract:** normalized account summary, instrument list, candles and ticks must carry provider, platform, account-environment, source timestamp, received timestamp, and `dataVerified=true`. Stale, malformed, wrong-tenant, unsupported-instrument, or environment-ambiguous responses fail closed.
5. **AI Analysis:** consume only normalized, verified Exness candles/ticks. Analysis remains informational; no trade instruction, order construction, risk approval, or execution authority is added.

## 4. Dashboard acceptance

- Show connection states distinctly: not configured, pending owner setup, connected/verified, stale, permission denied, rate limited, and unavailable.
- Display only instruments returned by the connected account; no hard-coded quote fallbacks or sample balances.
- Show account currency/leverage and sanitized balance/equity/margin only after the account response contract and privacy review pass.
- Chart uses Exness candle history and a bounded tick stream; UI indicates provider timestamp and data age.
- Enforce tenant isolation: user A cannot read user B's connection, account, instruments, quotes, or history.
- Rate limits are read from the account limits endpoint. On 429 / `REQUEST_RATE_LIMIT`, do not retry in a tight loop.
- Exness API errors are mapped to safe UI states; never expose signatures, keys, account IDs, or upstream diagnostic payloads.

## 5. Trading safety invariants

These flags remain hard false in every response and test:
- `ordersEnabled=false`
- `executionEnabled=false`
- `order_submission_enabled=false`
- `liveTradingEnabled=false`

No order/position mutation routes, transfers, withdrawals, account switching, migrations, secret provisioning, Worker deployment, or production cutover are included in this work item. Do not use Exness trading examples as permission to implement execution.

## 6. Staging gates / blockers

Before real data can be displayed:
1. Confirm API page eligibility and account access-point discovery in the owner's Personal Area.
2. Owner creates the API credentials and configures them directly in the approved secret-custody UI. Do not send credentials in chat or GitHub.
3. Security review approves signing implementation, secret custody, rotation, audit redaction, and per-tenant authorization.
4. Implement and test the GET-only adapter against documented request/response schemas.
5. Verify account info, instrument list, historical candles, and live ticks using the owner's authorized staging connection.
6. Test missing/expired key, invalid signature, unsupported instrument, 429, stale ticks, malformed candles, and cross-tenant access.
7. Exact-head CI, Netlify Preview, and authenticated staging read-only smoke test must pass before merge or production deployment.

Until these gates pass, Dashboard must show **API setup / verification pending**, not Connected and not live prices.

## 7. Official references

- Exness API eligibility, capabilities, account requirements and instrument limitations: https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API
- Exness platform account compatibility: https://get.exness.help/hc/en-us/articles/18022583206940-Exness-platform-based-trading-accounts
- API account details and trade-mode/status semantics: https://www.exness-api.com/reference/trading/get-account-details
- Historical candle endpoint and limits: https://www.exness-api.com/reference/get-candle-history
- Tick WebSocket stream: https://www.exness-api.com/reference/get-ws-ticks
- API limits and throttling: https://www.exness-api.com/documentation/api-configuration-and-limits
- Runtime state and event semantics: https://www.exness-api.com/trading/guides/runtime-semantics

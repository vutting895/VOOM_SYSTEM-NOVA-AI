# NOVA Multi-Broker API Adapter Contract — Read-only Delivery Plan

- Date: 2026-10-31
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base: `main` at `aad16f6c62ace703624845780e46110ca9a4beda`
- Status: design and provider-capability assessment; no adapter runtime is activated by this document
- Owner-confirmed target: multi-broker API across Forex, Crypto, and Stocks
- Safety: Read-only + AI Analysis; `ordersEnabled=false`; `executionEnabled=false`; Order Submission OFF; Live Trading OFF

## 1. Decision

Build one provider-neutral API adapter layer inside the existing NOVA System Integration Hub. Do not create a second gateway and do not route broker credentials through the AI Worker, MCP, browser storage, or chat.

The new API path is the target architecture. The existing Exness MT5 Bridge/Relay path remains available only as a rollback/legacy path until API-based account and market-data reads have passed staging acceptance. Do not delete or disable it as part of this plan.

Target asset coverage:

- Forex and supported CFDs: Exness Trader API, subject to account/API eligibility and instrument support.
- Crypto: explicitly allowlisted exchange APIs, beginning with Binance Spot read-only scopes; additional exchanges only after independent scope review.
- Stocks: Interactive Brokers (IBKR) Web API, subject to account, authentication, market-data entitlement, and session constraints.

Provider support is capability-based. No provider is assumed to support every asset class, endpoint, account field, or market-data feed.

## 2. Repository-first architecture

Reuse `integrations/system-hub` as the only control plane:

```text
NOVA Frontend / Personal AI
        |
        | Supabase session; typed intent only
        v
NOVA System Integration Hub
        |
        | authenticate user; derive owner from session
        | load exact owner-scoped connection
        | check provider/environment/capability allowlist
        | emit sanitized audit/correlation record
        v
Provider-neutral Read Adapter Contract
        |
        +--> Exness Trader API adapter (Forex/eligible CFDs)
        |
        +--> Binance Spot adapter (Crypto)
        |
        +--> IBKR Web API adapter (Stocks)
        |
        v
Normalized, timestamped, provenance-tagged read models
```

The Hub must never accept a caller-supplied upstream URL, host, port, provider implementation name, tenant ID, or owner ID as authority. Provider endpoints and adapter registrations are fixed server-side.

## 3. Provider capability assessment (official documentation reviewed 2026-10-31)

| Provider | Target asset | Documented read capability | Important constraints | Initial decision |
|---|---|---|---|---|
| Exness Trader API | Forex / supported CFDs | Account details, real-time and historical market data, instrument metadata; REST and WebSocket | API access is eligibility/key gated. Exness Help Center says the current API version does not support stock and indices instruments and says standard MetaTrader accounts cannot connect. Do not assume the existing MT5 Demo login is API-compatible; verify the account/API product and key eligibility in the Exness Personal Area. | First account-eligibility spike; do not block other adapters on it |
| Binance Spot API | Crypto | Public market data; private account data via `USER_DATA` | API security distinguishes `NONE`, `USER_DATA`, and `TRADE`. Keep `TRADE` disabled and do not request withdrawal/funding scopes. Use public market-data-only host for unauthenticated feeds where appropriate. | First exchange adapter; public feed can be tested without credentials |
| IBKR Web API | Stocks / ETFs and supported products | Read-only subset includes portfolio retrieval and instrument search | Market data endpoints behind `/iserver` require a brokerage session and relevant live market-data subscriptions/permissions. The session is stateful and must be operated in a dedicated approved runtime. Do not claim that all stock quotes are available from a simple read-only outer session. | Separate entitlement/runtime spike before private account integration |

Official references:
- Exness API overview: https://get.exness.help/hc/en-us/articles/27866287512476-Exness-API
- Exness API key and host setup: https://www.exness-api.com/authentication/api-key-and-host-setup
- Binance Spot REST API security and endpoint classes: https://developers.binance.com/en/docs/products/spot/rest-api
- Binance public market-data-only endpoints: https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md
- IBKR Web API documentation: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
- IBKR read-only vs brokerage session constraints: https://www.interactivebrokers.com/docs/web-api/authentication/trading

This is a documentation-based capability assessment, not proof of successful authenticated reads against the owner's accounts. No credentials were created, requested, or tested.

## 4. Provider-neutral contract

Implement a narrow interface. Keep provider-specific fields in a namespaced metadata object; do not pretend every provider exposes identical account semantics.

Suggested TypeScript shape:

```ts
type ReadCapability =
  | "account.identity.read"
  | "account.summary.read"
  | "account.balances.read"
  | "account.positions.read"
  | "market.instruments.read"
  | "market.quote.read"
  | "market.candles.read"
  | "account.history.read";

type ProviderEnvironment = "demo" | "paper" | "live";

type AdapterContext = {
  ownerId: string;          // derived by the Hub, never from request JSON
  connectionId: string;     // looked up under owner scope
  environment: ProviderEnvironment;
  correlationId: string;
  deadlineMs: number;
};

type ReadResult<T> = {
  provider: string;
  connectionId: string;
  capability: ReadCapability;
  asOf: string;             // provider/source timestamp, ISO-8601 UTC
  receivedAt: string;       // NOVA observation timestamp, ISO-8601 UTC
  stale: boolean;
  source: string;           // fixed provider/endpoint provenance identifier
  data: T;
};

interface ReadOnlyBrokerAdapter {
  readonly providerId: string;
  readonly supportedEnvironments: readonly ProviderEnvironment[];
  readonly capabilities: readonly ReadCapability[];
  verifyConnection(ctx: AdapterContext): Promise<ConnectionVerification>;
  getAccountSummary(ctx: AdapterContext): Promise<ReadResult<AccountSummary>>;
  getBalances(ctx: AdapterContext): Promise<ReadResult<Balance[]>>;
  getPositions(ctx: AdapterContext): Promise<ReadResult<Position[]>>;
  getInstruments(ctx: AdapterContext, query: InstrumentQuery): Promise<ReadResult<Instrument[]>>;
  getQuote(ctx: AdapterContext, query: QuoteQuery): Promise<ReadResult<Quote>>;
  getCandles(ctx: AdapterContext, query: CandleQuery): Promise<ReadResult<Candle[]>>;
}
```

The implementation may omit unsupported optional methods from a provider registration; it must not fake a successful result or return mock values for missing capabilities. The adapter registry advertises exact capabilities per provider/environment.

## 5. Normalized data requirements

- Every quote/candle/balance/position carries provider, connection reference, source timestamp, NOVA received timestamp, currency/unit, and freshness state.
- Preserve provider symbol and normalized instrument identity separately; symbol aliases must not silently merge unrelated instruments.
- Prices and balances are decimal-safe strings or a documented decimal representation; avoid binary floating-point arithmetic for money.
- Candle timestamps are UTC, strictly chronological, unique, bounded, and validated for finite positive OHLC values and OHLC consistency.
- Do not aggregate different currencies without an explicit FX conversion source, rate timestamp, and conversion provenance.
- Unknown provider fields remain namespaced and are not promoted into trusted NOVA fields without schema review.

## 6. Security and read-only enforcement

1. Supabase Auth session is verified server-side on every protected request.
2. Owner and connection are resolved by the Hub using the authenticated principal and owner-scoped query; never trust client/model-supplied IDs.
3. Provider secrets remain in the approved server-side secret custody path. The current repository readiness document blocks customer credential writes/reads until a dedicated least-privilege secret access path and two-owner tests pass.
4. Do not accept API credentials through chat, voice, query strings, model prompts, MCP arguments, logs, analytics, or ordinary Postgres fields.
5. Binance keys must have only the minimum account-read scopes required; trade, withdrawal, transfer, and funding permissions must remain disabled.
6. Exness signing material and IBKR authentication material must remain server-side and must not be returned to the browser or model.
7. Use compiled provider and operation allowlists. No generic HTTP proxy, arbitrary host/port, dynamic package loading, or unbounded symbol/timeframe/history query.
8. Enforce timeouts, provider-aware rate limits, bounded retries for idempotent reads, and sanitized errors.
9. The provider adapter itself must reject unsupported methods. Do not rely solely on the UI or Hub route list.
10. Do not implement order, cancel, amend, close-position, transfer, deposit, withdrawal, or funding methods in the interface or adapter registry.

Required runtime invariants:
- `ordersEnabled=false`
- `executionEnabled=false`
- `order_submission_enabled=false`
- `liveTradingEnabled=false`

## 7. Credential custody dependency

The existing `docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md` records that the inspected staging Vault grants are too broad for customer credential access and explicitly blocks credential writes/reads.

Therefore:
- Public market-data-only endpoints may be prototyped without customer credentials.
- Do not enable customer API-key submission or private account reads until the dedicated secret access path is implemented and reviewed.
- Do not store private keys in Cloudflare Worker environment variables as a substitute for per-customer secret custody.
- Do not change Supabase grants, provider settings, Worker secrets, or production configuration as part of this design step.

## 8. Verification plan and acceptance gates

### Gate A — contract and negative tests
- Provider registry rejects unknown provider IDs, environments, operations, and symbols.
- Every adapter exposes only the capabilities declared in its registration.
- No write-like method or route exists in the v1 contract.
- Missing credentials/configuration fail closed.
- Error payloads and logs contain no credentials or account-sensitive data.

### Gate B — public data smoke tests
- Binance public market data: connectivity, schema, UTC timestamps, symbol metadata, rate-limit handling.
- Exness/IBKR public endpoints only if their official products expose suitable unauthenticated market data; do not infer account connectivity from public data.

### Gate C — private read-only staging tests
- Use synthetic/staging-only customer identities and provider-approved test credentials.
- Owner can read only their own account/connection.
- A second user cannot read the first user's connection, balances, positions, or provider response.
- Expired/revoked/insufficient-scope credentials fail closed.
- Provider outage, throttling, malformed data, stale data, and session expiry produce explicit degraded/unavailable states.
- Confirm provider-side key permissions and NOVA-side route/method allowlists independently.

### Gate D — controlled activation
- Exact PR-head CI and security tests pass.
- Staging deployment is tied to the exact reviewed commit.
- Authenticated account and data reads are evidenced for each provider separately.
- No production cutover or removal of MT5 rollback path without a separate approval and documented rollback plan.

## 9. Implementation sequence

1. Provider-neutral contract and registry tests in the existing System Hub.
2. Binance public market-data adapter and schema/freshness tests (no credentials).
3. Exness Trader API eligibility proof and a signed GET-only account/instrument/quote spike, only after the owner confirms API-key eligibility and uses the secure credential onboarding path.
4. IBKR account-read and market-data entitlement/session spike in an isolated runtime.
5. Add private credential onboarding only after the secret-custody blocker is closed.
6. Staging owner/foreign-owner isolation and provider-specific acceptance for each connector.
7. Update frontend connection UX to show exact capabilities and readiness states.
8. Keep MT5 Bridge as rollback until the API replacement has passed all applicable gates.

## 10. Explicit non-goals

- No live order placement, order modification/cancellation, position mutation, transfer, deposit, withdrawal, or funding.
- No production credentials, customer credentials, provider API keys, or secrets in this PR.
- No Supabase migration/grant changes, Cloudflare secret/binding changes, provider account changes, production deployment, or broker-route changes.
- No claim that Exness, Binance private account, or IBKR account reads are already authenticated and working for the owner.

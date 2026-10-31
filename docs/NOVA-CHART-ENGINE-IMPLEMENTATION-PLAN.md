# NOVA Chart Engine — implementation and verification plan

**Tracking issue:** #139  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Inspected baseline:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Feature branch:** `feat/nova-chart-engine-lightweight-20261031`  
**Status:** Design / contract plan only. No runtime code, provider configuration, deployment, or broker state changed.

## 1. Repository findings

- `frontend/package.json` currently does not include `lightweight-charts`.
- `frontend/app/markets/page.jsx` intentionally shows `FEED NOT VERIFIED`; it does not fabricate quotes.
- `frontend/app/settings/broker/page.tsx` already obtains the signed-in Supabase session and reads bounded Exness quote/candle data through the System Hub.
- `integrations/system-hub/README.md` documents the owner-scoped endpoint:
  `GET /v1/connections/:connectionId/quotes?symbol=XAUUSDm&timeframe=M1&count=3`.
- `integrations/mt5-readonly-bridge/bridge.py` exposes GET-only `/api/symbols` and `/api/quotes`; quote payloads contain ISO-8601 UTC candle times, OHLC, tick volume, spread, real volume, tick bid/ask/time, `as_of`, `mode=read-only`, and `order_submission_enabled=false`.
- `docs/NOVA-CUSTOMER-COMMAND-CENTER-IMPLEMENTATION.md` still identifies the SMC chart as a verified-data placeholder and says annotations must be sourced from validated server contracts.
- SMC code exists at `workers/feature/smc_wave/smc_strategy.py`, with tests in `tests/test_smc_strategy.py`. It is heuristic research and not a production signal.
- Wave3 PR #66 remains open and not performance-approved. Its recorded Final OOS result is below the majority baseline with zero closed trades; PR #118 labels Wave3 blocked and depends on PR #94. Chart work must not change or bypass those gates.

## 2. Technology decision

Use **TradingView Lightweight Charts** for the chart canvas. It is a client-side visualization library, not a market-data provider and not a strategy engine. NOVA supplies its own data and builds its own indicators/overlays.

- Install and pin a reviewed `lightweight-charts` version in `frontend/`.
- Load it only inside a client component; do not instantiate it during Next.js server rendering.
- Include the required TradingView attribution notice and link required by its Apache 2.0 license / NOTICE.
- Do not use Advanced Charts or Trading Platform as an implicit substitute; those are separate products with different access/licensing and integration requirements.
- Official references:
  - https://tradingview.github.io/lightweight-charts/
  - https://tradingview.github.io/lightweight-charts/docs/product-comparison
  - https://github.com/tradingview/lightweight-charts

## 3. Target architecture

```text
Netlify Next.js Frontend
  └─ authenticated client chart component
      └─ same-origin NOVA chart API (server-side)
          └─ Supabase session validation
              └─ NOVA System Integration Hub
                  └─ owner-owned broker_connections row
                      └─ MT5 read-only Proxy / tenant Relay
                          └─ Exness Demo Windows Bridge (GET only)

Chart rendering:
  validated candles → Lightweight Charts candlestick series
  validated SMC response → deterministic annotation adapter → markers / price lines
  Wave3 result → separate research-only overlay (BLOCKED until evidence gates pass)
```

Do not create a parallel broker gateway. Browser code must not call the MT5 Proxy, Relay, or Bridge directly. The browser must not submit owner ID, tenant ID, or an arbitrary upstream URL as an authorization selector.

## 4. Candle data contract

Normalize the existing System Hub quote response into a versioned chart DTO. Proposed shape:

```ts
type NovaChartCandle = {
  time: number; // Unix seconds, UTC, for Lightweight Charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type NovaChartSnapshot = {
  schema: "nova.chart-snapshot.v1";
  provider: "exness_mt5";
  environment: "demo";
  symbol: string;          // exact terminal-discovered symbol
  timeframe: "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";
  sourceAsOf: string;      // ISO-8601 UTC from trusted upstream
  receivedAt: string;      // server timestamp
  mode: "read-only";
  orderSubmissionEnabled: false;
  candles: NovaChartCandle[];
};
```

The chart API must validate:
- finite numeric OHLC values, positive prices, and `low <= open/close <= high`;
- unique, strictly ascending UTC timestamps after normalization;
- valid timeframe alignment and no future timestamps;
- bounded count, symbol length, supported timeframe, payload size and request duration;
- freshness and gaps, reported explicitly rather than silently interpolated;
- source/provider/environment metadata and read-only flags.

Do not invent bars, fill gaps with synthetic prices, infer the broker symbol, or label a stale snapshot live. Discover exact symbols through the authenticated Hub/Bridge symbol endpoint. Never hardcode `XAUUSDm` as universal.

## 5. UI behavior

- Replace the Markets placeholder only after a verified candle snapshot is returned.
- Provide symbol and timeframe controls populated from trusted server responses.
- Show source, Demo environment, last source timestamp, candle count, and read-only status.
- Show explicit states for signed-out, pending provisioning, tenant denied, unsupported symbol/timeframe, empty feed, stale feed, invalid payload, and upstream unavailable.
- Clear chart data and in-flight requests when Supabase identity changes; prevent old-user data from flashing in the next session.
- Responsive layout and keyboard-accessible controls.
- No order ticket, buy/sell action, broker mutation, position modification, or trading switch.

## 6. SMC and Wave3 overlay boundaries

### SMC
- Use the existing research module only through a bounded, server-validated contract.
- Map each event to an exact candle timestamp/index from the same immutable candle snapshot.
- Display event type, direction, confirmation status and research provenance.
- Render BOS/CHoCH, OB, FVG and liquidity sweep only when returned and validated.
- Mark the current SMC implementation as heuristic/research-only. Do not call its annotations trade signals.
- Add tests against future-bar/look-ahead leakage and off-by-one/timezone misalignment.

### Wave3
- Keep the Wave3 overlay independent of the SMC layer.
- Do not merge PR #66 or bypass PR #118's dependency on PR #94.
- Current UI state must say **BLOCKED / NOT PERFORMANCE-VALIDATED** while Final OOS remains below baseline and has zero closed trades.
- No Wave3 BUY/SELL recommendation or confidence badge is permitted until its separate performance, walk-forward and calibration gates are passed and reviewed.
- Chart integration must not change strategy thresholds, weights, entry filters, tuning policy, or Final OOS boundary.

## 7. PR breakdown

### PR A — this design/contract PR
- Add this plan and link tracking issue #139.
- No runtime or provider changes.

### PR B — chart data contract and Lightweight Charts UI
- Pin dependency, implement client-only chart component and same-origin authenticated chart API.
- Reuse System Hub; add candle validation and symbol/timeframe discovery.
- Add chart API, schema, identity-change, error-state, and build tests.

### PR C — SMC annotation adapter
- Implement deterministic mapping from existing SMC research output to chart markers/price lines.
- Add chronology, timestamp, no-look-ahead and malformed annotation tests.
- Keep all SMC output research-only.

### PR D — Wave3 research overlay (gated)
- Only after PR #66 performance evidence is repaired and reviewed, and PR #118's strategy lifecycle contract is reconciled.
- Read-only visualization only; no strategy promotion by UI code.

## 8. Verification gates

Required on the exact PR head:
1. Frontend unit/contract tests and TypeScript typecheck.
2. Next.js production build and Cloudflare OpenNext build.
3. Existing System Hub authorization and MT5 Proxy/Relay tenant-isolation suites.
4. Chart tests: invalid OHLC, duplicate/out-of-order times, stale/future candles, gaps, empty response, symbol not found, unsupported timeframe, upstream 401/403/404/409/502, identity switch, and request cancellation.
5. SMC mapping tests: stable event-to-candle index, timezone correctness, no future data, and empty annotations.
6. Exact-SHA Preview route and browser visual/accessibility checks.
7. Hosted staging owner A success plus owner B foreign connection denial. Anonymous 401 is not sufficient evidence of tenant isolation.
8. Real Exness Demo quote/candle evidence only after the dedicated tenant route is provisioned and the signed-in owner path succeeds.

## 9. Safety and release policy

- Exness Demo only.
- Read-only data access only.
- `ordersEnabled=false`, `executionEnabled=false`, `order_submission_enabled=false`, `liveTradingEnabled=false`.
- No broker write APIs, order tickets, trading actions, or production route changes.
- No secret, tenant token, service-role key, account identifier, or raw private payload in source, PR text, browser bundle, or logs.
- No merge or production deploy until exact-head review, all applicable checks, staging tenant tests, and separate user release approval pass.

## 10. Current blockers

1. Dedicated Exness tenant Bridge route and `MT5_TENANT_ROUTES` provisioning must be verified for the intended account; do not treat an existing pending request or healthy Worker as connected.
2. Hosted authenticated owner-session and foreign connection-ID denial need evidence.
3. Wave3 remains blocked by its own research-performance gate; it is not a chart release dependency for the initial candle/SMC chart.
4. SMC is a heuristic research module; its chart annotation contract and no-look-ahead alignment need separate review.
5. The current `/markets` page is a placeholder; avoid showing any sample chart as real data.

**Definition of done:** Reviewed implementation PRs, exact-head CI and preview evidence, owner-isolation proof, real read-only Exness Demo candle evidence, deterministic SMC overlays, honest Wave3 blocked state, and verified trading safety flags.
# NOVA AI Live Trading — Product Transition and Production Readiness Plan

**Canonical repository:** vutting895/VOOM_SYSTEM-NOVA-AI  
**Base:** main @ 54750cd170d72ae3b90c5b28c16cb8c1b76f3a22  
**Owner directive:** 2026-10-31  
**Tracking:** Issues #172, #163, #36, #82  
**Frontend/backend:** Netlify + Cloudflare Workers + Supabase  
**Broker target:** Exness, with independent MT5 Bridge and Trader API adapters

## 1. Product decision

The product target is changed from a read-only/paper-only product to a production-capable AI trading platform that can support real-money trading after the release gates in this document are met.

This is a development/product requirement change. It does not authorize a live order, funding, production secret intake, route provisioning, production deployment, or activation of broker writes. Production activation is a separate, explicit approval bound to an exact release SHA, broker, account environment, instruments, risk envelope and activation window.

## 2. Target product experience

The customer receives one NOVA application and one authenticated workspace:

- **AI Copilot:** conversational analysis, strategy explanations, market context, trade thesis, risk explanation, portfolio and execution status. Model output is untrusted data and can only create typed proposals.
- **Strategy workspace:** strategy/version selection, SMC Mean Rejection as the primary strategy, XGBoost/PyTorch LSTM as supporting model research, benchmark/challenger comparisons, walk-forward results, signal history and model/data provenance.
- **Trading terminal:** verified quotes/charts, account balance/equity/free margin, positions, pending orders, fills, realized/unrealized P&L, fees, spread and connection freshness.
- **Risk center:** exposure, position sizing, leverage/margin, daily loss, drawdown, max order notional, concentration, spread/deviation, market/session/news and stale-data guards.
- **Execution center:** proposal review, order lifecycle, broker acknowledgements, partial fills, rejection/cancel state, reconciliation and immutable audit trail.
- **Operations:** connection readiness, service health, data freshness, alerts, kill switch, incident history and rollback/recovery status.
- **Personal AI:** owner + tenant + workspace scoped threads and context; no cross-customer memory or authority over policy.

Every displayed value must come from a verified API response with source, timestamp and freshness metadata. Missing/stale/unavailable values must be shown as such. No illustrative chart or hardcoded sample may be styled or labeled as live data.

## 3. AI architecture and authority boundary

1. Intent parser converts natural language into a discriminated, versioned schema. Invalid or ambiguous intents are rejected or clarified.
2. Market-data and broker tools are bounded, authenticated and allowlisted.
3. Strategy runtime uses versioned deterministic feature/decision contracts and records code, config, model and dataset hashes.
4. AI may research, explain and propose a trade intent. AI cannot choose tenant/account/route, change risk policy, invent a quote, override a rejection, or call an arbitrary broker endpoint.
5. The server independently validates the intent, ownership, entitlement, account mode, quote freshness, market state, risk policy and approval state.
6. Execution is a separate deterministic service. It accepts only a server-signed, short-lived, single-use execution authorization referencing an immutable proposal and risk decision.
7. Every state transition is auditable and reconciled against broker state; uncertain outcomes are never blindly retried.

## 4. Trading strategy readiness

SMC Mean Rejection replaces Wave3 as the primary deterministic strategy candidate. XGBoost and PyTorch LSTM remain separate supporting model candidates. This architecture is not evidence of a profitable strategy.

- Preserve PR #66's frozen Wave3 benchmark and untouched Final OOS as historical comparison evidence. Wave3 is no longer the primary strategy candidate; its recorded Final OOS result is zero closed trades and it has not established positive net-of-cost expectancy.
- Continue the separate challenger/research redesign (including PR #147) without relaxing SMC/Fibonacci/RSI/volume/spread/news/model/risk gates or tuning on Final OOS.
- Use chronological nested walk-forward with purge/embargo, realistic spread, commission, slippage, swap/funding and instrument contract sizing.
- Compare to simple baselines and report trade count, expectancy, PF, drawdown, Sharpe/Sortino, calibration, regime/fold stability and uncertainty.
- No strategy is promoted to demo execution or live use without sufficient independent OOS evidence and explicit versioned acceptance criteria. A positive backtest alone is insufficient.

## 5. Deterministic risk engine

Risk is server-owned, independent of model output, and fail-closed. It must validate at minimum:

- Account equity, free margin, currency and instrument contract specification.
- Position size and notional using broker tick/lot/contract rules; rounding must never increase risk beyond the approved amount.
- Per-order, per-symbol, per-strategy and total portfolio exposure limits.
- Leverage, margin utilization and margin-call buffer.
- Daily realized + unrealized loss, rolling drawdown and consecutive-loss circuit breakers.
- Spread, slippage, price deviation, quote age, market session, market status and news/event restrictions.
- Duplicate intent/order, open-order conflicts, rate limits and broker capability/permission.
- User entitlement, consent, account environment, approved instrument list and active kill-switch state.

Missing, stale, contradictory or malformed inputs must reject. Risk decisions must contain policy version, input provenance, reason codes and immutable decision ID. Risk limits cannot be relaxed by chat or UI.

## 6. Broker execution and reconciliation

Keep Exness adapters separate:

- **MT5 Demo/Live Bridge adapter:** dedicated tenant bridge session, authenticated relay, owner-bound route, strict allowlisted operations and explicit environment identity.
- **Exness Trader API adapter:** separate API eligibility, Ed25519 signing and Gateway/Access Point discovery; separate key custody, connection lifecycle and endpoint allowlist. Do not assume a standard MetaTrader account is API eligible.
- Do not share API credentials, tokens, signing keys or connection state across the adapters.

Required order lifecycle contract: validate → authorize → submit once → acknowledge/reject → partial/full fill or cancel → reconcile open orders/positions/account → persist broker references and audit. Handle timeout/unknown outcome by querying broker state with the original idempotency/client reference before any retry. Support cancel/replace only through explicit policy and a new authorization. Never assume an HTTP success means a fill.

Before any live-account test, complete the full lifecycle in an isolated Exness Demo account, including rejection, partial fill, timeout, disconnect/reconnect, duplicate replay and emergency stop.

## 7. Secret custody, identity and tenant isolation

- No broker password, API private key or bridge token in browser storage, chat, model prompts, ordinary database columns, Git, logs or test artifacts.
- Complete reviewed server-side secret custody, least-privilege service identity, encryption/key separation, rotation, revocation, backup/restore and audit redaction.
- The Hub derives owner and tenant from a verified session and trusted registry. Client-supplied IDs never prove authorization.
- Verify RLS and API authorization with at least two independent users and two broker connections; include cross-owner negative tests.
- Keep MT5 Bridge and Trader API credential custody/lifecycle separate.
- No customer real credential intake until custody and two-owner isolation have passed independent review.

## 8. Dashboard implementation requirements

Build on the canonical frontend; do not create a parallel application. Reconcile the existing dashboard work (PR #146), customer workspace (Issue #82), existing broker routes and System Hub.

Required pages/areas:
1. Overview: account mode, equity, balance, free margin, P&L, data freshness, service/connection readiness.
2. Markets: real quotes, candlesticks, spread, timeframe and provider timestamps.
3. AI workspace: chat, signal cards, thesis, invalidation, confidence/calibration and source evidence.
4. Strategy lab: strategy versions, backtest/walk-forward evidence and promotion state.
5. Risk center: live risk metrics, policy limits, rejections and kill switch.
6. Orders/positions: pending/open/closed orders, fills, positions, broker IDs, fees and reconciliation status.
7. Journal/analytics: realized/unrealized P&L, trade attribution, drawdown and strategy/regime breakdown.
8. Broker hub: adapter, account environment, permissions, readiness, credential status without exposing secrets.
9. Personal workspace: owner-scoped strategy instance, preferences, consent and Personal AI.

Dashboard states must distinguish demo vs live, paper vs broker execution, connected vs authenticated vs data_verified, pending vs acknowledged vs filled, and stale vs unavailable. No control may bypass server-side authorization. Live controls must default OFF and require step-up authentication and an explicit review/confirmation.

## 9. Delivery phases and acceptance gates

### P0 — Baseline and reconciliation
- Re-inspect main and all related PR heads before each slice.
- Reconcile #146 dashboard, #82 workspace, #166 paper ledger, #152 Trader API, #168 adapter contract, #156/#130 custody and strategy research PRs.
- Preserve existing code and branch relationships; do not merge stale branches.

### P1 — Functional AI and dashboard on verified read APIs
- Implement real data bindings for broker status, quotes, account snapshots and strategy state.
- Implement typed AI intent/proposal APIs with provenance and deterministic error states.
- Implement responsive dashboard and owner-scoped Personal AI.
- Acceptance: auth, route, API contract, accessibility and two-owner UI/API isolation tests pass on exact SHA; no fake live data.

### P2 — Strategy and risk engine
- Complete reproducible research pipeline and independent risk policy.
- Acceptance: deterministic regression, boundary, property, stale-data, news/session and fail-closed tests; research evidence meets preregistered OOS gates.

### P3 — Demo execution adapter
- Implement typed order lifecycle only behind a disabled-by-default capability boundary.
- Acceptance: isolated Demo lifecycle, idempotency, unknown-outcome reconciliation, partial fills, rejection, cancel, disconnect/reconnect, kill switch and no-cross-tenant tests.

### P4 — Production controls and operations
- Complete custody, rotation/revocation, monitoring, alerting, incident response, rollback, rate limits, step-up auth and operational runbooks.
- Acceptance: independent security review and full staging evidence on exact deployment SHA.

### P5 — Live activation decision
Requires a separate owner approval that names:
- exact broker and adapter;
- exact account environment and account identity verified privately;
- approved instruments and order types;
- max order notional, per-trade risk, total exposure, daily loss and drawdown limits;
- execution mode, deployment SHA, activation window and kill-switch operator.

No automatic activation follows from passing CI, merging a PR, demo fills or dashboard readiness.

## 10. Current blockers at baseline

- Live execution module is an explicit disabled stub; it is not a production broker adapter.
- Risk manager is a paper-only prototype.
- PR #166 is an in-memory single-process paper ledger and remains Draft/unmerged.
- Dashboard PR #146 is open and does not prove a deployed, fully wired terminal.
- Exness Trader API client PR #152 remains separated from customer routes by credential custody gates.
- Local MT5 Bridge was observed without a listener on 127.0.0.1:8787; Windows disks had only about 14 MB free at last check.
- Wave3 benchmark has not demonstrated a positive out-of-sample edge.
- GitHub CI/Preview evidence has had missing runner steps/logs; no missing check may be assumed to pass.

## 11. Global invariants

- No direct pushes to main; use focused branches and reviewed PRs.
- No secret values in chat, issues, code, CI output or artifacts.
- No production migrations, credentials, broker routes, deployments or order submissions without their own explicit approval.
- All order mutations are disabled by default and enforced server-side until P5 activation approval.
- The AI cannot authorize itself or modify risk/tenant/capability policy.
- Never claim AI, dashboard, broker connectivity, strategy profitability or live trading is ready without exact-head code, CI, runtime and provider evidence.


## Owner decision addendum — dual Exness Live adapters

**Confirmed by owner on 2026-10-31:** use both Exness MT5 Bridge and Exness Trader API; an existing Exness Live account is available. Continue AI and Dashboard development. Do not send any real-money order before a separate Production activation approval.

### Adapter boundaries

- **MT5 Bridge Live:** a dedicated, owner-bound MT5 Live connection and route. This is separate from the existing Demo connection. The current main schema, Hub and MT5 Proxy explicitly allow only `environment=demo`; they must not be relabeled or bypassed. Add Live support only through a reviewed additive schema/API change with explicit environment capability, separate tenant route, separate account verification, and tests proving Demo/Live route isolation. Read-only account/quotes are the first acceptance; order methods remain absent.
- **Exness Trader API:** separate account eligibility, API key, Ed25519 key custody and Gateway/Access Point discovery. Never reuse MT5 login/password, bridge token or connection ID as Trader API credentials. The API account may be different from the MT5 account; do not require or assume same-account identity.
- **System Integration Hub:** remains the only identity, connection registry, authorization, policy and audit control plane. No parallel gateway.
- **Account state:** the owner says an existing Live account is available, but NOVA has not yet verified its platform type, API eligibility, account identity or authenticated connection. Keep account state `owner_reported_existing` until verified by the relevant adapter. Do not copy an old Demo account identifier into a Live connection.

### Implementation sequence for both channels

1. Preserve current Exness MT5 Demo flow and its tenant route as-is.
2. Add an isolated MT5 Live connection contract and schema review; do not expand the current Demo-only constraint in place without an additive migration and rollback plan.
3. Extend the Broker Hub UI to show separate Demo MT5, Live MT5 and Trader API cards, each with its own environment, connection state, verification timestamp and capabilities.
4. Keep Trader API client isolated behind reviewed tenant credential custody. The existing client is only a synthetic/read-only prototype and has no customer route.
5. Verify the existing Live account privately through MT5 Live if it is an MT account. Separately inspect Exness Key Management for API eligibility and account selection. If eligible, register a separate Trader API connection.
6. Add live-capable order lifecycle only after risk, secret custody, tenant isolation, Demo order lifecycle and production operations gates pass.

### Dashboard truthfulness

The UI must never collapse the two adapters into one generic "Exness connected" status. It must distinguish `owner_reported`, `configured`, `authenticated`, `data_verified`, `stale`, `unavailable`, and `not_eligible`. Live account balance, quotes, positions and P&L are not displayed as verified until that adapter returns authenticated, owner-bound data with provider timestamps.

### Explicit current limitations

- Current main migration `202610270001_mt5_customer_connections.sql` constrains both provider and environment to `exness_mt5` / `demo`.
- Current MT5 Proxy rejects every environment other than Demo.
- Current System Hub registry exposes only `exness-mt5-demo`.
- Current frontend Broker Status endpoint creates/reads only an Exness MT5 Demo connection.
- Current Trader API PR #152 contains signed GET client code only; no market-data read, credential custody, customer route or order API.
- Therefore the existing Live account has not been connected or verified by this decision. No production credentials or orders were used.

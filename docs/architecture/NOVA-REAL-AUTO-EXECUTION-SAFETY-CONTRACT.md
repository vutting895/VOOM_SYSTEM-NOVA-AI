# NOVA Real-Auto Execution Safety Contract

**Status:** AUDIT BLOCKED — design contract only; not execution authorization  
**Audit date:** 2026-11-11  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Audited base:** `dad49ccbd6e69a02c6bb5c248657d6e12a421fe3`  
**Target mode:** `real_auto` (preparation target only)  
**Runtime state:** Live trading OFF; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`

## 1. Non-negotiable safety invariants

1. The AI controller may propose and manage entry, exit, SL/TP, trailing-stop and multiple-position plans only through an explicitly approved execution adapter and the MQL5 EA safety gates.
2. The controller must never modify risk policy, bypass a gate, grant itself execution permission, or switch Live Trading on.
3. Risk per trade is **1% of current equity**. This value supersedes stale 5% values found in draft PR documentation and the audited EA defaults.
4. Daily loss limit is **10% of equity**, with **Entry Lock Only**: block new entries and cancel pending entry orders; retain existing positions and their protective SL/TP. The exact equity baseline and broker-day reset semantics must be reconciled with the approved policy implementation before coding; do not silently substitute Broker Day Start Equity.
5. USD is the canonical risk-calculation currency. THB is reporting-only. Micro/cent conversion must be based on verified account currency/contract metadata and fail closed when denomination cannot be established.
6. No withdrawal, transfer, or unrelated account-management capability may be exposed to the execution controller.
7. Real-account read-only connectivity is not execution authorization. Real order routing requires a separate, explicit activation approval after every production gate passes.

## 2. Source audit evidence

### MQL5 EA

File: [integrations/mt5/MTRADERS_All_In_One_v1.01.mq5](../../integrations/mt5/MTRADERS_All_In_One_v1.01.mq5)  
Blob SHA: `4c506665cf1e47c1863db377f39f78de09a670ba`

Observed defaults:
- `InpTradeEnabled=true`
- `InpRiskPercent=5.0`
- `InpAllowBoundedMinLot=true`
- `InpMaxSingleRiskPct=10.0`
- `InpMaxOpenRiskPct=30.0`
- `InpMaxPositions=30`
- `InpMaxMarginUsedPct=60.0`
- `InpDailyLossPct=35.0`

The source declares 30 module names and state structures, but `OnTick()` contains only a comment and no evaluation pipeline. `OnInit()` only registers names and prints an initialization message. No native MetaEditor compilation or terminal runtime proof was supplied in this audit.

**Disposition:** reject as a production execution EA in its current state. The declared module count is not evidence of 30 implemented strategies.

### Python strategy port

File: [workers/quant_engine/mtraders_strategies.py](../../workers/quant_engine/mtraders_strategies.py)  
Blob SHA: `56c8d65672cd7363b8e1fb10cda4f5fd51f19afa`

The evaluator defaults missing price/ATR/RSI inputs to constants and derives direction from a deterministic expression based on strategy ID and RSI. It does not implement the named strategy logic, data-quality checks, feature provenance, calibrated confidence, or strategy-specific validation.

**Disposition:** classify outputs as synthetic stub signals; prohibit their use for live execution, model claims, or strategy-performance reporting.

### Existing MT5 bridge and relay

- `integrations/mt5-readonly-bridge/bridge.py` and its README describe authenticated, tenant-scoped, GET-only Exness Demo access.
- The bridge rejects non-GET/OPTIONS methods and explicitly restricts the terminal to Exness Demo.
- `integrations/mt5-bridge-relay/worker.js` allowlists only `/health`, `/api/account`, `/api/symbols`, and `/api/quotes`; order-like paths and non-GET requests are rejected.
- The relay health endpoint proves Worker availability only, not a customer terminal session or broker identity.

**Disposition:** preserve the Demo read-only boundary unchanged. Do not weaken it to support Real. A future Real read-only adapter must be separately scoped, separately authenticated, tenant-isolated, and reviewed. It must still expose no order routes.

## 3. Required execution architecture

The future execution path must be layered and fail closed:

1. **Signal layer:** produces timestamped, symbol-specific proposals with strategy/model version, source data provenance, confidence calibration, and expiry. It has no broker credentials or order API.
2. **Policy/risk layer:** independently recalculates stop distance, tick value, contract size, volume, margin, per-trade risk, aggregate open risk, daily loss, and account-currency normalization. It does not trust AI-supplied sizing.
3. **Execution Safety Adapter:** validates authenticated owner/tenant/account identity, broker/server, account mode, symbol trading permissions, market freshness, spread/slippage limits, idempotency key, duplicate exposure, and all policy limits before forwarding a bounded request.
4. **MQL5 EA gate:** independently revalidates the request and rejects malformed, stale, duplicated, oversized, policy-inconsistent, or unauthorized instructions. The EA cannot change policy or elevate its own permissions.
5. **Broker result reconciliation:** records request ID, broker retcode, order/deal/position identifiers, actual fill price/volume, SL/TP state, timestamps, and reconciliation status. A timeout is an unknown outcome, not permission to retry blindly.
6. **Kill switch and rollback:** a server-side execution lock plus terminal-side hard disable; emergency stop blocks new entries and pending entries while preserving protective controls for existing positions.

No component may treat an AI proposal, UI state, health endpoint, CI pass, or local simulation as proof of a broker fill.

## 4. Mandatory production gates

| Gate | Required evidence | Current disposition |
|---|---|---|
| Repository integrity | Current main SHA, reviewed PR base/head, merge-base and changed-file audit | Baseline inspected; recheck before every release |
| EA implementation | Complete strategy functions, risk enforcement, order lifecycle, native compile log | **BLOCKED** |
| Strategy validity | Real feature pipeline, per-strategy tests, walk-forward and untouched OOS evidence | **BLOCKED** |
| Risk policy | 1% current-equity sizing; 10% daily loss; verified reset/baseline semantics | **BLOCKED** |
| Currency/contract model | Verified USD/cent conversion, tick size/value, contract size and volume steps | **BLOCKED** |
| Exposure controls | Aggregate open risk, margin cap, position cap, hedging/netting behavior | **BLOCKED** |
| Order safety | Idempotency, duplicate prevention, partial fills, requotes, timeout reconciliation | **BLOCKED** |
| Identity isolation | Owner session, tenant binding, broker/server/login verification, foreign-tenant denial | **BLOCKED** |
| Real read-only adapter | Separate implementation and evidence; no order endpoints | **BLOCKED** |
| Demo integration | End-to-end authenticated account/quote/position proof with safety tests | **BLOCKED** |
| CI and security | Exact-head CI green, independent security review, dependency and secret checks | **BLOCKED** |
| Production activation | All gates signed off and separate explicit user approval | **NOT AUTHORIZED** |

## 5. Minimum test matrix before any activation request

- Unit tests: lot sizing, stop-distance risk, tick-value conversion, cent-account conversion, daily-loss accounting, broker-day reset, aggregate exposure and margin.
- Property/fuzz tests: invalid symbols, zero/negative values, NaN/Infinity, oversized volumes, stale prices, malformed requests, repeated IDs and boundary rounding.
- State-machine tests: request accepted/rejected, partial fill, requote, timeout/unknown result, reconnect, restart and reconciliation.
- Tenant/security tests: missing/invalid token, mismatched tenant, cross-owner connection ID, wrong login/server, revoked session and replayed request.
- Terminal tests: MetaEditor compile, Strategy Tester, demo forward test, hedging and netting account behavior, broker-specific contract specifications.
- Operational tests: kill switch, pending-entry cancellation, protective SL/TP retention, audit-log integrity, alerting and rollback.
- Strategy acceptance: cost-aware walk-forward; final untouched OOS beginning 2026-07-01; at least 30 closed OOS trades; positive net profit; profit factor above 1 and above baseline; no tuning on final OOS.

## 6. Known policy conflicts and reconciliation status

- **Active Demo per-trade policy:** 1% of current Equity in USD. PR #276's policy document has been updated to this value.
- **5% per-trade:** no 5% policy is currently authorized for Demo or Real accounts. Any 5% value or caller override found in draft code/docs is unapproved and must not be wired or enabled. The active per-trade cap remains 1% of current USD Equity.
- **Daily loss:** 10% with Entry Lock Only is approved. The exact Equity baseline (current Equity versus broker-day opening Equity) remains unresolved against the production implementation. Do not silently adopt Broker Day Start Equity.
- **Aggregate exposure:** the owner-approved aggregate open-risk ceiling is 9% of Equity in USD. PR #277 does not calculate or enforce aggregate open risk; this remains a production blocker.
- **MT5 read-only engine:** PR #280 uses 1% Demo / 10% daily constants and contains no broker mutation API, but it does not enforce the complete daily-loss lock, USD normalization, or 9% aggregate exposure gate.
- **EA defaults:** the audited main-branch EA defaults are materially more permissive than NOVA policy. PR #283 proposes safer disabled defaults, but it remains unmerged and MetaEditor compilation has not been demonstrated.
- Existing Demo bridge cannot be reused as a Real adapter; Real read-only requires a separately scoped and independently reviewed adapter.
- A 30-name module registry and deterministic Python strategy stub do not establish strategy implementation or performance.

## 7. Release rule

This document is a safety contract and audit artifact only. It does not change EA behavior, bridge permissions, broker credentials, risk policy, production configuration, or Live Trading state. Merge or deploy only after review and all applicable gates pass. Live Trading remains OFF until a separate explicit activation approval is obtained after the production gate review.

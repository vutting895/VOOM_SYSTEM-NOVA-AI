# NOVA v1 Master Integration — Release 01

- Status: architecture baseline / source audit; not an execution release
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Source-of-truth baseline: `main` at `30d02c4dcbd47aefdc1de93ddffbca3b0a4a6567`
- Feature branch: `docs/nova-v1-master-integration-release-01-20261118`
- Scope: Forex + Gold + Crypto; NOVA v1 is the master system; MTRADERS All-in-One is an integrated strategy/MT5 subsystem, not a second master platform.
- Change boundary: documentation only. No production code, deployment, secrets, database, risk-policy activation, broker mutation, or Live Trading changes.

## 1. Executive architecture decision

NOVA v1 is the single control plane and product boundary. All-in-One contributes strategy concepts and an MT5-facing execution adapter only after its source, behavior, and safety have been independently verified. It must not run as a parallel autonomous system with its own competing risk policy.

The target system is a hybrid of deterministic services and AI research/decision components:

1. Market adapters normalize Forex, Gold, and Crypto market data into a canonical, timestamped market-data contract.
2. Quant and AI engines generate research outputs and candidate trade intents. They do not hold broker credentials or call broker APIs.
3. Meta Decision Layer combines eligible strategy/model votes and emits a versioned decision.
4. Deterministic Risk Guard validates account identity, freshness, exposure, currency conversion, limits, symbol permissions, and kill-switch state.
5. Approval Gate records the required human/policy authorization. AI output cannot approve itself.
6. Demo Execution Service and a separately isolated MT5 Demo adapter may execute only after the feature is explicitly enabled through a reviewed release gate. No Live adapter is in scope.
7. Journal/reconciliation records intent, approval, broker acknowledgement, final order/position state, and audit evidence.
8. Learning consumes verified, provenance-backed outcomes only; it cannot auto-promote a model or modify risk policy.

## 2. Target topology

```text
Web / Mobile / Approved EA client
             |
       HTTPS + Supabase Auth
             |
       NOVA System Hub (Cloudflare)
       - auth + tenant resolution
       - capability registry
       - allow-listed routing
       - request limits + audit IDs
             |
   +---------+-----------+------------------+
   |         |           |                  |
Market    AI Runtime   Quant Engine     Approval Service
Data      / Providers  / Backtest       / Audit Ledger
   |         |           |                  |
   +---------+----- Trade Intent ----------+
                         |
                  Meta Decision Layer
                         |
                   Deterministic
                     Risk Guard
                         |
                    Approval Gate
                         |
             Demo Execution Service (off)
                         |
               Signed, tenant-bound command
                         |
               MTRADERS / NOVA MT5 EA
                         |
                 Exness MT5 Demo only
                         |
                Journal + Reconciliation
```

Production hosting target remains Netlify for the frontend, Cloudflare Workers for edge/control-plane services, Supabase for Auth/data, and a separately operated Python service for quant workloads where required. Hosting topology does not prove deployment health.

## 3. Domain ownership

| Domain | Owner | Responsibility | Forbidden coupling |
|---|---|---|---|
| System Hub | NOVA | Auth, tenant resolution, service registry, routing, capability status | Arbitrary URL proxy; broker writes |
| Market Data | NOVA | Provider adapters, canonical symbols, UTC bars/quotes, provenance | Model-generated or fabricated prices |
| Quant Engine | NOVA | Indicators, SMC, MTRADERS research, backtests, cost model | Broker credentials or order submission |
| AI Runtime | NOVA | Gemini primary and bounded fallback providers; explainable analysis | Authorization, risk-policy mutation, direct broker calls |
| Meta Decision | NOVA | Combine versioned votes; produce candidate/no-trade | Bypassing Risk Guard |
| Risk Guard | NOVA | Deterministic account-wide risk and policy evaluation | LLM-controlled thresholds |
| Approval | NOVA | Human/policy approval, expiry, immutable audit events | Self-approval by model or client-supplied identity |
| Execution | NOVA | Intent ledger, idempotency, Demo command lifecycle | Live route or unbounded retry |
| All-in-One / MT5 | Integrated subsystem | MT5 market/account adapter and strategy-specific implementation after audit | Independent risk authority or direct public API |
| Journal/Learning | NOVA | Reconciliation, outcomes, evaluation and governed learning | Training on unverified or synthetic outcomes |

## 4. Asset-class separation

Forex, Gold, and Crypto share common contracts, but not assumptions. Each asset class requires its own symbol mapping, session/calendar model, trading-cost and slippage model, market-data validation, contract sizing, and evaluation. Gold-specific features or thresholds must not silently apply to Forex or Crypto.

Gold may be the first vertical for end-to-end validation. Forex and Crypto remain separate adapters and validation tracks until their data and execution semantics are proven.

## 5. Safety invariants

- Initial and current operational posture: Demo/read-only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false` unless a later, separately approved Demo-only release changes the first two flags.
- No Live execution service, credentials, endpoint, or fallback is introduced in Release 01.
- The AI/EA can propose a Trade Intent, not grant itself authority.
- Missing, stale, malformed, unverified, or inconsistent inputs fail closed.
- Daily-loss lock blocks new entries only; it does not disable protective management of existing positions.
- Exposure counts must be account-wide across all symbols, strategies, EA instances, open positions, and pending orders.
- Count-then-submit is not atomic. Execution requires a durable account-scoped reservation/lock and broker reconciliation.
- Idempotency must survive process restart and ambiguous broker responses.
- Account currency and instrument contract semantics must be verified before monetary risk is accepted. USC/cent accounts must not be treated as USD without a verified conversion/scale rule.
- Risk policy remains policy-owned. This document does not activate or change production thresholds.

## 6. Release 01 deliverables

- `NOVA-V1-MASTER-ARCHITECTURE.md`: target architecture and boundaries.
- `SOURCE-INVENTORY.md`: observed source files, branch candidates, and blockers.
- `DEPENDENCY-MAP.md`: PR/branch relationships and integration order.
- `API-CONTRACT.md`: proposed versioned intent, approval, risk, and execution boundary.

## 7. Release gates after R01

| Release | Scope | Exit evidence |
|---|---|---|
| R02 | System Core + API contracts | Auth/tenant tests, schema compatibility, no production cutover |
| R03 | Market Intelligence | UTC/provenance/freshness and per-asset data quality |
| R04 | Hybrid AI + Quant | Deterministic model contracts, reproducible tests, no fabricated training |
| R05 | Meta Decision + Risk + Approval | Fail-closed unit/integration tests, currency and exposure reconciliation |
| R06 | All-in-One / MT5 adapter | Reconciled source, MetaEditor compile log, EA static review, command auth/idempotency |
| R07 | Automated Demo | Explicit Demo identity lock, account-wide atomic reservations, Demo lifecycle and reconciliation proof |
| R08 | Production gate | Independent security, reliability, model/OOS and operational approval; Live is a separate decision |

A release is not complete because its branch or PR exists. Evidence must match the exact reviewed commit SHA.

## 8. Non-goals of this branch

No source code integration, strategy activation, MT5 installation, order placement, risk-policy rollout, database migration, secret change, CI runner/budget change, or deployment is performed by this documentation branch.

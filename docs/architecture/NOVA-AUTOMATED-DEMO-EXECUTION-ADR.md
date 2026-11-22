# NOVA Automated Demo Execution — Architecture Decision Record

- Status: proposed for implementation; execution remains disabled
- Decision: Automated Demo mode (no per-order approval)
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Base: `b11b46420b5056fea1c1570c4382e6097928c771` (`main`, checked 2026-11-16)
- Delivery: feature branch only; no production deployment or runtime changes

## 1. Decision

NOVA is to support fully automated order submission on an explicitly identified Exness MT5 Demo account. The system may generate a trade candidate, validate it against deterministic policy, and submit it without a human approving each individual order.

This decision does not authorize Live Trading. Demo execution must remain disabled until the independent safety, identity, broker-environment, and operational gates in this document are implemented and verified.

## 2. Service boundaries

```text
Market Data / MT5 Read-only Adapter
              |
        NOVA AI + Strategy
              |
       Trade Candidate API
              |
       System Hub / Gateway
       - verified user + tenant
       - Demo connection lookup
       - service allow-list
              |
       Risk Gateway (deterministic)
       - schema and freshness checks
       - account / symbol / session limits
       - exposure and daily-loss checks
       - kill switch
              |
       NOVA Execution Service
       - idempotency ledger
       - Demo-only environment pin
       - order request validation
       - execution audit
              |
       MT5 Demo Execution Adapter
              |
       Exness MT5 Demo Terminal
```

The AI/model output is untrusted input. It can propose a candidate but cannot set permissions, bypass risk checks, choose a broker environment, or invoke the broker adapter directly.

## 3. Mandatory safety invariants

1. Demo-only: execution adapter must independently verify the broker account environment and server identity as Demo immediately before submission. Unknown or mismatched environment fails closed.
2. Live disabled: no Live endpoint, credential, route, or fallback is available to this service. `liveTradingEnabled=false` is enforced server-side and cannot be changed by request payload.
3. Disabled by default: `executionEnabled=false` until all release gates are passed and a separately reviewed configuration change is made.
4. Risk Gateway is mandatory for every candidate. Missing, stale, malformed, or unavailable risk inputs reject the candidate.
5. No model-controlled risk settings. Risk limits are policy-owned and immutable to AI, clients, and the execution adapter.
6. Idempotency: every candidate has a stable unique intent key; duplicate/retried requests must not create duplicate broker orders.
7. Audit: record candidate, policy version, decision, normalized request, broker response, timestamps, correlation ID and tenant identity. Never store credentials or access tokens in audit records.
8. Kill switch: a global and per-tenant stop must block new submissions immediately; failure to read switch state means deny.
9. Tenant isolation: derive user and connection ownership from verified identity and database policy; never trust caller-supplied tenant IDs.
10. No automatic retry after an ambiguous broker submission unless reconciliation proves that no order was created.
11. No withdrawals, transfers, deposits, account-setting changes, or Live Trading capabilities.
12. Order modification, SL/TP modification, and position-closing capabilities are separate permissions and are not included in the initial submission API.

## 4. Initial API boundary

The first implementation may define contracts and disabled handlers only:

- `POST /v1/trading/intents` — submit a proposed trade candidate to the Risk Gateway.
- `GET /v1/trading/intents/{intentId}` — read intent state for the owning tenant.
- `GET /v1/trading/execution/status` — report capability and gate status without exposing credentials.

The intent endpoint must return a non-executed state while execution is disabled. Do not expose a direct public broker-order endpoint. Only the private, authenticated execution adapter may communicate with the broker.

## 5. Risk policy configuration gate

Before enabling execution, define and validate explicit policy values for:

- maximum daily loss and the broker-day equity baseline;
- maximum aggregate open risk and per-trade risk;
- maximum concurrent positions/orders;
- allowed symbols, trading sessions, spread/slippage limits and minimum stop distance;
- margin/free-margin floor and account-currency normalization;
- cooldown, duplicate-intent and rate limits;
- mandatory protective stop/target requirements and handling of rejected/partial fills.

No undocumented or inferred numeric defaults may enable trading. Missing policy values mean reject all candidates.

## 6. Required test evidence

- Demo account accepted; Live, unknown, and mismatched account environments rejected.
- Missing/invalid auth, cross-tenant connection IDs, and unauthorized workload identity rejected.
- Risk Gateway unavailable, stale market data, stale account snapshot, or missing policy rejects.
- Daily-loss, open-risk, order-count, spread, slippage, margin and symbol/session boundaries tested.
- Duplicate intent and concurrent retry create at most one broker submission.
- Timeout/ambiguous broker response enters reconciliation state; no blind retry.
- Kill switch blocks all new submissions; failure to load switch state fails closed.
- Model prompt injection and forged client flags cannot enable execution.
- Audit redacts credentials and captures every decision and broker outcome.
- Integration tests use a broker simulator or isolated Demo account only; no Live credentials.

## 7. Release gates

1. Contract and threat-model review.
2. Unit and integration tests with deterministic broker simulator.
3. Static analysis, dependency/security checks and CI success.
4. Demo-only broker integration test with verified server/account environment.
5. Operational kill-switch and reconciliation drill.
6. Independent review of risk policy values and audit retention.
7. Explicit release approval before any Demo runtime enablement.

A passing health endpoint or successful deployment is not evidence that order execution is safe or operational.

## 8. Scope exclusions

This ADR does not enable execution, modify Cloudflare Workers, change Supabase schema or secrets, provision broker credentials, alter risk settings, change EA/MT5 terminal configuration, or deploy to production. Live Trading remains out of scope.

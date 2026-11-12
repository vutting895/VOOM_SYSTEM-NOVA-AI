# NOVA Dual-Environment Trading Authority

**Status:** Design proposal — not runtime authorization  
**Baseline:** `main` SHA `b3ba15c4e8eafc9ee839cb95d42865a0b193e114`  
**Scope:** Support both Exness Demo and Real accounts through one governed architecture while keeping environment credentials, state, permissions, and audit records isolated.

## 1. Decision

NOVA shall support two explicitly selected environments:

- `demo`: automated demo execution may be enabled only after the Demo Execution Gate passes and a separate owner authorization is recorded.
- `real`: live execution remains denied by default. It may be enabled only after the complete Production Gate passes and a separate, explicit, time-bounded owner authorization is recorded.

Selecting the dual-environment architecture is not approval to enable either environment. This document does not change runtime flags, broker connections, credentials, Cloudflare settings, Supabase data, deployments, or MT5 state.

## 2. No global trading booleans

Do not use a single global set of booleans to control both environments. Resolve permissions server-side from the selected environment, authenticated account identity, policy version, and durable authorization record.

Illustrative policy shape (a contract example, not a live configuration):

```json
{
  "schemaVersion": 1,
  "defaultEnvironment": "demo",
  "environments": {
    "demo": {
      "ordersEnabled": false,
      "executionEnabled": false,
      "liveTradingEnabled": false,
      "requiresDemoGate": true,
      "requiresOwnerAuthorization": true
    },
    "real": {
      "ordersEnabled": false,
      "executionEnabled": false,
      "liveTradingEnabled": false,
      "requiresProductionGate": true,
      "requiresSeparateOwnerAuthorization": true
    }
  }
}
```

The false values above are safe defaults. A gate may authorize a narrowly scoped transition for one environment only; it must never mutate the other environment's authority.

## 3. Environment invariants

| Control | Demo | Real |
|---|---|---|
| Credentials and account identity | Dedicated Demo secret reference | Separate Real secret reference |
| Database/session namespace | Environment-bound | Environment-bound |
| Market/account data | Authenticated and provenance-checked | Authenticated and provenance-checked |
| Order permission | Off until Demo Gate + owner authorization | Off until Production Gate + separate owner authorization |
| Execution permission | Off until Demo Gate + owner authorization | Off until Production Gate + separate owner authorization |
| `liveTradingEnabled` | Always false | False until explicit live authorization |
| Withdrawal, transfer, deposit/funding | Prohibited | Prohibited |
| AI self-escalation | Prohibited | Prohibited |

A Demo authorization must not be accepted for a Real account. A Real authorization must bind to the exact account, broker/server, environment, policy version, allowed instruments, risk limits, expiry, and action scope.

## 4. Authority and approval model

1. AI may observe, analyze, generate signals, and propose actions within its assigned scope.
2. A deterministic policy engine validates every proposed action. Model confidence is not authorization.
3. Risk Governor runs before every order: account/environment match, market-data freshness, instrument allowlist, position/order limits, daily loss, aggregate open risk, margin constraints, duplicate/idempotency checks, and kill-switch state.
4. The execution adapter accepts only a server-issued, short-lived authorization bound to an immutable action digest.
5. Human approval is required for activation and for any policy/limit change. Approval expires and cannot be reused for a changed action.
6. AI agents, prompts, model outputs, notebooks, and client-side UI cannot grant or widen permissions.

## 5. Required gates

### Demo Execution Gate

- Exact-head tests and security checks pass.
- Authenticated Demo account identity (login, broker/server, currency, environment) is verified end-to-end.
- Quotes, positions, orders, deal history, and UTC timestamps have source provenance and freshness checks.
- Tenant/account isolation and foreign-account denial tests pass.
- Risk limits are canonical, versioned, and enforced server-side.
- Order submission is idempotent; reconnect, timeout, partial fill, duplicate request, and reconciliation behavior are tested.
- Kill switch, entry lock, flatten/close policy, audit events, and recovery drills are verified.
- Owner separately authorizes Demo execution for a bounded scope and expiry.

### Real Production Gate

All Demo requirements plus:

- Independent security review and production threat model.
- Exact production account identity and broker permission review.
- Backup, rollback, incident response, monitoring, alerting, and operator runbooks tested.
- Risk limits and capital exposure explicitly approved for the exact Real account.
- Failure-injection tests for stale prices, disconnects, slippage, rejection, partial fills, rate limits, and broker outages.
- Reconciliation proves broker state and NOVA ledger remain consistent.
- Separate explicit owner approval for Real trading, with account binding, scope, policy hash, expiry, and revocation procedure.
- No unresolved P0/P1 production blockers.

Until every required condition is evidenced, Real order and execution permissions remain false.

## 6. Canonical risk policy

The risk policy must be consolidated before Demo execution is authorized. The user's previously stated target limits (daily loss 10%, aggregate open risk 9%, maximum 5 open orders) are proposals to validate, not active production limits. The implementation must define the denominator, broker-day boundary, equity/balance basis, currency conversion, open-risk aggregation, treatment of commission/swap, and breach behavior.

A risk breach must fail closed. Entry Lock Only versus forced flattening must be an explicit, separately reviewed policy; do not silently infer one from a percentage threshold.

## 7. Audit and revocation

Every authorization and execution decision must record actor, environment, account fingerprint (never credentials), policy version/hash, action digest, approval reference, timestamp, expiry, risk decision, broker response, and correlation/idempotency key.

Revocation must immediately block new orders. Recovery after revocation, account change, policy change, stale heartbeat, or uncertain broker state requires reconciliation and a fresh authorization. No automatic failover from Demo to Real or Real to Demo is permitted.

## 8. Implementation sequence

1. Inventory every current flag, order-capable route, adapter, Worker, server handler, UI control, and database policy.
2. Introduce typed environment-bound policy and authorization contracts; default deny.
3. Add unit/contract tests proving Demo authorization cannot unlock Real and vice versa.
4. Add durable owner approval, expiry, revocation, and audit binding.
5. Complete authenticated Demo data-path and risk-gate evidence.
6. Run Demo execution tests only after a separate Demo activation decision.
7. Complete the Real Production Gate and request a separate explicit Real activation decision.

## 9. Acceptance criteria

- No global boolean can enable both environments.
- Missing/unknown environment, account mismatch, expired approval, stale data, policy mismatch, risk failure, or unavailable authorization service denies execution.
- Demo and Real credentials, sessions, state, audit, and permissions are isolated.
- Cross-environment authorization tests pass.
- No AI or client-side path can self-escalate authority.
- No Real execution is possible before a separate Production Gate and owner authorization.
- Existing read-only contracts remain in force until their specific replacement passes review and tests.

## 10. Current status

- Architecture target: dual environment.
- Runtime changes: none.
- Demo execution: not authorized by this document.
- Real execution: disabled / not authorized.
- Live Trading: disabled / not authorized.
- Deployment, migration, credential changes, and broker actions: not performed.

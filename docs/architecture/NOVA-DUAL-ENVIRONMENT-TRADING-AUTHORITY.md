# NOVA Dual-Environment Trading Authority

**Status:** Design proposal — not runtime authorization  
**Baseline:** `main` SHA `b3ba15c4e8eafc9ee839cb95d42865a0b193e114`  
**Scope:** Define a low-friction operating model for Exness Demo and Real while isolating credentials, accounts, state, permissions, and audit records.

## 1. Decision

NOVA supports two explicitly selected environments:

- `demo`: the owner may activate automated Demo mode once after the Demo activation checklist passes. After activation, eligible orders are evaluated automatically by the Risk Governor; routine per-order human approval is not required.
- `real`: the owner may activate Real mode once, separately from Demo, only after the Real readiness checklist passes. After activation, eligible orders are evaluated automatically by the same deterministic Risk Governor under stricter account-bound limits. Routine per-order human approval is not required unless a configured exception or risk event requires it.

This replaces repeated or overlapping approval stages with **one explicit activation decision per environment**. It does not remove deterministic checks, account isolation, risk limits, emergency stop, audit, or revocation.

Selecting the dual-environment architecture is not approval to enable either environment. This document does not change runtime flags, broker connections, credentials, Cloudflare settings, Supabase data, deployments, or MT5 state.

## 2. Authorization model

Do not use a single global set of booleans to control both environments. Resolve permissions server-side from the selected environment, authenticated account identity, policy version, and durable owner authorization.

Illustrative policy shape (contract example only; not a live configuration):

```json
{
  "schemaVersion": 2,
  "defaultEnvironment": "demo",
  "environments": {
    "demo": {
      "activation": "disabled",
      "ordersEnabled": false,
      "executionEnabled": false,
      "liveTradingEnabled": false,
      "requiresOwnerActivation": true
    },
    "real": {
      "activation": "disabled",
      "ordersEnabled": false,
      "executionEnabled": false,
      "liveTradingEnabled": false,
      "requiresSeparateOwnerActivation": true
    }
  }
}
```

The values above are safe defaults. Activating one environment must never activate or alter the other.

## 3. Environment invariants

| Control | Demo | Real |
|---|---|---|
| Credentials and account identity | Dedicated Demo secret reference | Separate Real secret reference |
| Database/session namespace | Environment-bound | Environment-bound |
| Data provenance and freshness | Required | Required |
| Activation | One-time owner activation after checklist | Separate one-time owner activation after Real readiness checklist |
| Routine per-order approval | Not required; Risk Governor decides | Not required; Risk Governor decides |
| Risk breach / uncertain state | Block new entries; follow configured recovery policy | Block new entries; follow configured recovery policy |
| Emergency stop | Always available | Always available |
| Withdrawal, transfer, deposit/funding | Prohibited | Prohibited |
| AI self-escalation | Prohibited | Prohibited |

A Demo authorization is never valid for a Real account. Each activation is bound to the exact account, broker/server, environment, policy version, allowed instruments, risk limits, expiry/renewal policy, and permission scope.

## 4. Operating workflow

### Demo activation — one-time owner action

1. Connect the Demo account and verify login, broker/server, account currency, and environment from the authenticated bridge response.
2. Verify fresh quotes and account snapshots with source timestamps; reject stale or mismatched data.
3. Confirm the canonical risk policy, allowed instruments, order/position limits, and daily-loss calculation are configured.
4. Run the automated contract tests for account isolation, duplicate requests, reconnects, timeouts, partial fills, and broker-state reconciliation.
5. Owner activates Demo once for the selected account and policy version.

After activation, the system may process eligible Demo orders automatically. It must not ask for routine manual approval on every order. A failed pre-trade check blocks that order and records the reason.

### Real activation — one-time, separate owner action

1. Verify the exact Real account, broker/server, account currency, and broker permissions.
2. Complete the same technical and risk checks as Demo, plus independent security review, incident/rollback readiness, monitoring, failure-injection tests, and broker-to-ledger reconciliation.
3. Resolve all critical/high-severity production blockers and approve the exact Real account's capital exposure and risk limits.
4. Owner activates Real separately, bound to the account fingerprint, policy hash, instrument scope, limits, and expiry.

After activation, eligible Real orders may be evaluated automatically. No Demo approval can unlock Real. If readiness evidence is missing, Real activation remains unavailable.

## 5. Deterministic Risk Governor — mandatory on every order

The Risk Governor is an automatic policy check, not a manual approval stage. It must validate at least:

- Authenticated account and environment match.
- Market data is fresh and has trusted provenance.
- Instrument is allowlisted and trading session/market state is valid.
- Maximum open orders, position size, margin, and aggregate exposure.
- Daily loss using a documented broker-day boundary and equity/balance basis.
- Commission, swap, spread, slippage, and currency conversion treatment where applicable.
- Duplicate/idempotency key and immutable order-intent digest.
- Authorization is active, unexpired, and bound to the current account and policy version.
- Kill switch is off and no unresolved broker-state reconciliation is pending.

A failed, unknown, stale, or unavailable check denies the proposed order. The AI cannot override a denial, alter hard limits, or authorize itself.

## 6. Risk policy configuration

Previously discussed target values — daily loss 10%, aggregate open risk 9%, and maximum 5 open orders — are **proposals, not verified active settings**. Before activation, the owner must confirm their calculation basis and values. The implementation must define broker-day boundary, equity/balance denominator, currency conversion, open-risk aggregation, commission/swap treatment, and breach behavior.

A risk breach blocks new entries immediately. Whether to close existing positions or only lock entries must be an explicit policy setting; the system must not infer a forced liquidation instruction from a percentage limit.

## 7. Emergency stop, revocation, and audit

- The owner can revoke an environment authorization or activate the Kill Switch at any time.
- Revocation blocks new orders immediately. It does not silently close existing positions.
- Account change, policy change, expired authorization, stale heartbeat, or uncertain broker state suspends new entries until reconciliation and re-activation.
- No automatic failover between Demo and Real is permitted.
- Every activation and order decision records actor, environment, account fingerprint (never credentials), policy version/hash, action digest, timestamp, expiry, risk result, broker response, and correlation/idempotency key.

## 8. Explicitly removed process overhead

The following are removed from the target workflow:

- Repeated human approval for every routine order after environment activation.
- Multiple approval stages that review the same unchanged account and policy.
- Requiring the owner to approve model-generated signals individually when the signal is within the already approved strategy and risk scope.
- Repeating activation approval when there has been no account, policy, scope, or expiry change.

The following are **not** removed:

- Account/environment identity checks.
- Deterministic pre-trade risk validation.
- Separate Demo and Real activation.
- Real readiness evidence and explicit owner activation.
- Kill Switch, revocation, idempotency, reconciliation, and audit.
- Default-deny behavior on missing, stale, mismatched, or unavailable authorization data.

## 9. Implementation sequence

1. Inventory all current flags, order-capable routes, adapters, Workers, server handlers, UI controls, and database policies.
2. Implement typed environment-bound authorization and one-time activation records; default deny.
3. Implement the deterministic Risk Governor as the per-order decision authority.
4. Add automated tests proving Demo activation cannot unlock Real, expired/revoked activation is denied, and risk failures block orders.
5. Complete authenticated Demo data-path, reconciliation, and operational evidence.
6. Only after a separate owner decision, activate Demo execution in an isolated Demo environment.
7. Complete Real readiness evidence and request a separate owner decision before any Real activation.

## 10. Acceptance criteria

- One owner activation per environment; no routine per-order human approval for actions inside the approved scope.
- No global boolean or Demo authorization can enable Real.
- Missing/unknown environment, account mismatch, expired/revoked authorization, stale data, policy mismatch, risk failure, duplicate intent, or unavailable authorization service denies execution.
- Demo and Real credentials, sessions, state, audit, and permissions are isolated.
- Automated cross-environment, risk, idempotency, revocation, and reconciliation tests pass.
- No AI or client-side path can self-escalate authority.
- No withdrawal, transfer, or funding capability is exposed.
- Existing read-only runtime contracts remain in force until a separately reviewed implementation replaces them.

## 11. Current status

- Architecture target: dual environment with one-time activation and automatic per-order risk decisions.
- Runtime changes: none.
- Demo execution: not authorized by this document.
- Real execution: disabled / not authorized.
- Live Trading: disabled / not authorized.
- Deployment, migration, credential changes, and broker actions: not performed.

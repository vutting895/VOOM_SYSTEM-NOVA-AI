# NOVA + MTRADERS EA — Phase 2 Position-Close Safety Planner

## Scope

This phase adds a pure Python close-request planner for NOVA-owned MT5 positions. It is a validation layer only. It does not connect to MT5, submit a close request, modify an order, or call a broker API.

## Enforced checks

- Exact tenant, account login, and account server binding.
- Unique, non-empty command ID and replay check against the caller-supplied consumed-ID set.
- Timezone-aware issue/expiry timestamps and a maximum 30-second command TTL.
- Explicit, non-empty ticket allowlist; duplicate and invalid tickets are rejected.
- Every requested ticket must still exist in the supplied position snapshot.
- Every selected position must belong to the expected account and NOVA Magic Number range `690711000..690711029`.
- Position symbol and volume must be valid and finite.
- Any failed check rejects the entire close plan; there is no partial close plan.

## Important limitations

- The consumed-command set is supplied by the caller and is not durable. A production adapter must use a transactional persistent idempotency store with unique constraints and atomic claim/complete states.
- The planner does not authenticate a remote sender. It must not be exposed as a network endpoint until a reviewed authentication design, key lifecycle, replay protection, authorization, and audit trail are implemented.
- It does not perform the actual close. The future MQL5 adapter must re-check account identity, ticket existence, symbol, volume, and Magic Number immediately before each broker request and verify the broker's final result.
- This does not implement aggregate-profit close or change PR #296.
- The EA remains in SAFE RESEARCH MODE; `InpTradeEnabled=false`; `OnTick()` remains non-executing.
- Exness Demo lifecycle tests and native MetaEditor compilation of any future MQL5 adapter remain mandatory.

## Next gates

1. Design and review a local authenticated command channel; do not use unsigned shared-folder command files or embed reusable secrets in EA source.
2. Implement durable idempotency and command audit records.
3. Implement a separate MQL5 adapter that consumes only validated commands and re-checks ownership immediately before execution.
4. Test close success, partial fill, requote, market closed, disconnect, restart/replay, stale command, foreign Magic Number, and account mismatch on Exness Demo.
5. Keep all execution disabled until the full Demo lifecycle evidence is reviewed and explicitly approved.

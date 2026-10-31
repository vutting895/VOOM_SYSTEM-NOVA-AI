# NOVA Paper Trading

This package is an isolated, in-memory paper ledger for research and simulation only.

- It does not import, instantiate, or call any broker client.
- It does not call the disabled live execution worker.
- It requires a trusted server-side risk decision with `status=allow_paper`, `passed=true`, and `live_execution_allowed=false`.
- It rejects stale quotes, closed/unknown market state, excessive order notional, insufficient cash, and sells beyond held inventory.
- It uses adverse reference-price slippage and fee assumptions and exposes the assumptions on each simulated fill.
- Idempotency keys prevent duplicate simulated fills and reject conflicting replay payloads.
- It is currently in-memory only; it is not a persistent, multi-tenant production service.

Do not connect this package to broker routes. Persistence, owner-scoped APIs, strategy proposal generation, and production paper-account isolation require separate reviewed milestones.

The package never authorizes or sends live orders. `broker_order_sent=false` and `live_execution_allowed=false` are invariant.

# NOVA Atomic Account Capacity Reservation — Review

## Status

Draft implementation on a branch from the current `main`. No merge, deployment, hosted Supabase migration, secret change, MT5 command, or broker order execution is included.

## Corrected invariants

1. **One broker account, one owner.** The unique identity is `(account_login, account_server)`, independent of tenant. A tenant mismatch is rejected rather than receiving a separate capacity pool.
2. **One account lock for every decision.** Reservation, confirmation, failure release, and reconciliation lock the same account row.
3. **Freshness after lock acquisition.** The five-second broker-snapshot age is checked before work and again after the account lock is obtained. Lock contention cannot silently turn a fresh snapshot into an accepted stale one.
4. **Account-wide capacity.** The decision counts all broker positions, all active pending orders, and every outstanding reservation. Maximum remains five.
5. **No execution authority.** These functions reserve/reconcile capacity only. They do not send, modify, or close MT5 orders.

## PostgreSQL test coverage

The dedicated workflow provisions an ephemeral PostgreSQL 16 service and runs separate database sessions. It checks:

- a second tenant cannot claim the same login/server pair;
- two simultaneous requests at broker exposure four produce exactly one accepted reservation;
- a broker snapshot that ages beyond five seconds while waiting on the account lock is rejected;
- a confirmed broker ticket is released only when supplied in a fresh reconciliation snapshot.

These are database integration checks, not Exness Demo or MT5 runtime proof.

## Known residual risk

The reservation service serializes NOVA reservation requests, but it cannot make sequential MT5 position/order reads atomic with manual or external broker activity. The future trusted execution adapter must reserve first, submit only after separate explicit execution authorization, then confirm/release/reconcile using broker outcomes. Ambiguous broker outcomes must retain the reservation and require reconciliation; they must never be treated as a confirmed failure.

## Release gates

- Dedicated PostgreSQL concurrency workflow passes on the exact PR head.
- Frontend CI and any applicable Worker CI pass; unexplained CI runner failures remain blockers.
- Review account ownership assumptions against actual broker account mapping.
- Apply migration only to a disposable preview database first, with backup and rollback evidence.
- Production Supabase migration and any MT5 integration require separate explicit approval.
- Keep Live Trading OFF and all order execution disabled.

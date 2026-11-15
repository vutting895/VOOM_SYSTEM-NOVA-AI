# NOVA Atomic Account Capacity — Follow-up

## Scope
This branch hardens the reservation ledger without enabling broker execution. It is based on the current `main` SHA `b3ba15c4e8eafc9ee839cb95d42865a0b193e114`.

## Changes
- Enforce one global owner for an MT5 account identity (`account_login + account_server`) using a unique index. The index is explicitly created even if the account ledger table already exists from an earlier migration.
- Resolve the owning tenant after the unique-key claim and reject requests from any other tenant.
- Revalidate broker snapshot freshness after acquiring the account row lock, before counting reservations.
- Apply the same post-lock freshness check during reconciliation.
- Keep the hard account-wide capacity at five: open positions + active pending orders + outstanding reservations.
- Keep RPCs service-role-only; this branch adds no broker order submission, modification, close, or live-trading capability.

## Important migration condition
If the existing ledger contains duplicate account identities assigned to different tenants, creation of the unique index will fail. That is intentional fail-closed behavior. Do not delete, reassign, or merge ownership rows automatically. Inspect and resolve ownership explicitly before retrying.

## Validation status
- Static contract tests are included.
- The prior sequential SQL script is not a concurrency test.
- A true two-session PostgreSQL race test is still required against a disposable database: start two reservations concurrently with broker exposure = 4 and prove exactly one succeeds; also race two first-time tenant claims for the same account and prove only one owner exists.
- Test snapshot age after lock contention, duplicate command IDs, expiry, confirmation, failed-submit release, and ticket reconciliation.
- Do not apply this migration to hosted Supabase until backup, rollback, disposable-DB validation, and explicit approval are complete.

## Safety
MT5 Bridge remains read-only. `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`. This is a reservation primitive only, not permission to trade.

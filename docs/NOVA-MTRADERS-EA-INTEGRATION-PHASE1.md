# NOVA + MTRADERS EA Integration — Phase 1

## Status

This change establishes a fail-closed source baseline and a pure intent-validation contract. It does **not** implement broker order submission and does not certify the 30 strategy modules.

## Repository baseline

- Main was read from `refs/heads/main` immediately before this branch was created.
- Base SHA: `3105ad79990fa6596d1e210e7a645b0b0e12e5fa`.
- Existing read-only MT5 Bridge remains GET-only and is not modified.
- The EA source in the repository previously had trading enabled by default, 5% base risk, 10% single-trade cap, 30% aggregate risk, 30 positions and 35% daily loss. These values conflicted with the current NOVA safety policy and the safe local copy.

## Changes

- Restore safe defaults: trading disabled; 1% per trade; 1% single-trade cap; 9% aggregate open risk; 9 positions; 10% daily loss; bounded minimum lot disabled.
- Make initialization fail closed if the legacy trade-enable input is manually switched on. This is intentional until the command channel, execution adapter and Demo proof are complete.
- Add a pure Python NOVA intent contract enforcing Exness Demo, USD account, exact account and tenant binding, allowlisted symbols, NOVA Magic Number range, short-lived unique command IDs, quote freshness, SL/TP geometry, 1% per-trade risk, 9% aggregate risk, 10% daily loss and 9-position cap.
- Add deterministic unit tests for the contract.

## Non-goals / explicit blockers

- No order-send or position-close API is added.
- No changes to the read-only Bridge or Relay.
- No credentials, account identifiers, or secrets are embedded.
- No Live account support; no production deployment.
- No claim that MQL5 has compiled or that the 30 strategy modules work. Native MetaEditor compilation and Strategy Tester/Exness Demo lifecycle tests are still required.

## Next implementation stage

1. Confirm the actual local `.mq5` and repository source are reconciled; preserve the user's safe local copy.
2. Implement a separate authenticated Demo-only command transport and MQL5 execution adapter.
3. Add broker-side idempotency, ownership-only close, SL/TP validation, and full reconciliation.
4. Compile in MetaEditor on Windows and test on Exness Demo with order execution disabled until all gates pass.

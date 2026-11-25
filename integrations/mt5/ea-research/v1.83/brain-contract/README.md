# NOVA EA v1.83 -> NOVA Brain Event Contract

Status: **contract and dependency-free validator added; EA export wiring and runtime ingestion are NOT IMPLEMENTED**.

## Purpose

Provide a versioned, provenance-bound, read-only event envelope for moving MT5 observations and research signals into NOVA Brain / Datacenter. This is telemetry and research data, not an execution API.

## Files

- `nova-brain-event.schema.json`: JSON Schema Draft 2020-12.
- `validate_event.py`: dependency-free validator for safety-critical invariants.
- `test_validate_event.py`: standard-library unit tests.

## Event types

- `market_snapshot`: closed or observational market state.
- `signal`: strategy output, side and normalized score.
- `decision`: Brain/meta-decision result with model version and reason codes.
- `risk_check`: MT5-side risk gate outcome.
- `execution_audit`: hard read-only audit counters; must show zero broker transport calls.
- `trade_outcome`: sanitized closed-trade outcome for research labels.

## Safety and provenance

- UTC timestamps only; signal/decision events must be based on closed bars.
- Every event pins EA source SHA-256 and repository commit.
- Account scope is pseudonymized with SHA-256; raw account login, account number, server name, credentials and tokens are forbidden.
- `execution_audit` is valid only when mode is `READ_ONLY`, broker request attempted is false, and broker transport calls equal zero.
- BUY/SELL are research signal labels only. This contract does not authorize order placement.
- Never export broker credentials, personal identifiers, account statements, or raw broker-specific account metadata to the public repository.

## Validation

Run from this directory:

```sh
python -m unittest -v
```

The validator deliberately checks safety-critical invariants without third-party dependencies. It is not a replacement for full JSON Schema validation at the Datacenter ingestion boundary.

## Not yet implemented

1. MQL5-side event serialization and local append-only export.
2. A read-only importer in NOVA Datacenter with schema-version pinning and idempotent event IDs.
3. Hash verification, duplicate detection and tenant isolation on ingestion.
4. Exact-head unit/integration tests and a sanitized MT5 runtime export receipt.

Do not claim an end-to-end Brain connection until those steps are implemented and verified.

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
- Account scope must be pseudonymized with HMAC-SHA-256 using a secret held outside Git; a plain hash of a low-entropy account identifier is not sufficient; raw account login, account number, server name, credentials and tokens are forbidden.
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


## Datacenter ingestion adapter (local storage layer)

- `event_inbox.py` provides an append-only SQLite inbox for development and integration tests.
- Tenant identity is a separate argument supplied by authenticated host context. The event payload cannot choose or override its tenant.
- Idempotency key is `(tenant_id, event_id)`. Replaying the same canonical payload returns `duplicate`; reusing the same ID with a different payload is rejected.
- Payload size is capped at 256 KiB. Unknown top-level and nested envelope fields are rejected by the dependency-free validator.
- This adapter is not an HTTP endpoint, production database integration, or authentication system. It must be called only behind the host's authenticated tenant boundary.
- The receiver can validate the HMAC pseudonym's format, but cannot independently verify that it was correctly derived without receiving the raw account identifier (which must not be sent) or using a separate trusted attestation design. The HMAC key must remain outside Git and outside MT5 event payloads.

Run all local contract and inbox tests:

```sh
python -m unittest -v
```

## MT5 exporter status

No MQL5 exporter has been wired into the candidate yet. The next step is a local-only JSONL exporter after confirming the exact EA source hash and implementing a safe, provisioned account-scope pseudonym. Do not add WebRequest, OrderSend, trade mutation, or chart-install behavior as part of telemetry export.

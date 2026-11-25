# NOVA EA v1.83 Exporter and API Integration — Acceptance Plan

Status: IN PROGRESS. Development branch only. No production deployment or Main changes authorized.

## Baseline and scope

- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Main baseline: `56bf51d2e719a4cc79d73421e135099175a1e300`
- Clean integration branch: `feature/nova-v183-export-api-clean-20261126-r2`
- This branch starts directly from Main SHA 56bf51d2e719a4cc79d73421e135099175a1e300. It does not inherit the 73-commit PR #426 stack or the earlier 13-ahead/13-behind experiment.
- Reuse the existing NOVA Remote MCP Gateway and MT5 read-only bridge; do not create a second broker bridge or MCP server.
- `workers/data-ingestion` was a README-only scaffold on Main. This branch adds a separate telemetry ingestion Worker and D1 migration.

## Mandatory invariants

The EA candidate and all related runtime configuration must preserve:
```text
ordersEnabled=false
executionEnabled=false
liveTradingEnabled=false
```

No broker mutation, order submission, trade execution, withdrawal, transfer, or MT5 network request is part of this exporter/API scope. BUY/SELL are observation labels only. The ingestion Worker has no order route and no path to the MT5 bridge.

Do not claim the three flags are implemented in the current EA candidate: the earlier source audit found the exact identifiers absent and found only the compile-time `NOVA_PHASE2_EXECUTION_DISABLED` macro. This must be resolved by source-level controls and tests before release.

## Implemented in this branch (source exists; not yet runtime-proven)

1. `NOVA_BrainEventExporter.mqh`: local-only JSONL market_snapshot writer; no WebRequest or trade APIs.
2. `uploader.py`: host-side HMAC-SHA256 account pseudonymization, full Draft 2020-12 validation via jsonschema, HTTPS POST, and receipt digest verification.
3. `workers/data-ingestion/src/index.js`: Supabase Auth identity validation, tenant-scoped POST/GET event routes, strict safety-critical plus full Draft 2020-12 validation, exact canonical request-byte SHA-256, idempotent insert, conflicting replay rejection, read-back integrity verification.
4. `migrations/0001_create_nova_brain_events.sql`: D1 table keyed by (tenant_id,event_id).
5. Node test suite for authentication, tenant isolation, replay, conflict, forbidden fields, read-only execution audit, and absence of trading routes.
6. Python tests for HMAC scope/key separation and canonical JSON.

## Important known limitations

- MQL5 module currently exports market_snapshot only and has not been wired into the EA v1.83 event loop.
- MQL5 module has not been compiled with MetaEditor. Exact source hash and commit metadata must be supplied by the caller.
- MQL5 event ID generation is for uniqueness, not cryptographic security.
- Host uploader and API Worker have not yet been executed against each other.
- Worker-side validation requires parity tests against the complete JSON Schema. Host-side full Draft 2020-12 validation is mandatory but cannot replace server validation.
- D1 database is not provisioned. wrangler.toml intentionally contains a placeholder database ID. Do not deploy until provisioned and approved.
- No Supabase schema or production project has been mutated.
- No MT5 terminal receipt, ingestion receipt, or read-back receipt exists.
- Existing PR #424 market-data uploader and this Brain event pipeline are separate. Do not mix account/broker SYMBOL_SPEC files or trade history into public Git.

## Required validation gates

### EA / local exporter
- [ ] Add explicit immutable false controls or prove exact one-to-one mapping for all three safety flags.
- [ ] Audit full call graph: all broker mutation adapters blocked; zero broker transport calls.
- [ ] Wire exporter into bounded EA timer/event flow; no per-tick unbounded writes.
- [ ] MetaEditor compile exact candidate and module: zero errors; warnings recorded.
- [ ] Verify JSONL parse, UUID shape, source hash, commit hash, UTC timestamp, append/restart, partial-write handling, and file permissions.
- [ ] Confirm no account login, account number, broker server, balance, equity, credentials, or raw HMAC scope is emitted.

### Host uploader
- [ ] Python syntax and unit tests pass.
- [ ] Full Draft 2020-12 schema validation rejects malformed and unknown fields.
- [ ] Missing HMAC key/scope/token fails closed.
- [ ] Same local account scope yields stable HMAC; different scopes and keys differ.
- [ ] HTTPS-only endpoint and payload/response size caps verified.
- [ ] Receipt SHA-256 exactly matches canonical payload.

### Ingestion API / D1
- [ ] Worker Node tests pass on exact branch head.
- [ ] Server validator parity against full schema demonstrated.
- [ ] Supabase token validation rejects expired/invalid tokens; tenant identity derived only from verified Auth response.
- [ ] Tenant A cannot read Tenant B events.
- [ ] Identical event replay is idempotent; same event ID/different payload returns 409, including concurrent race.
- [ ] Payload limit, forbidden keys, timestamp bounds, invalid schema, D1 outage, and corrupted read-back tested.
- [ ] D1 migration applied only to an explicitly approved non-production database first.
- [ ] Worker deployment uses least-privilege secrets and no service-role key.

### End-to-end
- [ ] Real sanitized event emitted by Demo terminal.
- [ ] Host uploader returns a valid server receipt.
- [ ] Read-back returns byte-equivalent canonical event and verified SHA-256.
- [ ] Tenant isolation proven with two test identities.
- [ ] Runtime evidence shows zero broker transport calls and all three safety controls false.
- [ ] Independent review and exact-head CI pass.

## Release rule

No merge, auto-merge, deployment, EA installation, Main edit, database production migration, or Live Trading activation before all applicable gates pass. Keep the PR Draft until evidence is complete. Report incomplete gates as BLOCKED, not DONE.


## Ownership boundary clarification

The current implementation uses the verified Supabase user UUID as the storage owner namespace. It provides per-user isolation, not shared organization tenant membership. Do not describe this as organization-level multi-tenancy until a trusted tenant-membership model and cross-member authorization tests exist.


## Serialization and digest contract

The host uploader serializes event objects as deterministic sorted-key compact JSON. The Worker hashes and stores the exact received request bytes rather than re-serializing parsed JSON, avoiding Python/JavaScript numeric formatting drift. Identical uploader retries therefore produce the same digest; differently serialized bodies with the same event ID are treated as conflicting payloads.

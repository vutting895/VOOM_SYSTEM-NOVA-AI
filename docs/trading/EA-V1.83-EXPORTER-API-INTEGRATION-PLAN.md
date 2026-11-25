# NOVA EA v1.83 Exporter and API Integration Work Order

Status: IN PROGRESS — integration branch only. This document is a scope and acceptance contract, not evidence that the pipeline is implemented.

## Repository baseline

- Canonical repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Main baseline: `821db357d70d3613b0ca61520eaae5c5307e8fd4`
- Integration branch starts from the reviewed PR #426 head: `193bba1deac334a531f1dc587e1d584a239eb898`
- PR #426 itself is stacked on the EA v1.83 research candidate in PR #417.
- Main must remain unchanged. No merge, deployment, EA installation, chart attachment, broker request, or production database mutation is authorized by this work order.

## Mandatory safety invariants

The candidate and every exporter/API process must preserve:

```text
ordersEnabled=false
executionEnabled=false
liveTradingEnabled=false
```

Additionally:
- No OrderSend, CTrade Buy/Sell, PositionModify, WebRequest, or broker transport call is permitted in the telemetry exporter.
- BUY/SELL values are research signal labels only and must never be interpreted as execution instructions.
- The ingestion API accepts telemetry only. It must not expose an order route or execution capability.
- Fail closed on missing authentication, tenant context, schema mismatch, source provenance mismatch, privacy violation, oversized payload, or storage failure.
- No raw account login, account number, broker server name, credentials, tokens, balances, equity, or personal account metadata may enter public Git data or event payloads.

## Reuse existing work; do not duplicate it

- PR #417: EA v1.83 read-only research candidate and safety audit foundation.
- PR #424: MT5 market-data CSV exporter and Git-backed immutable market-data manifests. Its current exporter emits a broker/account SYMBOL_SPEC file; that file is local-only and must never be published. Its uploader allowlist is the publication boundary.
- PR #426: versioned Brain event schema, dependency-free safety validator, and development SQLite inbox. It explicitly has no MQL5 event serialization or authenticated HTTP ingestion.
- PR #423: Datacenter dataset chunk export through the existing Remote MCP Gateway. This is a dataset retrieval tool, not the EA telemetry ingestion API.

Do not merge these PRs wholesale. Port or reuse only reviewed components with explicit dependency and provenance checks.

## Target architecture

1. **MT5 local exporter** — emit bounded, append-only JSONL telemetry locally. No network calls. Serialize only approved event types from the pinned schema. Use closed-bar timestamps normalized to UTC. Record the exact EA source SHA-256 and repository commit.
2. **Account pseudonymization** — provision the HMAC key outside Git and outside the EA payload. Generate the account-scope HMAC in a trusted local host-side component; do not place a reusable secret in MQ5 inputs, source, logs, or repository files. Reject export if the key is unavailable.
3. **Host-side uploader** — read JSONL, validate each event against the full pinned JSON Schema and the safety validator, enforce payload and batch limits, and submit over HTTPS to an authenticated NOVA host endpoint. Never trust tenant IDs supplied by the event.
4. **Authenticated ingestion API** — derive tenant identity only from verified host authentication context; validate schema version, event size, provenance, privacy, and timestamp; persist with transactional idempotency on (tenant_id, event_id); reject same-ID/different-payload conflicts; return a durable receipt with payload SHA-256 and server timestamp.
5. **Read-back verifier** — retrieve by tenant-scoped event ID, verify canonical payload digest and exact stored content, and produce a machine-readable receipt. No training or model promotion is triggered by ingestion.
6. **Market-data pipeline** — keep PR #424's CSV/manifest pipeline separate from Brain event telemetry. Pin every manifest to an immutable commit and verify all shard hashes on read-back. Never publish SYMBOL_SPEC or broker-account metadata.

## Acceptance gates — all required

- [ ] Exact-head source review confirms all three hard-off flags remain false and no broker mutation/network path was introduced.
- [ ] MetaEditor compile of the exact candidate and exporter: zero errors; warnings triaged and recorded.
- [ ] MQL5 local JSONL exporter tests: valid events, closed-bar enforcement, UTC conversion, bounded output, restart/append behavior, partial-write recovery, and no network calls.
- [ ] HMAC provisioning tests: missing key fails closed; same account scope is stable; distinct account scopes differ; key never appears in output/logs/repository.
- [ ] Full JSON Schema Draft 2020-12 validation at the API boundary, in addition to the dependency-free validator.
- [ ] Authentication tests: unauthenticated requests rejected; tenant identity cannot be overridden by payload; tenant A cannot read tenant B events.
- [ ] Ingestion tests: insert, identical replay, changed-payload conflict, invalid schema, forbidden fields, payload cap, concurrent duplicate race, database failure rollback.
- [ ] Read-back receipt proves exact event ID, tenant scope, payload SHA-256, stored timestamp, and immutable retrieval.
- [ ] Market-data tests: strict headers, rejected SYMBOL_SPEC/account metadata, shard size bounds, deterministic gzip, SHA-256 verification, manifest pinning, path traversal rejection, and exact-commit read-back.
- [ ] Actual sanitized MT5 export receipt and host API ingestion/read-back receipt captured from the connected Demo terminal. No broker request is allowed during the test.
- [ ] Exact branch-head CI passes; failures are investigated from provider logs, not inferred from status labels.
- [ ] Independent review confirms no production secrets, deployment, migration, Main change, or Live Trading activation.

## Current blockers / evidence gaps

- PR #424: source and uploader exist, but actual MT5 export, Python tests, MQL5 compile of the committed copy, Git upload, and exact-commit read-back are pending. Its CircleCI status is ERROR (pipeline 2260); provider logs must be inspected.
- PR #426: schema, validator and SQLite adapter exist, but MQL5 serialization, authenticated host API, production persistence, full JSON Schema validation at ingestion, and runtime receipts are absent. No CI success is recorded on its head.
- PR #423: exposes Datacenter dataset export through MCP; it does not implement EA event ingestion. Its CircleCI status is ERROR (pipeline 2262); provider logs must be inspected.
- Main currently reports CircleCI ERROR (pipeline 2269) and Vercel build-rate-limit failures. These are baseline statuses, not evidence of this integration branch failing. Do not treat Vercel as Netlify production failure.
- No claim of end-to-end integration, runtime safety, dataset completeness, profitability, or production readiness is permitted until the corresponding evidence is attached.

## Release rule

Keep this branch and any resulting PR in Draft until every applicable acceptance gate passes. Main remains the source of truth and must not be changed as part of this work.

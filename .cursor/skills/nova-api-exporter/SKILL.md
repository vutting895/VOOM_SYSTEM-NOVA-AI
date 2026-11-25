---
name: nova-api-exporter
description: Use when working on NOVA data exporters, MT5 historical collection, broker read-only APIs, REST endpoints, ingestion adapters, data manifests, pagination, rate or range bounds, tenant isolation, or source provenance.
---

# NOVA API and Exporter Engineering

## Source and architecture
- Reuse the existing authenticated NOVA Remote MCP Gateway, tenant-bound MT5 proxy/relay, Bridge, and Datacenter ingestion contract.
- Datacenter owns authoritative dataset ingestion, quality receipts, and research lineage.
- Do not create another Gateway, MCP endpoint, browser-direct Datacenter call, or duplicate dataset registry.

## API requirements
- Keep broker history reads GET-only and tenant-isolated.
- Validate identity and authorization server-side; never trust caller-supplied owner/tenant IDs or arbitrary upstream URLs.
- Enforce strict UTC ranges, timeframe-aware bounds, closed-candle handling, maximum bars, response limits, timeouts, and deterministic ordering.
- Validate symbol, timeframe, timestamps, OHLCV, uniqueness, and payload schema. Preserve broker symbol casing where the contract permits it.
- Use stable idempotency/ingestion identities and explicit manifests with source, time range, schema, row count, and checksums.
- Fail closed on missing authentication, missing fixed upstream configuration, invalid tenant context, or malformed data.
- Distinguish source export success from downstream ingestion, quality acceptance, dataset approval, and training eligibility.

## Safety
Exness MT5 remains Demo/read-only. No orders, positions mutation, account changes, transfers, withdrawals, or execution. Preserve ordersEnabled=false, executionEnabled=false, and liveTradingEnabled=false.

## Evidence
Tests must cover authorization, tenant isolation, range limits, current-candle exclusion, malformed data, idempotency, retries, and upstream failures. State whether tests were authored or actually executed. Never claim a successful live export or Datacenter receipt without exact response evidence.

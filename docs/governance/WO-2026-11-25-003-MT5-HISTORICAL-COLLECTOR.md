# WO-2026-11-25-003 — NOVA MT5 Historical Data Collector

Status: APPROVED
Central registry: https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-25-003-nova-mt5-historical-collector.md
Reference PR: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/269 (reference only; do not merge)
Dependent PR: https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/275 (not part of implementation)

## Scope
Implement bounded, UTC, tenant-isolated, GET-only historical OHLCV retrieval for Exness MT5 Demo through the existing NOVA Bridge/relay and existing NOVA Gateway. Deliver through the existing Datacenter ingestion tool/contract, including stable ingestion identity for deterministic retries. Initial acceptance target: XAUUSDm M15. Supported timeframes: M1, M5, M15, M30, H1, H4, D1.

## Exclusions
No duplicate Gateway/MCP/API; no Datacenter repository modifications; no browser-direct Datacenter access; no broker writes/orders/position mutations/transfers/withdrawals; no deployment, secret or permission changes, paid services, VM provisioning, or Live Trading.

## Acceptance
- Demo-only + tenant bearer validation before MT5 access.
- UTC half-open ranges; strict increasing unique timestamps; valid OHLC and nonnegative volume/spread; hard cap 2,000 bars/request.
- Closed bars only; bounded chunking; no silent gap filling.
- Stable deterministic ingestion_id through existing Datacenter dataset_ingest.
- Regression tests and exact-head evidence; real collection remains unproven until live Demo read + Datacenter receipt.

## Phases
0. Audit main, PR #269, callers, contracts and Datacenter ingestion.
1. Implement reviewed Bridge/relay history API on main.
2. Extend existing Gateway collector and Datacenter client with stable ingestion identity.
3. Tests and documentation.
4. Exact-head validation, Issue #36 and operations log.

Stop on missing dependencies, failed checks, auth/permission/security changes, deployment requests, or trading authority changes.

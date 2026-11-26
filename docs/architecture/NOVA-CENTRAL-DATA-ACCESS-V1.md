# NOVA Central Data Access — v1

- Status: first implementation slice on a feature branch; not merged or deployed.
- Canonical control plane: the existing `integrations/system-hub`.
- Scope: NOVA only. VOOM Studio Affiliate is explicitly excluded.
- Baseline: `main@040a3bddd87b99c825d630a52c42ff36bf6fcab8`.

## Decision

Extend the existing System Integration Hub. Do not create a second gateway, second broker proxy, parallel database, or competing integration registry. The Hub remains the authenticated entry point for NOVA data access. Existing provider-specific adapters remain behind it.

## First slice

Add a versioned, authenticated read-only data-source catalog at `GET /v1/data/sources`. The catalog documents only source paths that the current Hub code actually consumes:

| Source | Resource | Tenant boundary | Verification |
|---|---|---|---|
| Supabase Auth | authenticated user identity | current authenticated user | each request |
| Supabase PostgREST | caller's own broker connection metadata | forwarded user JWT + RLS + user filter | each request |
| Exness MT5 Demo Proxy | account snapshot, quotes, candles | owned connection + allocated bridge route | each connection request |

The catalog is capability metadata, not a health check. It must never report a source as connected or data-verified merely because it is listed.

## Data access contract

- Browser/client authenticates with the existing Supabase session and calls the System Hub.
- Hub validates the user session before reading protected data.
- Supabase requests retain the caller's JWT so RLS remains effective.
- MT5 reads use the fixed read-only proxy origin and owner-scoped connection ID.
- Provider URLs and tenant identity are server-derived; caller/model input cannot select arbitrary hosts, users, tenants, or routes.
- Responses are no-store and must omit credentials, access tokens, bridge secrets, and unnecessary account identifiers.
- Existing account/quotes endpoints remain authoritative for actual data. The catalog does not copy, persist, or fabricate provider payloads.

## Not included in this slice

- No new ingestion database, data lake, event queue, scheduled sync, webhook consumer, or historical MT5 exporter.
- No claim that every NOVA subsystem is already connected to the Hub.
- No production Supabase schema change, Cloudflare binding/secret/route change, deployment, merge, or GitHub Actions policy change.
- No Affiliate repository or data.
- No broker writes, orders, withdrawals, transfers, or Live Trading.

## Next acceptance gates

1. Review the complete diff and run the Hub unit/contract tests plus relevant worker tests on the exact PR head.
2. Verify unauthenticated requests fail, owner reads succeed, and foreign-tenant reads are denied.
3. Verify catalog metadata matches actual registered code paths and never claims runtime reachability.
4. Only after inventorying each NOVA subsystem, add source-specific adapters through this Hub with bounded schemas, provenance timestamps, idempotency, redaction, and tenant isolation.
5. Any persistent ingestion/scheduled sync requires a separate schema, retention, cost, replay, and rollback review before implementation.

## Safety invariants

`ordersEnabled=false`, `executionEnabled=false`, `order_submission_enabled=false`, and `liveTradingEnabled=false`. Read-only + AI Analysis only.

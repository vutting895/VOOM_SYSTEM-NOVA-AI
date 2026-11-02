# NOVA Compact Dataset QR

Status: implementation contract. PR adds the owner-scoped registry migration, authenticated create/resolve/revoke APIs, resolver page, and market-data decimal-string transport. Hosted migration, Preview verification and hosted migration application remain pending.

## Goal

A QR code is a portable reference to an immutable, owner-scoped dataset snapshot. It does not contain the full OHLCV dataset. Scanning it opens the NOVA dataset resolver, which authenticates the viewer, checks ownership/authorization, resolves the manifest, verifies the content hash, and then loads the compressed object.

## QR payload contract

Use a versioned HTTPS URL, not credentials or raw market data:

```
https://voomsystem.netlify.app/datasets/<opaque-dataset-id>
```

The identifier must be random/opaque and non-sequential. Do not put owner IDs, account IDs, connection IDs, broker credentials, access tokens, signed storage URLs, or private market payloads in the QR.

## Dataset manifest

The registry stores a small manifest; the data object is stored separately in object storage.

```json
{
  "schema": "nova.dataset.v1",
  "dataset_id": "opaque-random-id",
  "owner_scope": "server-derived",
  "symbol": "XAUUSDm",
  "timeframe": "M5",
  "provider": "exness_mt5_demo",
  "range": {
    "from": "2026-11-01T00:00:00.000Z",
    "to": "2026-11-02T00:00:00.000Z"
  },
  "rows": 120,
  "numeric_encoding": "decimal-string",
  "compression": "gzip",
  "object_key": "datasets/<opaque-random-id>/bars.jsonl.zst",
  "sha256": "<sha256-of-exact-compressed-bytes>",
  "created_at": "2026-11-02T00:00:00.000Z",
  "schema_version": 1
}
```

The example values are illustrative only. The server must generate the real ID, timestamps, object key, and digest.

## Decimal precision is invariant

- Preserve source price lexemes as decimal strings (for example, `"3987.12500"`) from ingestion through serialization and storage.
- Do not parse source prices through JavaScript `Number`, binary float, Float32, or JSON numeric literals before persistence.
- Do not round, normalize trailing zeros, or infer precision from display formatting.
- If the upstream MT5 bridge provides JSON numbers rather than strings, preserve the raw numeric token at the adapter boundary or change the bridge contract to emit decimal strings. Converting an already-parsed JavaScript number back to a string cannot restore lost precision.
- For calculations, use a decimal arithmetic implementation and explicit precision/rounding policy; preserve original input strings in the immutable dataset.
- Store volume using its source precision and type separately from prices.

## Compact storage

- Serialize one row per candle in a deterministic, versioned format (JSONL with decimal strings initially; a typed columnar format may be added only if it preserves decimal scale exactly).
- Compress the deterministic byte stream with gzip in the initial implementation. Zstandard remains a future codec option after a compatible dependency and deployment runtime are validated.
- Hash the exact compressed bytes with SHA-256.
- Deduplicate only within the same authorized owner scope; never let a hash lookup reveal another tenant's dataset existence.
- Store indicators and model outputs as derived artifacts with their own version and hash; do not rewrite the raw dataset.

## Resolver security and lifecycle

1. `GET /datasets/:id` returns a minimal metadata/QR landing page, never raw data by default.
2. Require an authenticated NOVA session to view private datasets.
3. Derive owner scope from the verified session on the server; never accept owner/tenant IDs from the browser.
4. Check authorization before revealing whether a dataset ID exists.
5. Verify manifest schema, object size limits, compression, and SHA-256 before parsing.
6. Use short-lived, scoped download authorization only after access checks; never encode signed URLs in QR.
7. Support revocation and deletion by dataset owner; QR becomes unavailable after revocation.
8. Record audit events without logging credentials or full market payloads.

## Backtest provenance

A Backtest result QR should reference an immutable experiment manifest that points to:
- dataset ID and dataset SHA-256;
- strategy/config hash and strategy version;
- model/artifact hash and feature-manifest version;
- source code commit;
- execution assumptions, costs, timezone and finalized-candle policy;
- metrics, trade-ledger object hash, and evaluation window.

The QR must never imply that a strategy is profitable or production-approved.

## Acceptance tests

- Exact decimal strings, including trailing zeros and high precision, survive encode -> compress -> decompress -> decode unchanged.
- A one-character payload mutation fails SHA-256 verification.
- A user from tenant B cannot enumerate, resolve, or download tenant A's dataset.
- Revoked datasets cannot be resolved or downloaded.
- QR contains only the HTTPS resolver URL and opaque dataset ID.
- Oversized, malformed, unsupported-schema, or hash-mismatched objects fail closed.
- Read-only invariants remain `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.

## Implementation order

1. Fix market-data ingestion so decimal source tokens are not coerced through JavaScript Number.
2. Add owner-scoped dataset manifest registry and immutable compressed-object storage.
3. Add authenticated resolver and revocation checks.
4. Add QR generation UI only after a real dataset ID and resolver exist.
5. Add scan/authorization/precision/hash/tenant-isolation tests.
6. Deploy Preview and verify exact PR head before any production promotion.


## Implemented in PR #192 (not yet deployed)
- `POST /api/datasets` accepts 3–10,000 candles only when OHLC and volume values are exact decimal strings; numeric JSON prices are rejected.
- Data is serialized deterministically as JSONL, gzip-compressed, and SHA-256 hashed over the exact compressed bytes.
- Private Supabase Storage bucket `nova-datasets` and `nova_market_datasets` registry are defined in migration `202611020001_nova_market_dataset_registry.sql`. The migration has not been applied to hosted Supabase.
- `GET /api/datasets/:id` uses user-session RLS, returns the same not-found response for unknown and foreign-owner IDs, verifies SHA-256 before decompression, and preserves decimal strings.
- `DELETE /api/datasets/:id` revokes via owner-checked RPC and removes the private object when possible.
- `/datasets/:id` is the authenticated resolver page.
- System Hub now emits MT5 prices as decimal strings at the broker's declared `digits` scale; the market-data API rejects non-string price values rather than silently converting through JavaScript Number.
- The Backtest Lab includes a Save Dataset action and renders a scannable SVG QR with `qrcode.react`; the QR contains only the owner-scoped resolver URL.
- Compression currently uses gzip, not Zstandard. This is an explicit first implementation choice because Node's built-in gzip path avoids introducing an unverified native dependency; the manifest records the codec.
- The QR UI and APIs are code-complete on the PR branch, but cannot save/resolve data until the migration is applied to an approved environment. No production data is written and no hosted migration is applied by this PR.

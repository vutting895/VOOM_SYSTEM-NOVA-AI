# Data Ingestion Worker

Scope: accept allow-listed market/telemetry inputs, validate schemas, normalize timestamps and symbols, deduplicate events, and retain source provenance. Reject malformed or stale payloads. No order execution.
Status: scaffold; source adapters and contract tests pending.

## Phase B — R2 adapter
- `r2_storage.mjs` implements private R2 object operations, key-prefix allow-listing, create-only writes, and SHA-256 verification.
- `r2_storage.test.mjs` contains Node built-in unit tests: `npm run test:storage`.
- `R2_SETUP.md` documents one-time R2 activation and private bucket binding.
- R2 is not enabled on the connected Cloudflare account yet; no bucket or object has been created.

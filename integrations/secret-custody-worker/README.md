# NOVA Secret Custody Worker — P0 synthetic scaffold

**Status:** Code-only prototype; not deployed; customer credential intake and provider operations are disabled.

## Scope

This Worker is a deliberately isolated proof harness for the free-first P0 workstream. It is separate from `integrations/system-hub` and has no production route or Wrangler deployment configuration.

- `GET /health` reports that customer intake and provider operations are disabled.
- Every `/v1/*` customer custody route returns `503 CUSTOMER_CUSTODY_DISABLED`.
- The only write route is `POST /_test/synthetic/seed`. It requires both `CUSTODY_MODE=synthetic`, `ALLOW_SYNTHETIC_TEST_ROUTES=true`, and a dedicated test token.
- The seed route accepts only the fixed fixture identifier `fixture-001`; it does not accept caller-supplied credential values or arbitrary provider details.
- The Worker creates the synthetic fixture internally, encrypts it with AES-256-GCM using a fresh per-record DEK, wraps the DEK with a separate AES-256-GCM key, and writes ciphertext/nonce/wrapped-DEK metadata only.
- All responses use no-store/no-cache headers. The code does not log request bodies, tokens, plaintext, ciphertext, or key material.

## Local tests

Run with Node.js 22 or later:

```sh
node --test integrations/secret-custody-worker/*.test.mjs
```

The tests use an in-memory D1-compatible stub and a fixed synthetic fixture. They verify disabled production routes, both synthetic gates, test-token enforcement, fixed-fixture-only input, AES-GCM encryption/decryption and AAD binding, ciphertext-only persistence, bounded requests, and fail-closed behavior.

## Deliberate limitations

This is **not a production custodian** and must not receive real customer credentials.

- The wrapping key in this prototype is a Worker Secret candidate, not an independent KMS/HSM boundary. It is not equivalent to the selected Option C production trust objective.
- No real Supabase JWT verification, RLS connection lookup, custodian registry, workload identity/mTLS, distributed operation ledger, provider adapter, lease/fencing, rotation/revocation, or independent security review is implemented here.
- The SQL file is a synthetic-only schema proposal. It has not been executed against Cloudflare D1.
- There is intentionally no `wrangler.toml/jsonc`, D1 binding, secret value, route, or deployment workflow in this directory.
- Do not deploy this Worker or create Cloudflare resources until the actual account plan/quota is independently confirmed and a separate owner approval is recorded.
- Do not connect it to the System Hub or Supabase production project. Exness MT5 Bridge credentials remain in the existing tenant-specific Bridge boundary.

## Safety invariants

Real customer credential intake remains disabled. Provider operations remain disabled. Exness remains read-only. Order Submission and Live Trading remain OFF.

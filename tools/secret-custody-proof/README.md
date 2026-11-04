# Local Secret Custody Runtime Proof (synthetic only)

Run:

```sh
node --test tools/secret-custody-proof/*.test.mjs
```

`runtime.mjs` is a deliberately small, dependency-injected local proof harness. It exercises the request path in this order:

1. Verify a bearer session through an injected verifier.
2. Resolve the requested connection using the verified subject (never caller-supplied owner/tenant IDs). The current canonical migration uses `broker_connections.user_id` referencing `auth.users.id`; it does not define `tenant_id`. The production adapter must map that owner field and use a separate trusted custodian binding registry rather than inventing a tenant column.
3. Resolve and match a custodian-owned binding, provider, environment, active state, and read-only capability.
4. Atomically publish a file-backed operation claim (write a complete temporary record, then hard-link it into place) using a stable principal/binding/capability/idempotency key and a canonical request fingerprint.
5. Invoke only an injected read-only provider adapter, passing trusted binding metadata and bounded intent—not credential bytes.
6. Persist a sanitized result for replay; mark ambiguous provider outcomes `OUTCOME_UNKNOWN` and prohibit blind redispatch.
7. Return `Cache-Control: no-store` and `Pragma: no-cache`.

The tests use synthetic identities, connection metadata, provider responses, ephemeral synthetic KEKs, and temporary local files. They include restart/replay, cross-owner denial, forbidden-field rejection, fingerprint conflict, concurrent duplicate claims, ambiguous outcome, response redaction, and a schema contract against the existing `broker_connections.user_id` + RLS migration.

`envelope-crypto.mjs` is a runtime-neutral WebCrypto abstraction. It delegates DEK generation, unwrap, and rewrap to an injected key-provider interface; tests use ephemeral synthetic KEKs only. This is not a production KMS/HSM adapter and does not provision or retain key material.

## Rotation and revocation lifecycle proof

`rotation-lifecycle.mjs` is a second local orchestration proof. It models the required `ROTATE_ON_NEXT_USE` rule: a successful use moves a binding to `ROTATION_REQUIRED`, and the next use is blocked until a provider-specific successor is rotated, validated, and atomically made active. The registry distinguishes API-key rotation from OAuth refresh; it has no default capability for real providers.

The synthetic tests cover unsupported providers, successor validation failure, no fallback to the prior version, ambiguous provider outcomes and explicit reconciliation, idempotency replay/conflict, lease contention, fencing-token rejection, and revoke outcomes. Provider adapters return opaque version IDs in this harness; no credential values are returned.

The lifecycle coordinator requires a store interface for durable operation claims, leases, fencing, and compare-and-set. The current tests use an in-memory store only. They do not prove a distributed database, crash-safe lease expiry, production provider behavior, or any provider-specific rotation/revocation support. No Exness capability is assumed or enabled.

## Proof limitations

This is **not a production custodian**. The injected session verifier is a test double, not Supabase JWT verification. The connection and binding resolvers are in-memory test doubles, not a real RLS-scoped Supabase lookup or separate custodian registry. The provider adapter is synthetic and does not connect to Exness/MT5 or any provider. The file-backed ledger is a local single-process proof, not a distributed transactional database with leases/fencing or multi-worker concurrency guarantees. The rotation lifecycle tests use an in-memory store and synthetic provider adapters. No real customer credentials are stored, encrypted, decrypted, or migrated; only fixed synthetic strings are exercised by local tests. Prefer `withPlaintext()` so a decrypted buffer is cleared in a `finally` block after its consumer completes; JavaScript zeroization is best effort, not a hardware memory guarantee. No KMS/HSM, mTLS/workload identity, production key custody, network isolation, deployment, staging, or independent security review is proven.

Do not treat a passing local proof as authorization to enable customer secret routes. Customer custody remains disabled; broker access remains read-only; order submission, execution, and live trading remain OFF.

## Supabase Auth and owner-resolution adapter proof

`supabase-adapters.mjs` adds a concrete, synthetic-fetch-tested adapter for two boundaries:

- Supabase Auth `/auth/v1/user` independently validates the bearer session and derives the subject.
- PostgREST reads `broker_connections` using the same verified user's JWT, filtering by both connection ID and canonical `user_id`. This preserves the existing RLS policy; it does not use a service-role key or invent `tenant_id`.

The runtime now passes the verified principal to the connection resolver so the adapter can perform the RLS-scoped request. The access token is not written to the operation ledger or passed to the binding/provider adapter.

These are adapter contract tests with mocked HTTP responses, not a live Supabase Auth/PostgREST integration. The separate custodian binding registry, distributed operation ledger, asymmetric signer/KMS, and provider execution remain unimplemented and blocked.

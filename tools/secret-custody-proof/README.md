# Local Secret Custody Runtime Proof (synthetic only)

Run:

```sh
node --test tools/secret-custody-proof/*.test.mjs
```

`runtime.mjs` is a deliberately small, dependency-injected local proof harness. It exercises the request path in this order:

1. Verify a bearer session through an injected verifier.
2. Resolve the requested connection using the verified subject (never caller-supplied owner/tenant IDs).
3. Resolve and match a custodian-owned binding, provider, environment, active state, and read-only capability.
4. Atomically claim a file-backed operation record using a stable principal/binding/capability/idempotency key and a canonical request fingerprint.
5. Invoke only an injected read-only provider adapter, passing trusted binding metadata and bounded intent—not credential bytes.
6. Persist a sanitized result for replay; mark ambiguous provider outcomes `OUTCOME_UNKNOWN` and prohibit blind redispatch.
7. Return `Cache-Control: no-store` and `Pragma: no-cache`.

The tests use synthetic identities, connection metadata, provider responses, and temporary local files. They include restart/replay, cross-owner denial, forbidden-field rejection, fingerprint conflict, ambiguous outcome, and response redaction checks.

## Proof limitations

This is **not a production custodian**. The injected session verifier is a test double, not Supabase JWT verification. The connection and binding resolvers are in-memory test doubles, not a real RLS-scoped Supabase lookup or separate custodian registry. The provider adapter is synthetic and does not connect to Exness/MT5 or any provider. The file-backed ledger is a local single-process proof, not a distributed transactional database with leases/fencing or multi-worker concurrency guarantees. No credentials are stored, encrypted, decrypted, or migrated. No KMS/HSM, mTLS/workload identity, production key custody, network isolation, deployment, staging, or independent security review is proven.

Do not treat a passing local proof as authorization to enable customer secret routes. Customer custody remains disabled; broker access remains read-only; order submission, execution, and live trading remain OFF.

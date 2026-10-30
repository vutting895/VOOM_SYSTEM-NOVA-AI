# Secret Custody Contract Proof

This is a synthetic-only contract harness for the owner-selected separate Secret Custody Plane (Option C). It is not a running service and does not connect to a cloud provider, Supabase project, KMS/HSM, provider API, or customer account.

Run locally:

```sh
node --test tools/secret-custody-proof/contract.test.mjs
```

The request/response JSON Schemas and Node tests verify:
- request fields cannot assert owner, tenant, secret reference/value, provider URL, access token, DB URL, or role;
- response objects allow only bounded sanitized business result shapes and reject nested credential material;
- operation identity is tenant + stable operation ID and is independent of signing key ID/nonce;
- a changed request fingerprint is a hard conflict;
- an ambiguous provider outcome remains reconciliation-required and cannot authorize automatic redispatch.

The tests do not prove cryptographic implementation, actual Supabase JWT verification, mTLS, KMS/HSM policy, envelope encryption, tenant isolation in a deployed service, provider reconciliation, or availability/latency. Those require an implementation and independent review.

Do not put real secrets, access tokens, key material, connection strings, or customer data in fixtures. No secret values are required.


The `crypto-proof.test.mjs` suite uses Node's built-in crypto module with ephemeral synthetic keys to exercise AES-256-GCM envelope-encryption mechanics, immutable associated-data binding, ciphertext/tag tamper rejection, DEK rewrap under a rotated KEK, and Ed25519 signature verification using only the public key at the verifier. The test does not persist key material or use a real KMS/HSM.

**Proof boundary:** passing these tests proves only the selected library primitives and the local contract model. It does not prove KMS/HSM policy, non-exportable key custody, mTLS/workload identity, actual Supabase JWT verification, production key rotation/revocation, custodian runtime isolation, or independent security review.

# NOVA Secret Rotation Policy — Rotate on Next Use

**Policy key:** `ROTATE_ON_NEXT_USE`  
**Scope:** Customer-owned API credentials handled by the existing Cloudflare System Integration Hub  
**Status:** Policy specification only; runtime credential operations remain disabled  
**Safety:** Read-only provider scopes only. No order submission, trading, withdrawals, transfers, or Live Trading.

## 1. Decision

For a provider credential that explicitly supports safe rotation, every successful, authorized logical use makes that credential version eligible for rotation before the next distinct use.

This is a **before-next-use** policy, not an instruction to rotate immediately after the current request:

1. The first authorized use may use the currently active version.
2. After that provider operation succeeds, persist `ROTATION_REQUIRED`.
3. Before the next distinct use, rotate/refresh the credential, validate the successor, switch the active version, retire the previous version, and only then execute the requested provider operation.
4. After that operation succeeds, persist `ROTATION_REQUIRED` again.

Thus, sequential successful uses use successive credential versions: V1 for use 1, V2 for use 2, V3 for use 3, and so on.

The policy applies to logical provider operations that actually authenticate with the customer credential. It does not mean rotating for every internal HTTP hop, retry, health probe, or request rejected before provider authentication.

## 2. Definition of a use

A use counts only when all of these conditions hold:

- The request is authenticated and authorized for the exact tenant, owner, connection, provider, environment, and read-only capability.
- The System Hub selects the active secret version server-side; the caller cannot select a version or pass an arbitrary secret reference as proof of authority.
- The intended provider operation completes successfully with a confirmed success response.
- The completion is recorded once against a stable operation/idempotency identifier and the credential version used.

The following do not count as successful uses: authentication or authorization denial, invalid request validation, provider rejection, failed connection, and a rotation-validation probe. A provider timeout or ambiguous outcome is not treated as a failure or success; set `USE_OUTCOME_UNKNOWN` and reconcile before another use. Do not blindly replay an operation with an unknown outcome.

A retry carrying the same idempotency key is the same logical operation. Return the stored sanitized result where permitted; do not execute it again or rotate a second time.

## 3. Required next-use sequence

When the state is `ROTATION_REQUIRED`, the Hub must:

1. Acquire a per-connection rotation lock/lease with a fencing token. Serialize all use and rotation operations for that connection.
2. Re-check the caller's authenticated identity, tenant ownership, exact connection, provider/environment allowlist, read-only scope, current version, policy version, and connection status while holding the lease.
3. Ask the provider adapter to create a successor credential or perform the provider's documented token/key rotation. Do not generate a random local string and pretend that the provider accepted it.
4. Validate the successor with a provider-supported, harmless read-only authentication probe. Record this as a control-plane validation, not a customer use.
5. Atomically compare-and-set the active version from the expected old generation to the validated successor. Persist the transition and audit correlation without storing credential material in application metadata.
6. Revoke the previous credential version where the provider supports separate-version overlap. Keep the previous encrypted version only as long as needed for the provider's documented recovery window; never expose it to callers.
7. Confirm retirement/revocation before performing the requested customer operation when the provider supports overlapping keys. If retirement cannot be confirmed, set `REVOCATION_PENDING` and fail closed.
8. Execute the requested operation with the new active version. On confirmed success, persist `ROTATION_REQUIRED` for the next distinct use.

Provider-specific in-place rotation that invalidates the old key immediately is allowed only when the adapter documents and tests the provider's atomic recovery semantics. If successor validation or recovery cannot be guaranteed, mark the connection `REAUTH_REQUIRED` and do not run the requested operation.

## 4. State model

The implementation must model lifecycle states explicitly:

| State | Meaning | May execute a customer use? |
|---|---|---|
| `READY` | An active version is ready for its first use after enrollment or successful rotation | Yes |
| `ROTATION_REQUIRED` | A previous distinct use succeeded; rotate before the next use | No, not until rotation finishes |
| `ROTATING` | A provider rotation operation is in progress under a valid lease | No |
| `SUCCESSOR_VALIDATING` | A new version exists but is not active | No |
| `REVOCATION_PENDING` | The successor is active but the old credential is not confirmed retired | No |
| `ROTATION_FAILED` | Rotation or validation failed and needs controlled recovery | No |
| `ROTATION_UNSUPPORTED` | Provider cannot implement the required safe rotation contract | No under strict policy |
| `USE_OUTCOME_UNKNOWN` | Provider outcome is ambiguous; reconcile before another use | No |
| `REAUTH_REQUIRED` | Provider requires customer re-authentication or recovery | No |
| `REVOKED` | Connection credential is revoked | No |

Only a successful state transition may set an active version. Stale generations, expired leases, and fencing-token mismatches must be rejected.

## 5. Provider adapter capability contract

A provider must be explicitly registered as rotation-capable before this policy is enabled. The adapter must declare and test:

- Credential type: API key rotation, OAuth access-token refresh, rotating refresh-token exchange, or provider-specific re-authentication. These are not interchangeable.
- Rotation method and whether old/new credentials can overlap.
- A harmless read-only successor-validation operation.
- Revocation/retirement method and confirmation semantics.
- Idempotency or reconciliation behavior for timeouts and partial failures.
- Recovery behavior if rotation succeeds remotely but persistence or validation fails.
- Whether rotation consumes a separate management credential and how that credential is protected.

An OAuth access-token refresh is not proof that the API client secret or source API key was rotated. The audit record must name the actual operation type without recording credential values.

If the provider cannot meet the contract, report `ROTATION_UNSUPPORTED`. Do not silently fall back to indefinite reuse of the old credential. Under strict `ROTATE_ON_NEXT_USE`, block the next use until the customer re-authenticates or selects an explicitly approved alternative policy.

## 6. Failure, concurrency, and audit invariants

- Fail closed: if the required rotation, validation, switch, or old-version retirement fails, do not execute the requested customer operation using the stale version.
- Use a durable per-connection lease, fencing token, compare-and-set generation, and idempotency key to prevent concurrent or duplicate rotation.
- Never hold a database transaction open while waiting for a remote provider API. Use a recoverable state machine/saga and reconcile remote outcomes.
- If the remote provider rotated successfully but local persistence failed, mark the connection blocked and reconcile by provider operation ID; never assume either version is safe.
- Audit only tenant/owner/connection identifiers needed for authorization, provider, environment, operation type, version/generation IDs, policy version, timestamps, outcome, and correlation IDs. Do not log raw credentials, encrypted payloads, decrypted values, authorization headers, refresh tokens, or provider response bodies containing secrets.
- Secret material remains inside the trusted server-side secret boundary. It must never reach browser code, generated UI, the AI model, MCP payloads, logs, traces, analytics, or customer-facing API responses.
- Keep provider capabilities read-only. Rotation must not enable trading, order submission, transfer, withdrawal, deposit, or any other mutation capability.

## 7. Required acceptance tests before runtime activation

1. First successful use with V1 transitions to `ROTATION_REQUIRED`; it does not rotate immediately after that use.
2. The next distinct use rotates and validates V2 before the requested operation; successful use of V2 transitions back to `ROTATION_REQUIRED`.
3. Three sequential successful uses use three successive active generations.
4. Failed, denied, and invalid operations do not falsely count as successful customer uses.
5. A duplicate idempotency key does not repeat the operation or rotate again.
6. Concurrent requests for one connection are serialized; no two successors become active.
7. Expired/stale leases, stale generations, owner mismatch, tenant mismatch, wrong provider/environment, and unsupported capability all fail closed.
8. Successor validation failure, revocation failure, provider timeout, and persistence failure leave the connection blocked and recoverable without exposing the old or new secret.
9. Customer A cannot read, rotate, use, or revoke Customer B's credential or connection.
10. Secret-leak tests cover API responses, SQL/application errors, logs, traces, chat, MCP, and audit output.
11. CI and security review pass on the exact PR head; provider-specific staging tests pass before enabling any runtime route.

## 8. Activation boundary

This document does **not** enable the Vault, create customer credentials, grant database privileges, add Worker routes, deploy Workers, or change provider settings. The previously recorded Vault privilege blocker remains in force: customer credential reads and writes are disabled until a dedicated narrowly scoped server-side role/path and two-customer isolation are independently verified.

Implement this policy only after the dedicated Vault access design is reviewed, tested in an isolated database, approved for staging, and integrated into the existing System Integration Hub. Production activation remains a separate approval gate.

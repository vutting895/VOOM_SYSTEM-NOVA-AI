# NOVA Secure QR Gateway — Phase 1

## Scope

Phase 1 implements short-lived, owner-bound QR pairing and explicit approval metadata inside the existing Cloudflare System Hub. It does **not** accept, store, retrieve, decrypt, rotate, or revoke provider credentials. It does not enable broker execution.

The QR is a pairing bootstrap only. It is not a credential container and is not sufficient authorization by itself.

## Flow

1. An authenticated user requests `POST /v1/secrets/pairings`.
2. System Hub generates a cryptographically random 256-bit token and stores only its SHA-256 hash.
3. The API returns the raw token once with a URL that places it in the URL fragment (`#pair=`), which browsers do not send in HTTP requests.
4. The receiving device must already have a valid NOVA/Supabase session for the same owner.
5. The receiving device posts the token to `POST /v1/secrets/pairings/claim`; the server atomically changes `pending` to `scanned`.
6. The user explicitly approves with `POST /v1/secrets/pairings/{id}`; the server changes `scanned` to `approved` and clears the token hash.
7. The approved state grants no access to credentials. A later provider-credential flow must independently enforce provider-specific consent, scope, encryption and audit requirements.

## API

- `POST /v1/secrets/pairings`: create a two-minute pairing; returns one-time token and fragment URL.
- `POST /v1/secrets/pairings/claim`: body `{"token":"..."}`; requires the same authenticated owner.
- `POST /v1/secrets/pairings/{uuid}`: body `{"token":"..."}`; explicit approval.
- `GET /v1/secrets/pairings/{uuid}`: owner-only status lookup.

All routes require a valid Supabase access token. Responses are no-store and omit the token hash. Foreign-owner requests receive the same not-found/conflict behavior as invalid tokens.

## Security properties

- 32 bytes from Web Crypto CSPRNG; SHA-256 hash persisted.
- Two-minute expiry enforced by API filters and database constraints.
- Single-use claim and approval via conditional PostgREST PATCH; only one request can win each state transition.
- Owner binding via authenticated Supabase user ID and RLS.
- Database trigger blocks owner, purpose, expiry, creation-time and token-hash replacement, and invalid status transitions.
- Token is placed in a URL fragment, not a query parameter or path.
- No provider secret or credential value is accepted by these endpoints.
- No order, transfer, withdrawal or broker-write capability is added.

## State machine

`pending → scanned → approved`

Terminal alternatives: `rejected`, `cancelled`, `expired`. Terminal transitions clear the token hash. Database cleanup of expired rows is an operational follow-up; API lookup reports expired state based on timestamp.

## Deployment gates

1. Run System Hub unit tests and SQL migration CI.
2. Verify same-owner create/claim/approve.
3. Verify foreign-owner denial, token replay denial, expired token denial and concurrent claim behavior.
4. Verify browser UI extracts the fragment locally and never sends it to analytics or server logs.
5. Apply the migration to an isolated Supabase environment and verify RLS.
6. Do not deploy credential intake until the Secret Custody dependency chain and key-management design are independently reviewed and proven.

## Explicit non-goals

No KMS/HSM, no production Secret Vault, no credential intake, no OAuth provider callback, no QR image frontend, no real Exness credentials, and no live trading are included in Phase 1.

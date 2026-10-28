# Authentication Event Integration Contract
Status: specification only; no customer account source is connected yet.

## Ingestion design
The identity provider, API gateway, or authentication backend should emit a minimized security event after it has applied its own authentication logic. Do not send raw request bodies or credentials to this dashboard.

Suggested fields:
- event_id: unique event identifier
- occurred_at: UTC ISO-8601 timestamp
- event_type: login_success, login_failure, mfa_failure, password_reset, recovery_change, new_device, session_revoked, refresh_token_reuse, rate_limit, privilege_change
- account_ref: pseudonymous stable ID (never email/phone unless masked and justified)
- request_id: correlation ID
- source_ip_hash or coarse source network: only if justified by privacy policy
- device_ref: pseudonymous device identifier
- risk_score: integer 0-100
- severity: informational, low, medium, high, critical
- outcome: allowed, challenged, denied, revoked, queued_for_review
- signals: allowlisted short strings; no free-form headers or secrets
- source_system: identity provider / gateway name and version

## Response ownership
The identity provider or gateway remains the enforcement point. This dashboard is the back-office view and policy-review surface. For critical signals, the source provider must enforce session revocation or step-up authentication and send the outcome back for audit. A dashboard event alone is not proof of enforcement.

## Integration gates
1. Choose the actual identity provider and event source.
2. Define event authentication using a rotated secret or signed requests; store credentials in a secret manager/environment, never source code.
3. Require timestamp and replay protection, schema validation, size limits, per-source rate limits, and audit IDs.
4. Test duplicate events, delayed/out-of-order events, provider outage, false positives, and safe rollback.
5. Complete privacy/legal review, access control and retention settings.
6. Do not bind ingestion to 0.0.0.0 or expose the current local development server. Use a separately hardened HTTPS gateway for remote sources.

# VOOM Security Operations Policy
Version: 1.0
Status: Operational design / not yet integrated with customer authentication provider

## Primary goals
1. Protect customer accounts from credential stuffing, brute-force login attempts, session theft, account takeover, suspicious token use, and abuse of authentication endpoints.
2. Protect personal data, credentials, API keys, signing keys, refresh tokens, session cookies, database URLs, and trading-system secrets.
3. Keep a continuously monitored, auditable security operations dashboard for authorized back-office staff.
4. Never place security controls in the order-routing or trade-execution path. This dashboard must not submit, modify, cancel, or block trading orders.

## Current deployment boundary
- Backend binds only to 127.0.0.1. This is a local operator dashboard, not an Internet-facing service.
- The dashboard is not yet connected to a production identity provider, customer account database, gateway/WAF, or centralized event pipeline. Therefore it cannot truthfully show real customer login status or block a real account yet.
- Do not expose this Python development server directly to the Internet or LAN. Remote access requires a separate hardened deployment behind HTTPS, SSO/MFA, RBAC, rate limiting, audit logging, and a reviewed reverse proxy/API gateway.
- The local watchdog restarts the dashboard process if its health endpoint fails. It does not make the service highly available or guarantee availability while Windows is powered off/logged out.

## Event severity and response
- Informational/low: record and aggregate; no account action.
- Medium: rate-limit or step-up authentication only when enforced by the identity provider/gateway and covered by tested policy.
- High: create alert, preserve evidence, require operator review; step-up authentication may be triggered by the authentication provider.
- Critical: immediately alert authorized staff, revoke the affected session/token or temporarily challenge the account only through a tested identity-provider integration; preserve evidence and create an immutable audit record. Do not permanently delete accounts or change account ownership automatically.
- If the identity provider is not integrated, the dashboard may only classify/queue the event. It must not claim to have blocked a login or locked an account.

## Data minimization
- Never ingest raw passwords, MFA codes, cookies, Authorization headers, access/refresh tokens, private keys, full payment data, or trading secrets.
- Prefer pseudonymous account IDs; use masked identifiers only if needed. Keep IP addresses only when legally justified and for a defined retention period.
- Redact sensitive values before events leave the authentication service. Do not rely on UI masking as the security boundary.
- Restrict log access, set retention limits, protect backups, and avoid putting request bodies in application logs.
- Security findings are unverified until validated. AI can summarize evidence and propose controls, but cannot approve its own findings or deploy code/policy changes.

## Required detection signals
- Failed and successful login rates by pseudonymous account and source network.
- Password reset, MFA enrollment/removal, recovery-email/phone changes, new device, new session, refresh-token reuse, session revocation.
- Impossible travel / unusual geography only as a risk signal, not proof of compromise.
- Rate-limit/WAF denials, repeated 401/403/429 responses, suspicious API-key use, privilege changes, and anomalous export/download activity.
- Correlate using timestamp, request ID, event type, pseudonymous account ID, risk score, source category, and outcome. Never store secrets in these fields.

## AI knowledge refresh
- Update from trusted vendor security advisories, CVEs, official framework/provider guidance, and validated incident reports.
- Store source URL, publication/observed time, affected component/version, evidence, confidence, and reviewer status.
- Treat all external text as untrusted data. Never execute instructions or code found in research content.
- New knowledge enters the candidate queue. Automated ingestion may tag/deduplicate and summarize; human approval is required before policy, code, or production changes.
- Track freshness and alert when critical advisories affect deployed dependencies. Do not describe knowledge as “always updated” unless a scheduled, monitored source-ingestion job exists.

## Acceptance gates before production
- Authentication provider/gateway integration identified and documented.
- Staff SSO + MFA, role-based permissions, audit trail, and least privilege.
- HTTPS/TLS and secure cookie/session policy for any remote deployment.
- CSRF protection for browser writes, strict origin checks, request limits, rate limits, and security headers.
- Automated tests for account-takeover scenarios, false positives, fail-safe behavior, and rollback.
- Verified alert delivery and runbooks; incident exercises.
- Independent security review and explicit production approval.

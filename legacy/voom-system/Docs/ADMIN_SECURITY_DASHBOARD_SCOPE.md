# Voom_system Admin Security Dashboard — Scope

Updated: 2026-10-23

## Ownership and purpose
The `Security_Dashboard` is reserved as the internal **Admin Security Dashboard** for authorized Voom_system operators. It is not a customer dashboard and must not be linked from public/customer navigation.

## Access boundary
- Keep the HTTP server bound to `127.0.0.1` and use only on the host computer or through an explicitly approved private access path.
- Do not bind to `0.0.0.0`, expose a public URL, or publish it through a public tunnel/reverse proxy.
- Server-side admin login, expiring sessions, CSRF protection for state-changing requests, and role permission checks are implemented and covered by tests. The first admin credential still must be provisioned interactively on the Windows host. The current setup provisions one admin account; multi-user account lifecycle management is not included.
- Before remote admin access or multi-user operation, implement and test strong authentication, authorization, session expiry, CSRF protections for state-changing routes, audit logging, and least-privilege permissions. Prefer VPN/private network access; do not expose it publicly.

## Intended admin functions
1. Review security findings and their evidence/status.
2. Check backup, integrity-test and validation reports.
3. Review secret-handling and protection status without displaying secret values.
4. Show customer account/login events only after the real identity-provider event source is identified, connected and validated.
5. Surface high/critical anomalies for human review; no automatic production remediation by default.

## Separation from trading
- This dashboard is separate from the Trading Dashboard.
- It must not submit, modify, cancel or route trading orders.
- It must not change EA entry/exit conditions, risk settings, order-routing code, or live-trading flags.
- Security findings are proposals until independently validated and explicitly approved by an authorized human.

## Current verified limitations
- Customer authentication event source is not connected; live customer-account monitoring is inactive.
- The local watchdog only restarts/checks the dashboard process. It is not a customer-account monitor or an intrusion-prevention control.
- Checklist state is not proof that controls have been technically enforced.
- Do not claim admin authentication, encryption, Windows ACL hardening or customer monitoring until each is implemented and verified.

## Release checklist
- [x] Local admin authentication, session expiry, CSRF checks, and role permission checks implemented and tested.
- [ ] Provision the initial admin credential interactively and verify Windows ACLs on the auth config.
- [ ] Add and review multi-user account provisioning/lifecycle controls before multi-user or remote use.
- [ ] Server binding and firewall/private-access boundary verified on the host.
- [ ] No secrets exposed in API responses, browser code, application logs or finding records.
- [ ] Audit trail records admin actions without storing credentials or tokens.
- [ ] Customer-auth event source integration tested before showing customer status.
- [ ] Security Dashboard regression tests pass.
- [ ] Confirm Trading Dashboard, EA order path, strategy logic, risk parameters and live-trading flags remain unchanged.

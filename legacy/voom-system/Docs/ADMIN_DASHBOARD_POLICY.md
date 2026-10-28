# Voom_system — Admin Dashboard Policy

Date: 2026-10-23
Status: Admin-only product designation; authentication hardening is still required.

## Purpose
`Security_Dashboard` is the administrative back-office dashboard for authorized Voom_system operators. It is not a customer dashboard and must not be linked from public/customer navigation.

## Admin-only access requirements
- Keep the service bound to `127.0.0.1` by default and use it only on the authorized Windows host, or behind an approved private VPN/reverse proxy with strong authentication.
- Do not port-forward it, expose it directly to the LAN/public Internet, or publish it through a public tunnel.
- Restrict Windows sign-in and project-folder ACLs to approved administrators.
- Before treating it as a production admin console, implement and test server-side authentication, role-based authorization, session expiry, CSRF protection for state-changing requests, and audit logging for administrative actions.
- Do not rely on hiding the URL, browser-side checks, or local-only binding as a substitute for user authentication. Current dashboard has no implemented admin login; local users who can reach the port may access its review functions.
- Do not display secret values, passwords, access tokens, customer financial details, or unnecessary personal data. Show presence/status and redacted metadata only.

## Allowed scope
- Security status, control-check results, backup/integrity status, sanitized findings, and audit events.
- Customer login/account monitoring only after the real identity provider or authentication gateway is identified and connected to a verified event feed.
- High/critical alerts may be surfaced for human review. Automatic enforcement or production remediation requires a separate approved design and test plan.

## Forbidden scope
- No customer-facing access.
- No direct MT5 order submission, order routing, strategy changes, risk-setting changes, or live-trading toggles.
- No secrets displayed in the UI or copied into logs.
- No public Internet exposure.

## Current verified boundary
The dashboard server source sets `HOST = "127.0.0.1"` and exposes review/status endpoints. Its status endpoint currently reports `auth_event_source_connected=false` and `account_monitoring_active=false`. The dashboard does not yet provide a server-side admin login. Therefore the current state is local review only, not a production-secured admin console.

## Release gate
Do not mark the admin dashboard production-ready until access controls are implemented and tested, Windows ACLs are verified, backup restoration is tested, high/critical event handling is exercised, and customer-auth monitoring is validated against the actual auth provider. Keep live trading disabled during this work.

# VOOM Security Dashboard — Admin Only

This is the **Voom_system administrative security dashboard** for authorized operators. It is not a customer-facing dashboard.

## Admin login and access control
- First run: `python setup_admin.py` (or run `start_dashboard.ps1`); set a unique password of at least 16 characters when prompted. The password is hashed with scrypt and is not saved in plaintext.
- The credential hash is stored outside the repository under `%LOCALAPPDATA%\\Voom_system\\SecurityDashboard\\admin_auth.json`. Setup attempts to restrict Windows ACLs to the current user and SYSTEM; verify those ACLs on the host before production.
- The server binds only to `127.0.0.1` on port `8765` by default. Login sessions expire after 30 minutes of inactivity; cookies are HttpOnly and SameSite=Strict; state-changing POSTs require a CSRF token; repeated failed logins are rate-limited.
- Admin actions and login/logout outcomes are recorded in `logs\\admin_audit.jsonl` without passwords or session tokens. Role permissions are enforced for `admin`, `security_analyst`, and `auditor`; the setup wizard currently provisions the initial `admin` account only. Multi-user account provisioning/lifecycle management is not included. Do not share the host or port with untrusted users.
- If you lose the password, run `python setup_admin.py` and type `RESET` when prompted to replace the admin credential; existing sessions will be invalidated after restarting the server.
- Customer authentication/account monitoring is not active until the real identity-provider or authentication-gateway event source is integrated.
- It does not submit MT5 orders or control order routing, strategy, risk parameters, or live-trading flags.

## Run locally
PowerShell:
    Set-Location "C:\Users\Administrator\Documents\Voom_system\Security_Dashboard"
    python server.py

Open http://127.0.0.1:8765 on the authorized Windows computer only.

## Keep backend running
Run once in PowerShell under the Windows user who owns the workspace:
    Set-Location "C:\Users\Administrator\Documents\Voom_system\Security_Dashboard"
    .\install_security_watchdog.ps1

This registers and starts the per-user Scheduled Task `VOOM-Security-Dashboard-Watchdog`. It checks the local health endpoint every 20 seconds and restarts the backend if it stops responding. It starts at that user's logon; it does not guarantee operation when the PC is powered off and is not a high-availability service. Watchdog logs are under `logs\watchdog.log`. Remove the task with:
    Unregister-ScheduledTask -TaskName "VOOM-Security-Dashboard-Watchdog" -Confirm:$false

## Current capabilities
- Reads the security module catalog and control checklist.
- Shows whether the semantic index file exists.
- Lists finding candidates saved under `Research/การป้องกันความปลอดภัยระบบ/_incoming`.
- Accepts finding candidates with validation and common-secret pattern checks.
- Shows customer authentication feed as Not connected until a real identity-provider event source is integrated.

## Safety boundary
- Python standard library only.
- Never expose this development server to LAN or Internet; do not port-forward or use a public tunnel.
- MCP uses stdio; dashboard does not claim an HTTP connection to MCP.
- Checklist checkboxes are session-only and do not represent verified controls.
- Findings are unverified candidates. No command execution, network scanning, secret reading, deployment, production changes, access-policy changes or trading commands are exposed.
- Secret pattern checks are incomplete. Never submit real credentials, account details or sensitive logs.
- No real customer login/account status is visible until an authentication provider or gateway is integrated.
- The watchdog only keeps the local dashboard process running; it does not monitor customer accounts or automatically block attackers.
- Before production use, add and test server-side admin authentication, role-based authorization, session expiry, CSRF protection for state-changing actions, and admin audit logs. Local-only binding is not a substitute for authentication.

## Tests
    python -m unittest discover -s tests -v

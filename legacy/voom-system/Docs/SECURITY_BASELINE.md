# Voom_system Security Baseline — Demo-to-Production Preparation
Updated: 2026-10-23

## Scope and safety boundaries
- Protect credentials, source/config integrity, backups, and security/audit visibility.
- Do not change EA order submission, order routing, strategy entry/exit logic, risk parameters, or live-trading flags as part of security hardening.
- Keep live trading disabled until the signal -> risk guard -> MT5 demo flow has independent tests and review.
- Security Dashboard remains loopback-only at 127.0.0.1; do not expose it directly to the public Internet.
- Customer login monitoring is not active until the real authentication provider/event source is connected and verified.

## Priority controls
1. Secrets: keep actual .env files, service-role keys, bearer tokens, broker credentials, certificates and private keys out of Git, reports, browser code and logs. Use a dedicated secret store or OS credential facility where practical. Never print secret values during audits.
2. File permissions: restrict secret-bearing files and their parent directories to the Windows account/service that needs them. The remote file tool reports generic permissions and cannot verify Windows ACLs; verify with Windows-native security tools on the host.
3. Encryption: encrypt actual secret/data files only after confirming Windows/volume support, runtime account access and recovery-key backup. Do not blanket-encrypt the project, EA/model assets, or live databases.
4. Backups: use timestamped, access-controlled backups; exclude live credentials, tokens, logs and generated/runtime binaries by default. Test restoration to a separate folder. Keep at least one protected copy separate from the working directory.
5. Integrity: run read-only system checks and unit/regression tests before and after changes. Compare test reports and file hashes. Any unexpected change to trading-critical files requires review.
6. Monitoring: record timestamp, event category, component, severity and outcome only. Do not log passwords, tokens, cookies, full Authorization headers, broker account secrets, or raw sensitive request bodies.
7. Supabase: keep service-role key server-side only; maintain RLS and backend-only access to private security/risk tables; verify policies before customer rollout.
8. Incident response: on suspected secret exposure, revoke/rotate the affected credential, inspect access logs, restore from a known-good backup if needed, and verify the trading path separately.

## Current verified state
- Source inventory and project documentation were inspected.
- A protection status report exists at Docs/PROTECTION_STATUS.md.
- Actual encryption and Windows ACL restrictions have NOT been verified/applied through this remote session.
- The listed .env.example files are templates, not proof of actual secret storage. The Voom_system root inventory did not show an actual .env file; other locations/environment variables have not been exhaustively verified.
- Authentication source audit remains BLOCKED for customer-account monitoring.
- No order-routing or strategy code was changed by this security baseline update.

## Release gates before live use
- [ ] Locate and inventory actual secret sources without printing values.
- [ ] Confirm credential rotation/recovery ownership and least-privilege ACLs.
- [ ] Verify backup creation and restore to a separate location.
- [ ] Verify encryption/recovery only for approved secret/data files.
- [ ] Run system checks, Risk Guard unit tests, and safety regression tests.
- [ ] Validate the complete flow on an MT5 demo account with live trading disabled.
- [ ] Confirm security dashboard is loopback-only and does not expose secrets.
- [ ] Connect and test the actual customer-auth event source before claiming customer monitoring is active.
- [ ] Review all release gates with a human before enabling live trading.

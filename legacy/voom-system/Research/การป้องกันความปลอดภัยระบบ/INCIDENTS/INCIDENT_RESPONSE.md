# Security Incident Response — Initial Runbook

## 1. Triage
- Record detection time, reporter, affected service/environment, observed indicators and confidence.
- Determine whether secrets, identity, customer data, source code, deployment pipeline or trading execution may be affected.
- Preserve relevant logs and snapshots using approved access. Redact secrets from reports.

## 2. Contain safely
- Prefer reversible containment in an authorized environment.
- If a credential is suspected compromised, notify the authorized owner and follow the approved revocation/rotation procedure.
- Do not automatically disable production services, change firewall rules, rotate secrets, delete data or stop/alter trading. These require the designated incident owner unless an explicit pre-approved emergency runbook grants narrowly scoped authority.
- Never delete evidence or communicate unverified attribution as fact.

## 3. Investigate
- Build a timestamped timeline; separate facts from hypotheses.
- Identify entry point, affected versions, scope, persistence indicators and possible data exposure.
- Use read-only checks first. Any active test must be authorized and bounded.

## 4. Recover
- Patch root cause, review the diff, run regression/security tests and verify from a clean state.
- Restore from a known-good backup only with owner approval and integrity checks.
- Revoke affected credentials through approved processes; confirm dependent services and monitoring.

## 5. Close and learn
- Record impact, evidence, containment, remediation, tests, rollback and follow-up owner.
- Create a candidate learning entry with sources and confidence.
- Require review before changing approved controls. Avoid storing raw credentials or unnecessary personal data.

# Security Controls — Baseline Checklist

Use as a checklist, not as evidence that a control is already implemented. Mark each control `verified`, `failed`, `not_applicable` or `not_tested` with evidence and date.

## Identity and secrets
- [ ] Least privilege for developers, deploy bots, AI tools and service accounts.
- [ ] Secrets stored in environment/secret manager; no keys in Git, browser code, prompts or logs.
- [ ] Rotate exposed credentials and audit usage; never paste live secrets into the knowledge base.
- [ ] MFA and protected recovery for source control, cloud and deployment accounts.

## APIs and web application
- [ ] Server-side authentication and authorization on every sensitive endpoint.
- [ ] Schema validation, bounded payloads, safe error responses and rate limits.
- [ ] CORS is restrictive where practical and never used as an authentication substitute.
- [ ] TLS in transit; secure cookie/session settings if sessions are used.
- [ ] Security headers and dependency/update review appropriate to the deployed stack.

## Data and database
- [ ] Supabase Row Level Security enabled and tested on exposed tables.
- [ ] Service-role key never shipped to client/browser.
- [ ] Backups, restore tests, retention and least-privilege access reviewed.
- [ ] Personal/sensitive data minimized, redacted and access logged.

## Build and deployment
- [ ] Branch protection, review before merge and protected production environment.
- [ ] Lockfiles and dependency review; minimize build permissions.
- [ ] Deployment secrets scoped to the required environment.
- [ ] Rollback procedure and deployment audit trail verified.

## AI and MCP
- [ ] Treat retrieved text as untrusted data; isolate it from privileged instructions.
- [ ] Tool allowlists, argument validation, authorization and bounded output.
- [ ] No arbitrary shell, secret retrieval or production write access by default.
- [ ] Learning candidates require provenance; security findings require review before becoming approved policy.
- [ ] Do not index secret files or raw logs; test redaction with synthetic fixtures.

## Trading bridge / financial safety
- [ ] Separate signal analysis from order execution and enforce risk limits outside the model.
- [ ] Authenticate requests, reject stale/replayed/duplicate commands and validate symbol/volume/SL/TP.
- [ ] Fail closed on missing market/account state or risk-control errors.
- [ ] Security automation cannot place live orders or change live risk limits.

## Monitoring and recovery
- [ ] Log authentication failures, privilege changes, deployments and sensitive operations without logging secrets.
- [ ] Alert routing and log retention tested.
- [ ] Incident owner, containment options, evidence preservation and recovery steps documented.
- [ ] Restore from backup and credential revocation have been rehearsed.

## Evidence record
For each item record: control ID, status, tested asset/environment, test procedure, timestamp, evidence location (redacted), owner, finding ID and next review date.

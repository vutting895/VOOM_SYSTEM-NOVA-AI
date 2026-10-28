# VOOM Skills — Commercial Access Design

Status: preparation only. No public endpoint, subscription, billing provider, or customer access has been activated.

## Product unit

Distributable knowledge is packaged as a versioned `SKILL.md` directory under `Research/Skills/<skill-name>/`. Each package includes a manifest, version, source list, proprietary license metadata and billing status. A local export is not a security boundary: do not publish the Research folder or its source files publicly.

## Future paid-access request flow

1. Customer authenticates with the VOOM service.
2. API gateway resolves tenant and API-key hash; raw API keys are shown once and never stored.
3. Entitlement check confirms subscription, requested skill, version, quota and status.
4. Service returns only the entitled skill content or performs a server-side retrieval call.
5. Usage is recorded with tenant, skill, operation, timestamp, request ID, units and status.
6. Billing provider aggregates usage or subscription charges; idempotency keys prevent duplicate charges.
7. Admin can revoke keys, disable a skill version, enforce quotas and audit access.

## Required controls before launch

- HTTPS only, hashed API keys, key rotation/revocation and least-privilege scopes.
- Tenant isolation, entitlement checks on every request, rate limits and abuse monitoring.
- Usage events are append-only and idempotent; never log secrets or full private prompts.
- Keep proprietary source documents server-side where possible; return only the licensed SKILL content.
- Signed/versioned releases, changelog, terms of service, privacy notice, retention policy and support process.
- Separate service usage charges from any external model-provider token charges.
- Payment webhook verification and reconciliation before enabling paid access.
- Security review, backup/restore test and load tests before exposing a public endpoint.

## Important limitation

The current MCP server uses local stdio. Its skill export metadata is not an authorization system, and no charge can be enforced on a copied Markdown file. Paid access requires an authenticated hosted API or connector that checks entitlements before serving skill content. Pricing and billing provider are intentionally unset until the commercial plan is chosen.

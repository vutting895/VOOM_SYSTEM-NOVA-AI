# Security & Identity Workstream

**Governance owner:** VOOM System + NOVA Command Center  
**Execution scope:** Security and identity controls within each owning repository.

## Responsibilities
- Define central authentication/authorization and service identity standards.
- Maintain least-privilege, tenant isolation, session validation and audit requirements.
- Define secrets-handling and credential non-disclosure rules.
- Review service-to-service trust, API token forwarding and origin allowlists.
- Coordinate threat modeling and security evidence across repositories.

## Boundaries
- Does not own every repository's source implementation.
- Does not change production secrets, permissions, identity providers or access policies without a separate approved work order.
- Trading execution remains disabled; security approval alone does not authorize broker writes.

## Required evidence
Threat model, affected repository and SHA, permission matrix, negative tests, tenant-isolation evidence, audit evidence, unresolved risks and rollback.
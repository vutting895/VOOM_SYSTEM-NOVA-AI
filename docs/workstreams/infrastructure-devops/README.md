# Infrastructure & DevOps Workstream

**Governance owner:** VOOM System + NOVA Command Center  
**Execution scope:** Infrastructure standards and release governance; infrastructure execution remains with the owning repository.

## Responsibilities
- Maintain environment and service topology.
- Inventory hosting, Workers, database dependencies and deployment triggers.
- Define CI/CD quality gates, artifact provenance and rollback requirements.
- Monitor health, availability, logs and operational cost.
- Coordinate release readiness without bypassing repository ownership.

## Boundaries
- No deployment, provisioning, paid service, secret mutation or permission change is authorized by this specification.
- Preserve the current deployment pause.
- Do not add duplicate workflows or schedulers when existing automation can be assessed or safely extended under separate approval.

## Required evidence
Repository, environment, resource/service identity, branch/SHA, cost impact, change plan, CI evidence, health checks, rollback and explicit approval where required.
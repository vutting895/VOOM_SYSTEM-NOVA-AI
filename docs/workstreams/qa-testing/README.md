# QA & Testing Workstream

**Governance owner:** VOOM System + NOVA Command Center  
**Execution scope:** Shared quality standards and cross-repository integration coordination.

## Responsibilities
- Define test taxonomy: unit, integration, contract, E2E, security, regression and failure-injection.
- Require exact-commit test evidence and distinguish authored tests from executed tests.
- Validate API compatibility and cross-tenant isolation.
- Maintain test traceability to Work Orders and acceptance criteria.
- Coordinate cross-repository verification while each repository owns tests for its own code.

## Boundaries
- A queued/unassigned CI job is not a test result.
- A mock is not proof of a live provider, broker, database or tenant integration.
- No test result authorizes production deployment or trading execution.

## Required evidence
Repository, exact branch/SHA, command or workflow/run ID, runner/steps, result, artifact/log link, test scope, environment, known gaps and next action.
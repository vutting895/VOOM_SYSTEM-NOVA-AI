# NOVA Project Contract v1

- Status: dependency-free wire-contract implementation proposal; not a deployed API or authentication service.
- Related architecture: PR #223.
- Main baseline: 6e8d390ac45187fb70b6acb23f1e428a20ca7006.

## Purpose

Define a small, versioned boundary between NOVA Core and independently deployable projects such as Trading and Video. A project can evolve its internal application without changing NOVA identity, tenant ownership, capability policy or secret custody.

## Ownership

- NOVA Core / System Hub owns authentication context, tenant authorization, capability policy, routing, audit and rate enforcement.
- A project owns domain logic, project data, compute, model artifacts, job lifecycle and project UI/API.
- The project registry is server-managed. A client cannot register a project, set its owner scope, grant itself capabilities or choose upstream URLs.
- The shared contract validates shapes only. It does not authenticate JWTs, query Supabase RLS, enforce quotas or authorize resources.

## Request envelope

The dependency-free validator in shared/nova-project-contract.mjs accepts a strict nova.project.request.v1 envelope:

- request_id: UUID for correlation.
- project_id and api_version: must match the server-owned registry record.
- intent: typed, bounded intent name.
- capability: must be in the Core allowlist and the registered project's capability set.
- resource: explicit kind and ID.
- input: plain JSON object.
- idempotency_key: bounded key for the owning service to enforce.
- requested_at: RFC3339 timestamp.

The request intentionally contains no user ID, tenant ID, bearer token, credential, secret, or upstream URL. NOVA derives principal and tenant from verified server-side authentication and passes trusted context only across approved service boundaries.

## Response envelope

The nova.project.response.v1 validator checks request correlation, status, timestamp, provenance and exclusive result/error shape. Price/quantity precision remains a project data contract; represent authoritative decimal values as decimal strings or integer ticks, not binary floating point.

## Capability baseline

The initial validator only recognizes the existing NOVA System Core v1 capability vocabulary. It does not grant a project any capability. A project record can only narrow the allowlist, never expand it. Broker writes, secret access and arbitrary URL routing remain forbidden.

## Validation and CI

Run:
    node --check shared/nova-project-contract.mjs
    node --test tests/nova-project-contract.test.mjs

CI is path-scoped and runs on PRs targeting main. No production route, database schema, Worker binding, secret, provider setting, QPU or paid compute is introduced by this change.

## Next integration gates

1. Reconcile this contract with PR #217 System Core and PR #218 Hub enforcement; remove duplicate policy vocabulary rather than creating a second policy engine.
2. Add server-side identity/tenant context injection at the existing System Hub.
3. Add cross-tenant denial, idempotency, replay, timeout and audit tests at the real route boundary.
4. Register Trading only after its independent repository and ownership are confirmed.
5. Keep Exness Demo read-only and all broker write capabilities absent.

---
name: nova-architecture
description: Use when designing, auditing, or changing NOVA system architecture, service boundaries, repository ownership, module reuse, API or MCP integration, data flow, deployment topology, or migration plans.
---

# NOVA Architecture

## Ownership boundaries
- NOVA owns the user-facing UI/dashboard, Supabase authentication/session flow, the single NOVA Remote MCP Gateway, AI Provider Gateway/general platform orchestration, Knowledge service, read-only broker data access, and trading risk/execution safety controls.
- Datacenter solely owns research and learning computation and authoritative research lineage: data quality, features/labels, SMC, Elliott Wave, strategy research, backtesting, walk-forward research, model training, evaluation, and model registry.
- Shared Contracts is the canonical source for shared API, MCP, event, and data schemas.

## Design procedure
1. Read the current approved architecture Work Order and ownership matrix.
2. Inventory existing modules, callers, contracts, tests, and operational workflows before proposing new components.
3. Prefer reuse of existing NOVA Gateway, Provider Gateway, authentication/session mechanisms, and contracts where they meet requirements.
4. Define trust boundaries, tenant identity, authentication propagation, data ownership, failure modes, timeouts, bounds, idempotency, observability, and rollback.
5. Keep browser access behind the existing authenticated NOVA API boundary. Do not add direct browser-to-Datacenter access.
6. Preserve legacy modules until replacement parity, caller migration, rollback, and consolidated tests are evidenced.

## Stop conditions
Do not create a second Gateway/MCP endpoint, duplicate research store, new runtime, paid infrastructure, or cross-repository migration without a specific approved Work Order. Stop when ownership or security boundaries are unclear. Production deployment remains paused.

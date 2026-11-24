# Command Center — Repository Structure Specification

- Work Order: WO-2026-11-24-003
- Target repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- This is a logical target structure, not authorization to relocate existing code.

## Target logical structure

```text
VOOM_SYSTEM-NOVA-AI/
├── apps/
│   └── nova-command-center/       # Admin UI and central control surface
├── backend/                       # Command Center-owned backend services only
├── integrations/
│   ├── remote-mcp-worker/          # Existing central MCP Gateway integration
│   └── services/                   # Approved internal-service adapters
├── contracts/                     # Only if mapped to canonical Shared Contracts; avoid duplicate schemas
├── docs/
│   ├── architecture/
│   ├── governance/
│   ├── workstreams/
│   ├── runbooks/
│   └── decisions/
├── infra/                         # Infrastructure definitions; no deployment by docs work order
├── workers/                       # Existing Worker runtime code
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── security/
├── logs/
│   └── OPERATIONS.md
└── WORK_ORDER_INSTRUCTIONS.md
```

## Four internal workstream documentation locations

- `docs/workstreams/security-identity/`
- `docs/workstreams/infrastructure-devops/`
- `docs/workstreams/knowledge-center/`
- `docs/workstreams/qa-testing/`

## Placement rules

1. Command Center owns central control, system administration, API orchestration, authentication integration, service registry, audit and risk/safety governance.
2. VOOM AI owns its user-facing trading application and application-level trading logic.
3. Datacenter owns all authoritative research and learning computation and artifacts.
4. Shared Contracts owns canonical cross-repository schemas; NOVA must reference/version them rather than silently fork them.
5. Affiliate and Remote Desktop remain separate unless a future approved integration work order explicitly changes their boundaries.
6. Do not create a second MCP Gateway, duplicate service registry, duplicate authoritative research store, or duplicate master tracker.
7. Preserve current directories and source paths until a migration work order defines parity, dependency updates, rollback and acceptance criteria.

## Naming and evidence

Use descriptive, stable lowercase directory names. Put decisions and policies in `docs/`; executable code remains in the existing runtime directories. Every structural change must include a Work Order ID and append-only operation log. Do not add placeholder directories that have no owned deliverable.
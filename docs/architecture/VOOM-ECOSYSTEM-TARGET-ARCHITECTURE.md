# VOOM Ecosystem — Target Architecture

- Work Order: [WO-2026-11-24-003](https://github.com/vutting895/voom-shared-contracts/blob/main/work-orders/WO-2026-11-24-003-voom-target-architecture.md)
- Status: target architecture approved; implementation/migration not yet verified.
- Effective decision date: 2026-11-24.

## 1. Two primary systems

### VOOM AI — Main Application
VOOM AI is the user-facing website and AI automatic-trading application. It owns the trading product experience and application-level trading functionality: web UI, trading dashboard, strategy presentation/configuration, signal presentation, portfolio/account views, trade history, performance views, and its application-facing trading APIs.

Trading strategy and trading-application logic are managed by the VOOM AI owner within central architecture, security, API, and risk constraints. Research and learning computation remain owned by Datacenter.

### VOOM System + NOVA — Command Center
The canonical NOVA repository is the central Command Center implementation. It combines the former VOOM System administrative/control role with NOVA Core. It is the ecosystem control plane for system administration, service registry, central MCP Gateway, API governance, authentication/authorization integration, orchestration, monitoring, audit/logging, and internal control surfaces.

Do not create a second Command Center or a second central MCP Gateway.

## 2. Internal services and independent ownership

- **Datacenter:** sole owner of research and learning computation, including datasets, data quality/provenance, features/labels, SMC/Elliott Wave research, strategy research/optimization, backtesting, walk-forward research, training, evaluation, and model registry.
- **VOOM Shared Contracts:** canonical source for versioned API, MCP, event, and data contracts.
- **Broker / MT5 services:** broker connectivity remains isolated behind approved authenticated services and risk controls. MT5 remains Demo/read-only unless a separate approval gate explicitly changes this.
- **Cloudflare Workers / backend services:** service runtimes remain independently deployable components governed by Command Center contracts and registry.
- **Affiliate:** Voom Studio Affiliate remains a separate product and repository; it is not absorbed into VOOM AI or NOVA by this decision.
- **Remote Desktop:** remains a separate infrastructure capability until its active role and dependencies are verified.

## 3. Four internal workstreams (not separate ChatGPT Projects)

1. Security & Identity — central policy, identity integration, permissions, tenant isolation, audit and secrets-handling standards.
2. Infrastructure & DevOps — environment topology, CI/CD assessment, hosting configuration, observability and release controls. No deployment is authorized by this specification.
3. Knowledge Center — governance documentation, service knowledge, operational runbooks and indexed references. Do not duplicate Datacenter research/model storage.
4. QA & Testing — shared test strategy, contract validation, integration/E2E coverage, regression and evidence quality. Test execution remains owned by each repository for its own code.

These workstreams are capabilities within the Command Center and relevant product repositories, not new ChatGPT Projects or necessarily separate deployable services.

## 4. Integration and authority rules

- VOOM AI integrates with Command Center through versioned, authenticated API contracts.
- Internal services are registered and accessed through approved service boundaries; no browser-direct access to internal services.
- Datacenter is called through the existing authenticated NOVA Remote MCP Gateway and its single approved Datacenter MCP endpoint.
- Command Center controls system-wide architecture, security baselines, API standards, service registration and operational governance.
- Product repositories retain authority over their own domain implementation within those central constraints.
- Trading strategy and optimization are not centrally micromanaged; safety, identity, permission, risk and execution gates remain centrally governed.
- Every repository reports status and evidence to the central governance context. Local reports remain repository-scoped.

## 5. Safety and release constraints

- Live Trading remains OFF.
- `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- MT5 remains Demo/read-only.
- No production deployment, secret change, permission change, broker write, order execution, transfer or withdrawal is authorized by this architecture record.
- A target architecture is not proof of completed migration, integration, test coverage or runtime readiness.

## 6. Migration rule

Before moving code/data, inventory source and destination ownership, dependencies, callers, schemas, secrets references, tests, rollback and provenance. Preserve source implementations until destination parity and rollback are evidenced and a separate scoped work order authorizes the migration.

## 7. Status vocabulary

Use DONE only with evidence; otherwise IN_PROGRESS, PENDING, BLOCKED, VERIFY, STALE or OBSOLETE. Record repository, branch, commit SHA, task/work-order ID, test evidence, blockers and next actions.
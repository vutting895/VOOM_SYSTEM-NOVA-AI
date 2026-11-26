# NOVA architecture documentation audit — 2026-11-25

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Branch reviewed: `main`
- Main SHA at audit start: `6968e5b3564a83b29a7e16976787bffd92387a49`
- Scope: documentation consistency and source-boundary verification; no runtime changes.
- Authority: NOVA Master Tracker Issue #36 and approved Work Order WO-2026-11-24-003.
- Status: **AUDIT COMPLETE FOR THE FILES LISTED; REMEDIATION REQUIRED**. This is not a declaration that all architecture documentation in the repository has been reviewed.

## 1. Executive findings

The target architecture and repository ownership matrix agree on the intended separation: NOVA is the central Command Center/control plane; Datacenter owns research and learning compute; VOOM Shared Contracts owns canonical cross-repository contracts; Affiliate is separate. The current checked-in implementation documentation also describes distinct NOVA surfaces/services: Command Center Worker API, System Integration Hub, and Remote MCP Worker.

The main documentation risk is not simply age. Several documents describe different services but use broad labels such as “NOVA API”, “Hub”, “Gateway” or “Worker” without consistently naming the runtime and endpoint. This can lead readers to assume they are the same API or that a target architecture is already deployed.

A second risk is status drift: architecture target documents explicitly state that migration/implementation is unverified, while individual service READMEs describe endpoint behavior and deployment configuration. The latter must not be used to infer that every upstream dependency is live or that all listed capabilities have passed production acceptance.

## 2. Ownership and target architecture — consistent, with verification gaps

### Canonical ownership

The following checked-in records align:
- `docs/governance/REPOSITORY-OWNERSHIP-MATRIX.md`
- `docs/architecture/VOOM-ECOSYSTEM-TARGET-ARCHITECTURE.md`
- `docs/architecture/COMMAND-CENTER-REPOSITORY-STRUCTURE.md`

They assign:
- NOVA repository: central Command Center, administration/control plane, central MCP Gateway and governance.
- Datacenter repository: sole owner of data/research/learning compute, dataset lineage, backtests, training, evaluation and model registry.
- VOOM Shared Contracts: canonical API/MCP/event/data contracts.
- VOOM Studio Affiliate: separate product/repository.

The ownership matrix itself marks VOOM AI source ownership, System-nova-backend and Remote Desktop as VERIFY/candidate. Do not silently upgrade these to confirmed runtime dependencies. Datacenter is assigned a confirmed role, but its current implementation state is explicitly still subject to audit.

**Disposition:** retain target ownership decisions; preserve VERIFY labels until each candidate repository's current main, dependency callers, deployment and operational evidence have been inspected.

## 3. Runtime boundary audit

### A. Command Center Worker API

Source document: `apps/nova-command-center/docs/worker-api-contract.md`

This document defines a role-gated, GET-only read API with Supabase JWT verification, role claims in `app_metadata.nova_role`, and explicit no-order/no-account-mutation scope. It is a contract/skeleton document; it does not by itself prove that every endpoint is implemented, deployed, or connected to the production UI.

Important clarification: this contract is not interchangeable with the System Integration Hub API. Keep its base path, auth policy, role model and GET-only behavior explicitly scoped to the Command Center Worker.

### B. System Integration Hub

Source document: `integrations/system-hub/README.md`

This service documents customer-owned integration metadata and read-only Exness Demo account/market reads through the tenant-isolated MT5 Proxy. Its lifecycle includes pending connection creation and connection checks, so the documented Hub surface includes selected POST operations for connection lifecycle. Those POST operations are not broker trading writes and must remain explicitly allowlisted, owner-scoped and idempotent.

The README states that `GET /health` only reports public process/readiness status and does not prove Supabase, Bridge or broker reachability. It also states that connection status is not “connected” until tenant Bridge allocation and a real account read succeed. Preserve this distinction in dashboard and architecture docs.

The Binance adapter described there is a public-market-data pilot and explicitly not wired into production Worker routes or deployed. Do not list it as an active customer broker connection.

### C. Remote MCP Worker / Gateway

Source document: `integrations/remote-mcp-worker/README.md`

This document describes a stateless, tools-only Streamable HTTP MCP Worker, bearer-token authentication, strict origin allowlist and read-only/research tools. It explicitly does not implement MCP resources/prompts or SSE, and does not claim full MCP feature coverage.

It describes Datacenter tools as routed to a fixed `DATACENTER_MCP_URL`; if missing, calls fail closed. It also states that the current repository does not yet contain a deployed Datacenter hostname. Therefore:
- the Gateway integration contract may exist;
- the Datacenter runtime endpoint is **NOT VERIFIED / NOT DEPLOYED according to this README**;
- Datacenter learning tools must not be represented as operational end-to-end until a real fixed endpoint, authenticated connectivity, smoke tests and run evidence exist.

Do not confuse this remote Worker with the local stdio MCP prototype. The README says local stdio server deployment is independent.

### D. Datacenter research compute

Target architecture documents assign Datacenter sole ownership of research compute, but NOVA's Gateway README explicitly records that no deployed Datacenter hostname is currently present in this repository's configuration evidence.

**Disposition:** architecture ownership is accepted as the target; live service integration remains **BLOCKED / NOT VERIFIED** pending Datacenter deployment endpoint and authenticated integration tests. This audit does not change the Datacenter repository or provision infrastructure.

## 4. Cross-document conflicts and required corrections

| Documents / boundary | Finding | Required correction |
|---|---|---|
| `worker-api-contract.md` vs `system-hub/README.md` | Different APIs have different method surfaces. One is GET-only Command Center read API; the Hub has owner-scoped POST connection lifecycle actions. Generic “NOVA Worker API” naming can cause accidental policy mixing. | Add explicit service identity, base path, owner, auth model and method policy to every endpoint reference. Do not merge the contracts into one generic API. |
| Target architecture vs service READMEs | Target architecture is approved but implementation/migration is unverified; service READMEs describe implementation contracts and some configured deployment behavior. | Add per-capability implementation evidence and exact deployment SHA/URL; do not infer runtime readiness from a target diagram or README. |
| Remote MCP README vs Datacenter ownership target | Datacenter MCP URL is fixed-config only when provisioned; README says deployed hostname is not yet present. | Mark NOVA↔Datacenter runtime link BLOCKED/NOT VERIFIED until endpoint, auth, tunnel and smoke evidence are recorded. |
| Ownership matrix vs candidate repos | Several repositories remain VERIFY or candidate. | Keep unverified repositories outside canonical runtime diagrams until their source and dependency evidence are checked. |
| Multibroker autoconnect design vs current first-release scope | Exness Demo is the first release; IBKR/CCXT are planned adapter families. Binance public-data pilot is not production account connectivity. | Label provider capabilities individually as implemented, pilot, planned or unavailable; never label all brokers “connected”. |
| Legacy MCP prototype vs central Gateway | Legacy/local stdio and deployed remote Gateway are distinct runtimes. | Document default Compose startup and archive profile only after current Compose and runtime tests; avoid duplicate Gateway deployment. |

## 5. Required architecture vocabulary

Use these canonical names in future documentation:

1. **NOVA Command Center Worker API** — Command Center role-gated read API; GET-only contract.
2. **NOVA System Integration Hub** — owner-scoped integration/connection control plane; selected POSTs are lifecycle operations, not broker writes.
3. **NOVA Remote MCP Gateway Worker** — stateless authenticated MCP tools endpoint; research/read-only; fixed upstream allowlist.
4. **Local/legacy MCP stdio prototype** — development/archive runtime; not the central deployed Gateway.
5. **Datacenter MCP service** — research/compute service owned by Datacenter; endpoint readiness is independently verified.
6. **VOOM Shared Contracts** — canonical cross-repository contract source.

Avoid the ambiguous standalone terms “API”, “Hub”, “MCP server” or “Worker” where the service identity is material.

## 6. Status and acceptance matrix

| Capability | Documentation evidence | Audit status | Evidence still required |
|---|---|---|---|
| NOVA central Command Center ownership | Ownership matrix + target architecture | **DONE — target decision** | Source/deployment parity is separate |
| Datacenter sole research/learning ownership | Ownership matrix + target architecture | **DONE — target decision** | Datacenter current implementation and runtime audit |
| Command Center Worker API contract | Worker API contract file | **DOCUMENTED; runtime NOT VERIFIED** | Route implementation, exact deployment SHA, auth/role tests |
| System Integration Hub contract | Hub README | **DOCUMENTED; capability-specific runtime verification required** | Exact Worker deployment SHA, real Supabase RLS and two-user tests, MT5 Bridge read proof |
| Remote MCP Gateway contract | Remote MCP README | **DOCUMENTED; capability-specific runtime verification required** | Exact deployed SHA, origin/auth negative tests, production health and tool smoke |
| NOVA↔Datacenter live MCP connection | Remote MCP README says deployed hostname absent | **BLOCKED / NOT VERIFIED** | Fixed endpoint, tunnel, auth, health, tool-call evidence |
| Binance private customer account connection | README describes public market-data pilot only | **NOT IMPLEMENTED / NOT VERIFIED** | Separate approved adapter, credential scope and staging tests |
| IBKR customer connection | Multi-broker design only | **PLANNED** | Isolated runtime/connector and authenticated read-only acceptance |
| Legacy MCP Compose isolation | PR proposals exist; no Docker runtime evidence recorded in prior tracker | **IN PROGRESS** | Compose config + default/opt-in startup tests on current main |
| Live broker execution | Safety constraints | **DISABLED** | Separate explicit governance/production gate; not part of this audit |

## 7. Remediation plan

**P0 — Governance and tracker**
- Append this audit to NOVA Master Tracker #36 with the exact main SHA and audit scope.
- Link this audit from the current documentation status snapshot and README.

**P1 — Contract clarity**
- Update Command Center Worker API contract heading and service identity; explicitly state it is not the System Integration Hub.
- Add a service boundary index that lists owner, runtime, endpoint, authentication, allowed methods, data authority and deployment evidence for each service.
- Add a clear Datacenter MCP deployment gate to the Remote MCP and target architecture documents.

**P1 — Evidence**
- Verify each runtime against its actual deployed Worker name, route, current deployed SHA and health/test results.
- Run real two-user tenant-isolation tests for Hub and MT5 Proxy.
- Require actual Datacenter MCP authenticated smoke tests before marking learning tools operational.

**P2 — Cleanup**
- Reconcile older architecture files and duplicate integration descriptions only after link/back-reference checks.
- Preserve historical decisions and snapshots; mark them superseded instead of deleting evidence.
- Do not move code, change routes, alter Supabase schemas, change secrets, deploy Workers or enable broker writes under this documentation-only audit.

## 8. Scope and limitations

This audit inspected the current main branch and the eight named ownership/architecture/service-contract documents. It is not a line-by-line review of all 489 tree entries, nor a live Cloudflare, Supabase, Netlify, Datacenter or MT5 health check. No endpoint was called and no deployment SHA was independently verified in provider dashboards.

No application source, infrastructure, workflow, database, secret, model, broker or production configuration was modified. The audit is documentation evidence and a remediation queue, not an operational readiness certification.

# NOVA repository documentation status — 2026-11-25

> Snapshot only. This document records what was verified against GitHub at the time of review. It is not a release approval, deployment report, or substitute for the live Master Tracker.

## Repository baseline

- Canonical repository: [vutting895/VOOM_SYSTEM-NOVA-AI](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI)
- Default branch: `main`
- Main HEAD observed before documentation changes: `6968e5b3564a83b29a7e16976787bffd92387a49`
- Repository visibility: public; repository is not archived.
- Review date: 2026-11-25 (Asia/Bangkok)
- Master Tracker: [Issue #36](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/36)
- Work-order instructions: [WORK_ORDER_INSTRUCTIONS.md](../../WORK_ORDER_INSTRUCTIONS.md)

Always re-read `refs/heads/main` and the current PR/issue metadata before making a new change. The SHA above is a historical snapshot and must not be reused as a future write base without a fresh read.

## Documentation authority and status rules

1. Issue #36 remains the NOVA Master Tracker. This snapshot does not replace it.
2. `WORK_ORDER_INSTRUCTIONS.md` and the approved central Work Order define scope, stop conditions, and execution authority.
3. Current source, tests, workflow runs, deployment metadata and live service checks take precedence over old narrative status reports.
4. A PR being open, mergeable, or having a green check does not establish that its changes are merged, deployed, or operational.
5. Distinguish implementation from validation: authored tests are not executed tests; CI does not prove live tenant isolation, broker connectivity, or production behavior.
6. Use these labels consistently:
   - **DONE** — exact implementation and required acceptance evidence verified.
   - **IN PROGRESS** — work exists, but acceptance criteria remain.
   - **BLOCKED** — a named dependency, decision, test environment, or evidence is missing.
   - **NOT VERIFIED** — no current evidence sufficient to make a claim.
   - **SUPERSEDED** — a newer candidate replaces the older one; retain the older record as history.

## Current architecture boundaries

The following are the governing repository-level boundaries reflected in the current work-order instructions and ownership records. They are architecture/ownership statements, not a claim that every component is deployed or complete.

- **NOVA Core / Command Center:** central administration and user-facing control plane, authentication/session boundary, central API and integration coordination.
- **Remote MCP:** maintain one canonical NOVA Remote MCP Gateway. Do not add per-worker or per-service duplicate gateways.
- **Datacenter:** sole owner of authoritative research and learning computation/lineage: data quality, features/labels, SMC and strategy research, backtesting, walk-forward research, model training/evaluation and model registry. NOVA consumes these capabilities through the approved authenticated MCP boundary.
- **VOOM Shared Contracts:** canonical cross-repository API, MCP, event and data contracts.
- **VOOM AI, System-nova-backend and Remote Desktop:** ownership and implementation remain subject to the current repository ownership matrix; do not assume a candidate repository is an active production dependency without fresh evidence.
- **VOOM Studio Affiliate:** separate product/repository; do not mix its code, data or delivery status into NOVA.

### Runtime and release constraints

- Exness MT5 remains Demo/read-only.
- Required safety invariants: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
- No broker order submission, account mutation, transfer, withdrawal, model promotion, production database mutation, or production deployment is authorized by this documentation refresh.
- Netlify is the preferred NOVA frontend target and Cloudflare Workers the API/edge boundary where the approved release plan specifies them. Vercel status is not production evidence for NOVA.
- Supabase migrations and tenant-isolation changes require a healthy isolated non-production environment and real owner/foreign-user tests before production consideration.
- Keep secrets out of source, logs, reports and documentation.

## Active PR inventory — observed 2026-11-25

All rows below were fetched from GitHub PR metadata. They were **OPEN / UNMERGED** at the time of review unless stated otherwise. “Mergeable” is GitHub's metadata only; it is not approval to merge. CI and deployment evidence must be rechecked on each exact head.

| PR | Workstream | Observed head | Current disposition |
|---|---|---|---|
| [#398](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/398) | Isolate legacy MCP from default Compose startup | `2ba436f65edacf261fd6b8b9d63754622e299c32` | **IN PROGRESS** — current-main candidate; validate Compose config and default/opt-in startup before acceptance. |
| [#397](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/397) | Port MCP syntax and risk-approval fixes to newer baseline | `5ccb6cd9f24d2f56b0c0871724270a4608563c47` | **IN PROGRESS** — current-main port candidate; compare with #394 and require exact-head tests. |
| [#396](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/396) | Bounded, tenant-scoped, read-only MT5 history API | `6bb03c5475956b18972fb3ff519702c2763ee04a` | **IN PROGRESS** — validate GET-only contract, UTC bounds, bar limits, connected-terminal gate and tenant isolation. |
| [#394](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/394) | MCP syntax and risk-approval regression fix | `4b4ac6fd9246c46c4efb604825cff9a830ad418d` | **IN PROGRESS / REVIEW OVERLAP** — compare against newer #397; do not merge both blindly. |
| [#389](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/389) | Multi-repository Command Center/API architecture docs | `b0c444034813ee1fc6364601f5c25cc384c0fd8f` | **IN PROGRESS** — documentation-only candidate; reconcile with current ownership and live implementation before adoption. |
| [#387](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/387) | NOVA Command Center dependency updates (Zod/Vite) | `107668c9c9b4153eebea299ea70beefcd190d3b0` | **BLOCKED / REVIEW** — inspect major Zod change, lockfile consistency, typecheck, tests and build. |
| [#386](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/386) | MCP runtime inventory and legacy prototype isolation | `3724c9e327c60bf229711d61846b53a9045e0c2a` | **IN PROGRESS / SUPERSESSION REVIEW** — compare Compose change with #398; inventory claims must be refreshed against current source. |
| [#384](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/384) | Dataset/model registry and learning dashboard | `e80a06e80098a2c82bd9db880969fd13258ab251` | **BLOCKED** — migration is a candidate, not an applied schema; isolated Supabase/RLS/two-owner tests required. |
| [#383](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/383) | Leakage-safe XGBoost learning orchestrator | `3e65f554e1a01524f12a04ab2bf87b473ef1becb` | **IN PROGRESS / RESEARCH ONLY** — tests do not establish real-data provenance, training completion or OOS profitability. |
| [#382](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/382) | Central MCP Gateway and Hub API contract | `2a659894a05f6c7eb4d288996155d69e1ec2df0e` | **IN PROGRESS** — reconcile with current Gateway/Hub source and #397 before accepting overlapping implementation. |
| [#381](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/381) | Continuous learning and analysis architecture | `13d958208d8b6c7f827dcb8e92a6bc1acf2dc3e0` | **IN PROGRESS / SPECIFICATION** — architecture and candidate trainer do not prove production learning runtime. |
| [#380](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/380) | Deterministic historical backtest/tuning engines | `08edd44fd77b96285718b50156bf4ed5cb758d8e` | **IN PROGRESS** — verify implementation and point-in-time correctness on current base; do not infer strategy profitability. |
| [#377](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/377) | Authenticated read-only NOVA Core API foundation | `1835daca108d993ad98bd878a4f02bb1c4d30fd2` | **IN PROGRESS** — staging/API evidence is separate from production deployment and tenant acceptance. |
| [#376](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/376) | MT5 proxy schema/customer lookup alignment | `673c85b6536a5890e6507e434222ee2ac614813b` | **IN PROGRESS / BLOCKED** — mocked tests do not prove live Supabase RLS or real two-customer isolation. |

### PR reconciliation priorities

1. Review #398 against #386 and earlier Compose candidates (#391/#392): retain one canonical implementation and avoid duplicate Compose changes or CI workflows.
2. Review #397 against #394: #397 is a newer port candidate, but exact-head validation and full patch comparison are still required.
3. Review #382 with #397 and current Hub/Gateway implementation; do not assume proposed routes are merged or deployed.
4. Review #383, #380 and #381 as distinct research/learning scopes. Preserve research lineage and prevent synthetic fixtures from being presented as market evidence.
5. Keep #384 migration unapplied until isolated Supabase staging, grants/RLS review and two-user foreign-tenant denial are proven.
6. Validate #396 independently. A successful history endpoint test must include a connected Demo terminal and must remain read-only.
7. Do not bulk-merge, bulk-close, or force-update PRs based on title similarity or GitHub's mergeable flag.

## Documentation audit findings

- The root README currently describes the product as a Vite React SPA and lists broad product features, but does not identify the current canonical repository architecture, work-order authority, safety invariants, or current release limitations. Treat it as a high-level introduction, not an operational status source.
- The existing governance overlap refresh file records an earlier PR snapshot. Its historical findings remain useful, but its main SHA and PR table are stale relative to the baseline in this document.
- Issue #36 contains valuable historical checkpoints but has an older latest recorded main SHA. Re-read it and append a new checkpoint before using it as current execution status.
- Architecture, research, implementation and deployment documents are not interchangeable. Preserve historical records; add dated status snapshots rather than rewriting old evidence as if it were current.
- No claim is made here that every documentation file was line-by-line reviewed. This pass inspected the root tree, root README, work-order instructions, ownership matrix, governance overlap report, tracker issue and selected current PR metadata.

## Next actions

1. **P0 — Refresh Master Tracker #36** with the main SHA and current PR heads above, after verifying no newer changes occurred.
2. **P0 — Reconcile #398/#386 and #397/#394** at patch level; preserve one canonical candidate per change and require exact-head validation.
3. **P1 — Refresh architecture docs** for the current NOVA ↔ Datacenter boundary, single MCP Gateway, Hub API, and repository ownership only where implementation evidence supports the statements.
4. **P1 — Audit README and docs index** against actual app package/build commands and current deployment target; do not publish unverified commands or feature claims.
5. **P1 — Record live acceptance gaps** for Supabase tenant isolation, authenticated MT5 reads/history, and deployment parity.
6. **P2 — Archive or label stale snapshots** only after checking inbound links and preserving audit history. Do not delete historical evidence during routine documentation refresh.

## Change scope and exclusions

This snapshot was prepared from read-only GitHub inspection. The documentation branch may add this file and a root README pointer only. No application code, migrations, workflows, secrets, permissions, production services, database rows, model artifacts, broker settings, or deployment targets are changed.

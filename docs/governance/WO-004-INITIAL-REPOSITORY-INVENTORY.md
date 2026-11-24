# WO-2026-11-24-004 — Initial Repository Inventory

- **Work Order:** WO-2026-11-24-004
- **Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`
- **Branch:** `main`
- **Observed main HEAD:** `b05459f0396c8d5108ddca0afc6b547315fec640` (latest commit search result; commit message: `docs(ops): record architecture documentation read-back`)
- **Inventory date:** 2026-11-24
- **Status:** PARTIAL — branch pagination complete; PR and full-tree inventory still in progress.
- **No source/data files moved in this phase.**

## 1. Branch inventory

GitHub branch search returned four pages:
- Page 1: 100 branch names
- Page 2: 100 branch names
- Page 3: 100 branch names
- Page 4: 18 branch names
- Total discovered: **318 branch names**, including `main`.
- Final cursor: `MzE4` (no further page indicated).

The inventory contains many overlapping feature, fix, docs, research, data, security, CI and integration branches. Examples requiring disposition include:
- Core API: `feature/nova-core-api-readonly-v1`, `feature/nova-core-readonly-api`
- Command Center contracts: `feature/nova-command-center-multi-repo-contract`, `feature/nova-multi-repo-contract-v2`
- MCP: `architecture/nova-central-mcp-gateway`, `architecture/nova-single-mcp-gateway`, `architecture/nova-mcp-runtime-inventory`
- Research: `feature/wave3-hybrid-backtest-20261029`, `research/wave3-positive-edge-architecture-20261031`, plus many legacy quant/backtest branches
- Data: `data/exness-xauusd-h1-3y-20261107` and other Exness import/recovery branches
- MT5: multiple read-only bridge, EA parity, heartbeat and tenant-isolation branches
- Security: multiple auth isolation, secret custody and fail-closed branches

**Disposition:** no branch deleted, renamed, force-updated or merged. Branch names alone do not prove redundancy or staleness.

## 2. PR search coverage and limitation

A repository-scoped PR search returned 100 results (the configured result limit). This is a useful current shortlist but is **not evidence that all repository PRs have been enumerated**. Additional date/range queries and individual PR checks are required to complete historical/open/closed coverage.

## 3. High-priority PR evidence

| PR | Observed state | Main changed paths / finding | Preliminary disposition |
|---|---|---|---|
| #389 | Open, Draft | `docs/architecture/NOVA-MULTI-REPO-COMMAND-CENTER-INTEGRATION-PLAN.md`, `docs/openapi/nova-system-hub-v1.yaml` | KEEP candidate; compare against #388 and current docs |
| #388 | Closed, not merged, Draft | Same two paths as #389 | SUPERSEDED candidate; inspect unique commits/comments before final closure classification |
| #387 | Open | `apps/nova-command-center/package.json` | KEEP candidate; dependency update review |
| #386 | Open, Draft | MCP inventory doc and `infra/docker-compose.yml` | KEEP candidate; infra diff requires review |
| #385 | Open, Draft | Single MCP Gateway architecture document | KEEP candidate; reconcile with #382 and existing Gateway |
| #384 | Open, Draft | Dashboard route, Remote MCP Worker, tests and Supabase migration | BLOCKED pending auth/schema/runtime and owner review |
| #383 | Open, Draft | `integrations/nova-ai-mcp-full-clean/` research workers and workflow | BLOCKED / ownership conflict: Datacenter owns research computation |
| #382 | Open, Draft | System Hub Worker, gateway contract, CI and architecture docs | KEEP candidate; verify it does not create a second Gateway |
| #381 | Open, Draft | `workers/quant_engine/`, research tests and CI | BLOCKED / ownership conflict: Datacenter owns research computation |
| #380 | Open | `workers/backtest/`, `workers/tuning/`, `workers/quant_engine/`, CI and tests | BLOCKED pending Datacenter ownership and migration parity |
| #377 | Open, Draft | Core API Worker, UI, tests, CircleCI and config | CONSOLIDATION REVIEW with #373; not safe to select by title |
| #373 | Open, Draft | Same Core API Worker paths plus Supabase migrations, schema repair docs and CI | CONSOLIDATION REVIEW with #377; unique migration/security changes require preservation |
| #66 | Open, Draft | Wave3 strategy, datasets, models, reports, workflows and tests | KEEP ISOLATED research benchmark; no merge into #147 |
| #147 | Open, Draft | Separate challenger research package, labels, manifests and tests | KEEP ISOLATED challenger; no merge into #66 |
| #238 | Open, Draft | XAUUSDm H1 CSV, manifest, validator, tests and workflow | BLOCKED dataset; preserve 7,419-hour gap and training-ineligible state |

PR metadata and changed filenames were fetched individually for the entries above. PR states are based on fetched PR metadata, not titles or search snippets.

## 4. Stale base evidence

Compared current observed main commit `b05459f0396c8d5108ddca0afc6b547315fec640` against PR base SHAs:
- #389 base `73d8b6bb4fbe31bc8bc19c88129dad1d8e943c3b`: main is 48 commits ahead, 0 behind.
- #377/#373 base `0cceaf5d1d32b4323bcf72f9f26877c6d75886ff`: main is 104 commits ahead, 0 behind.
- #66/#147/#238 base `a6ee15e96fb83f811db676fcafa85565e3280f04`: main is 142 commits ahead, 0 behind.

These comparisons establish stale PR base snapshots; they do **not** establish that the PR heads are safe to merge or that their content is redundant. Each PR must be rebased/reconciled only under its own approved workflow and exact-head validation.

## 5. Existing logical target structure

The current approved target specification is `docs/architecture/COMMAND-CENTER-REPOSITORY-STRUCTURE.md`. It explicitly states that the tree is logical, not authority to relocate code by itself. It requires:
- `apps/nova-command-center/` for the Command Center UI
- `backend/` only for NOVA-owned backend services
- `integrations/remote-mcp-worker/` for the single central Gateway integration
- `integrations/services/` for approved internal-service adapters
- `contracts/` only when mapped to canonical Shared Contracts
- `docs/{architecture,governance,workstreams,runbooks,decisions}/`
- `infra/`, existing `workers/`, categorized `tests/`, `logs/`

The structure document also requires preserving current directories until a migration work order defines parity, dependency updates, rollback and acceptance criteria.

## 6. Initial no-move decisions

| Source / candidate | Decision | Reason |
|---|---|---|
| `integrations/nova-core-api/` | DO NOT MOVE YET | #373/#377 overlap unresolved; migrations and auth/schema differences need a full diff and caller map |
| `integrations/remote-mcp-worker/` | KEEP IN PLACE | Existing single Gateway boundary; do not duplicate or relocate before consumer mapping |
| `integrations/nova-ai-mcp-full-clean/` | PRESERVE / LEGACY REVIEW | Contains research and learning implementation; Datacenter ownership boundary applies |
| `workers/backtest/`, `workers/tuning/`, `workers/quant_engine/`, `workers/feature/` | PRESERVE / BLOCKED | Research/learning ownership and caller parity not proven |
| `datasets/`, `data/market/`, `models/`, `reports/` | PRESERVE | Data provenance, model artifacts and research lineage must not be moved or deleted |
| `supabase/migrations/` | KEEP PATHS | Migration lineage is safety-critical; no relocation without migration ordering and rollback proof |
| `.github/workflows/`, `.circleci/` | KEEP PATHS | CI/deployment side effects and duplicate automation require separate review |

## 7. Remaining Phase 1 work

1. Enumerate the complete repository file tree; current connector search does not expose a direct recursive tree-list operation.
2. Complete PR coverage beyond the 100-result search cap using bounded query batches.
3. Fetch and compare all PRs that touch overlapping paths, including full diffs, commits, reviews and exact-head test evidence.
4. Map current-main imports, callers, workflow references and deployment config for every candidate move.
5. Produce the per-file migration manifest and rollback map before Phase 3/4 moves.

## 8. Phase status

- Phase 0 — Work Order registration and NOVA acknowledgement: DONE (read-back verified).
- Phase 1 — Complete read-only inventory: IN_PROGRESS.
- Phase 2 — PR and branch disposition: NOT STARTED (preliminary findings only).
- Phase 3 — Migration manifest: NOT STARTED.
- Phase 4 — NOVA-internal restructuring: NOT STARTED.
- Phase 5 — Verification: NOT STARTED.
- Phase 6 — Final report: NOT STARTED.

No source tests/builds were run in this inventory phase. No code/data movement, PR merge/closure, branch deletion, deployment, secrets/permissions change, database migration or broker action occurred.

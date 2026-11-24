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


## 9. Expanded inventory snapshot — 2026-11-24 (UTC)

- **Live main HEAD at snapshot:** `0e230b0cd8c73dad5662defb629d3082694d7b6d` (verified from `refs/heads/main` immediately before this update).
- **Recursive tree:** 487 entries; GitHub reported `truncated=false`. This completes the raw path enumeration for this snapshot, but not caller/import/deployment dependency analysis.
- **Branches:** 318 branch names including `main`; four search pages (100 + 100 + 100 + 18). Final cursor `MzE4`; no further page returned.
- **Pull requests:** direct REST pagination of `state=all`, `per_page=100`, pages 1–4 returned 364 PR records (100 + 100 + 100 + 64); page 5 returned 0. Counts: 238 open, 126 closed, 82 merged, 44 closed without merge. Of the open PRs, 220 are Draft and 18 are non-Draft. These counts replace the earlier 100-result search shortlist.
- **Changed-path inspection:** fetched complete paginated filename lists for the following high-risk/overlap PRs: #389, #388, #386, #385, #384, #383, #382, #381, #380, #377, #373, #66, #147 and #238. Full changed-path enumeration for the remaining PRs is still pending; Phase 1 is therefore not complete.
- **Confirmed path-level findings:**
  - #389 and #388 each change exactly the same two files: `docs/architecture/NOVA-MULTI-REPO-COMMAND-CENTER-INTEGRATION-PLAN.md` and `docs/openapi/nova-system-hub-v1.yaml`. #389 is open Draft; #388 is closed/unmerged. This is a strong supersession candidate, not final disposition until unique commits/reviews/comments are reconciled.
  - #373 and #377 both change `integrations/nova-core-api/{README.md,package.json,worker.js,worker.test.mjs,wrangler.toml}`; #373 additionally changes two Supabase migrations, a schema-repair plan, an example env file, a workflow and `tests/secret-vault-readiness.test.mjs`; #377 additionally changes Command Center UI files and CircleCI/GitHub workflows. They are not interchangeable duplicates. Preserve both pending full diff, caller, migration-lineage and test comparison.
  - #384 changes the Learning dashboard, existing Remote MCP Worker, tests and a candidate Supabase migration. Its own acceptance gates remain pending; migration is not applied.
  - #383 and #381 change research/learning computation paths; #380 changes backtest/tuning/quant-engine paths. These conflict with the approved Datacenter research ownership boundary and must remain BLOCKED pending a separate cross-repository Work Order and parity evidence.
  - #382 adds a System Hub Worker/API contract and is not itself proof of a replacement or second MCP Gateway; compare its routing/callers with the existing `voom-system-mcp` Gateway before disposition.
  - #385 is architecture documentation; #386 is MCP runtime inventory plus Compose profile change. Keep separate pending review of their distinct scopes and validation.
  - #66 and #147 remain isolated benchmark/challenger workstreams; #238 remains blocked and its dataset/provenance assets must remain untouched.
- **Tracker freshness:** Issue #36 still embeds the old main baseline `0cceaf5d1d32b4323bcf72f9f26877c6d75886ff` and a historical PR/CI list. Treat it as a governance/safety tracker, not a current inventory snapshot, until a new exact-head update is posted.
- **No mutation beyond inventory documentation:** no source, data, model, migration, workflow or runtime files moved or edited; no PR merged/closed; no branch deleted; no deployment, database, secret, permission or broker action.
- **Remaining Phase 1 gates:** enumerate changed paths for all remaining PRs; reconcile PR commits/reviews and exact head/base ancestry; map current-main imports/callers/workflow/deployment references; publish a complete per-directory ownership matrix. Do not start Phase 2 disposition or Phase 3 moves until those evidence gaps are closed.


## 10. PR #388 / #389 duplicate verification — 2026-11-24

- Both PRs are documentation-only and change the same two paths.
- GitHub's PR file API reports identical resulting blob SHAs for both PRs:
  - `docs/architecture/NOVA-MULTI-REPO-COMMAND-CENTER-INTEGRATION-PLAN.md` → `54e447f2c5315c4ce593c405eb2a7936565ba555`
  - `docs/openapi/nova-system-hub-v1.yaml` → `697efaf200051250a0a650fecfd5c4dbe78731ad`
- Full unified diff strings are byte-identical in the fetched PR responses (31,177 characters each).
- PR #388 is closed/unmerged (4 commits); PR #389 is open Draft (2 commits). Their commit SHAs are distinct; there are no shared commits. Both PR comment timelines returned empty.
- **Evidence-based preliminary disposition:** #389 = KEEP / REQUIRED candidate; #388 = SUPERSEDED candidate because its complete resulting file content is identical to the open replacement. No merge, closure, branch deletion or history rewrite is performed. The disposition is recorded for review; no destructive action is authorized.
- This comparison does not establish that PR #389 itself is ready to merge; its architecture/API claims and exact-head validation remain separate gates.


## 11. Current-main dependency and runtime boundary findings — 2026-11-24

- **Main at this verification:** `e1e23cc4a2ebe5b6f7a5369e06f15667d60b5692`.
- **Recursive tree at this SHA:** 488 entries; `truncated=false`. The tree includes root `src/`, root `server.ts`, root `package.json`, `frontend/`, and a separate `apps/nova-command-center/` application.
- **Runtime split confirmed from current-main file reads:** root `package.json` defines Vite/Express scripts and root `tsconfig.json` includes `src`, `server.ts`, and `vite.config.ts`; root `netlify.toml` builds from `.` using `npm run build` and publishes `dist`. The separate `apps/nova-command-center/package.json` defines its own TanStack/Vite, typecheck, lint, test and build scripts; `.github/workflows/nova-command-center-ci.yml` runs from that directory.
- **Potential deployment configuration inconsistency — BLOCKED, do not repair under WO-004:** current tree contains no `frontend/package.json` or `frontend/package-lock.json` (direct fetch returned 404), while `.github/workflows/cloudflare-deploy.yml` specifies `working-directory: frontend`, `npm ci`, and `frontend/package-lock.json`. This workflow is deployment-affecting and WO-004 excludes workflow changes. Record for a separately scoped CI/deployment audit; do not move application files to make the workflow pass by guesswork.
- **Legacy test coupling:** root tests read root `server.ts`, root `src/components/*`, `integrations/remote-mcp-worker/`, and MT5 paths directly. These references block moving root source/server paths without rewriting tests and preserving runtime parity.
- **Gateway/control-plane distinction:** `integrations/remote-mcp-worker/README.md` identifies `voom-system-mcp` as the single stateless tools-only MCP Gateway and Datacenter route. `integrations/system-hub/README.md` identifies `voom-system-hub` as the authenticated control plane for user-owned connections and read-only MT5 routes. These are separate roles; neither should be moved or collapsed based on name similarity.
- **Core API overlap:** PR #373 changes `integrations/nova-core-api/` source, two Supabase migrations and schema-repair documentation. PR #377 changes the same Core API Worker files plus Command Center UI and CI. No current-main `integrations/nova-core-api/` path is present in the 488-entry tree; these are PR-only candidates, not current production modules. Preserve both until full PR review and migration/caller proof.
- **Migration manifest:** `docs/governance/WO-004-MIGRATION-MANIFEST.md` revision 0.1 records M-001..M-014 and a zero-move set. It is preliminary, not a blanket move approval.
- **PR changed-path coverage in this pass:** full first-page filename lists fetched for #389, #387, #386, #385, #384, #383, #382, #381, #380, #377, #376, #375, #374, #373, #372, #371, #370, #368, #367 and #366. This supplements the earlier list for #388, #66, #147 and #238. All remaining PRs still require changed-path/commit/review reconciliation.
- **Search limitation:** GitHub code search returned snippets anchored to older commit `b05459f...`; those snippets were not treated as current-main evidence. Current-main file reads and the recursive tree were used for the findings above.
- **Disposition:** no code, data, model, migration, test, workflow or runtime files moved or modified. The potential deployment workflow inconsistency is recorded only; no workflow run or deployment was triggered.

## 12. Migration manifest and next gates

- Preliminary manifest revision 0.1 was created at `docs/governance/WO-004-MIGRATION-MANIFEST.md` (commit `e1e23cc4a2ebe5b6f7a5369e06f15667d60b5692`).
- Manifest decision: zero moves approved; all candidate paths remain in place pending ownership, caller, workflow, deployment and rollback evidence.
- Phase 1 remains IN_PROGRESS because changed paths for all PRs and full dependency/reference mapping are not complete.
- Phase 2 remains IN_PROGRESS (preliminary dispositions only).
- Phase 3 is PRELIMINARY / BLOCKED pending an exact, unambiguous move set and validation/rollback evidence.

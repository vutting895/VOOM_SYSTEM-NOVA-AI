# WO-2026-11-24-004 — Migration Manifest (Revision 0.1)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Branch: `main`
- Work Order: `WO-2026-11-24-004` (central status: APPROVED)
- Manifest status: **PRELIMINARY — NO FILE MOVES APPROVED**
- Current main observed before manifest creation: `95d788b31b6fd031f2cd8f1c3c493ee05601c851`
- Tree snapshot verified at `213b59a701f5c1b2d4f5fab542334ed91f70a978`: 487 entries, recursive tree `truncated=false`. The intervening commit changed only `logs/OPERATIONS.md`.
- Scope: NOVA-internal only. Datacenter research/learning computation and authoritative lineage are explicitly excluded.

## 1. Decision

The migration set is **empty** in revision 0.1. This is a deliberate safety decision, not a claim that the repository needs no restructuring.

The target structure in `docs/architecture/COMMAND-CENTER-REPOSITORY-STRUCTURE.md` is explicitly logical and does not itself authorize relocation. Current evidence does not yet prove complete imports/callers, workflow references, runtime deployment paths, or rollback parity for any source-code move. Therefore every candidate below is preserved in place.

## 2. Candidate manifest

| ID | Current source | Proposed destination | Owner / role | References and dependencies known so far | Decision | Required evidence before reconsideration |
|---|---|---|---|---|---|---|
| M-001 | `frontend/`, root `index.html`, root `package.json` | No move; retain current paths | Ownership/runtime split not yet proven | Root package defines Vite/Express scripts; hosting/build references not fully mapped | BLOCKED | Enumerate all build/deploy configs, imports, lockfiles, Netlify base/publish settings and runtime entrypoints |
| M-002 | `apps/nova-command-center/` | No move; retain current path | NOVA Command Center UI | Independent package with Vite/TanStack, Vitest, TypeScript and build scripts | KEEP IN PLACE | Confirm all workflows and deployment config target this app and not the root frontend |
| M-003 | `integrations/remote-mcp-worker/` | No move; retain current path | Canonical single NOVA MCP Gateway | README identifies `voom-system-mcp`; Datacenter Learning tools use this Gateway | KEEP IN PLACE | Complete caller/config/workflow map; do not create a second Gateway |
| M-004 | `integrations/system-hub/` | No move; retain current path | Authenticated control-plane Worker | README identifies `voom-system-hub`; broker registry and tenant-scoped read-only path | KEEP IN PLACE | Map all frontend and Worker callers, routes, deployment bindings and tests |
| M-005 | `integrations/nova-core-api/` (PR #373/#377 candidates) | No move; retain current path | Proposed Core API; final owner boundary not settled | #373 adds two Supabase migrations and schema-repair docs; #377 adds Command Center UI/deployment/CI files; both overlap on Worker source/package/tests/config | BLOCKED | Compare full patches, ancestry, migrations, schema effects, callers, auth semantics, tests and rollback. They are not interchangeable duplicates |
| M-006 | `integrations/nova-ai-mcp-full-clean/` | No move; retain as legacy/prototype pending disposition | Contains Python MCP and research/learning prototypes | PR #383 and #380 touch research/learning paths; Datacenter owns authoritative computation | BLOCKED / PRESERVE | No transfer under WO-004. Separate cross-repository Work Order required for any research migration |
| M-007 | `workers/backtest/`, `workers/tuning/`, `workers/quant_engine/`, `backend/quant_engine.py` | No move | Research/learning computation or legacy candidates | PR #380/#381 and EA strategy PRs touch these paths | BLOCKED / PRESERVE | Confirm Datacenter replacement, lineage, parity, callers and rollback under separate approved Work Order |
| M-008 | `datasets/`, `data/`, `models/`, `reports/`, notebooks and artifacts | No move | Data/model/research lineage; owner varies and must be proven | PR #66/#147 isolated; PR #238 blocked dataset provenance | KEEP / PRESERVE | Preserve hashes, manifests, OOS boundaries and provenance; no synthetic gap filling |
| M-009 | `supabase/migrations/` and nested app migrations | No move | Database schema/migration lineage | PR #373/#376 and #384 introduce candidate migrations; production/staging baselines are safety-critical | BLOCKED | Establish exact applied ledger, ordering, target project, backup/restore, RLS/grants, clean replay and rollback; no DB mutation under WO-004 |
| M-010 | `.github/workflows/`, `.circleci/` | No move or workflow change | CI/deployment automation | Multiple open CI proposals (#363–#365, #377, #380–#383); existing manual gates | BLOCKED | Map triggers, runner evidence, deploy side effects, duplicate jobs and owner-approved execution budget |
| M-011 | `docs/` flat root and subfolders | No move in this revision | Documentation | Existing architecture, governance and workstream taxonomy is present | REVIEW | Build inbound Markdown links, OpenAPI links, workflow references and external URLs before moving individual docs |
| M-012 | `tests/`, app-local tests and integration tests | No move | QA/test ownership follows code owner | Tests are distributed across root, app and integration folders | REVIEW | Map test discovery/configuration, CI working directories, fixtures and import roots before any test relocation |
| M-013 | `integrations/mt5-*`, `integrations/mt5/` | No move | NOVA-owned read-only broker adapter/Bridge boundaries | Multiple active PRs touch relay, proxy, Bridge and EA paths | KEEP IN PLACE | Preserve Demo/read-only constraints; prove route/tenant isolation and deployment bindings before any restructuring |
| M-014 | `artifacts/meta-ai-nova-mcp-all-workers/` | No move | Imported artifact/prototype; exact ownership and active callers uncertain | Manifest and upload instructions exist; no active-runtime proof yet | BLOCKED / ARCHIVE REVIEW | Verify provenance, consumers, hashes and whether any workflow references the artifact before archive/move |

## 3. PR evidence and preliminary disposition

The live REST inventory returned 364 PRs across four pages: 238 open, 126 closed; 82 merged and 44 closed without merge. The 318-branch inventory was paginated through its final page.

Full changed-filename lists were fetched in this pass for open PRs:
#389, #387, #386, #385, #384, #383, #382, #381, #380, #377, #376, #375, #374, #373, #372, #371, #370, #368, #367 and #366.

Preliminary findings:
- #389 remains a KEEP candidate. #388 is closed/unmerged and a SUPERSEDED candidate; a prior operation log records identical two-file diffs and identical resulting blobs. No PR state change is authorized here.
- #373 and #377 are overlapping Core API candidates, not proven duplicates. Preserve their distinct migration, UI and CI changes.
- #384 extends the existing Remote MCP Gateway but includes new UI, Worker code, tests and a Supabase migration; it is not approved by this manifest.
- #382 proposes a System Hub Worker/contract; verify it does not duplicate existing Gateway/control-plane responsibilities.
- #380, #381 and #383 touch research/learning computation paths and are BLOCKED by the Datacenter ownership boundary.
- #66 and #147 remain isolated benchmark/challenger workstreams.
- #238 remains blocked; preserve the 7,419-hour gap and provenance evidence.
- #376/#375 touch tenant isolation and database migration paths; preserve pending staging, schema, RLS and rollback proof.
- #372/#367/#366 touch MT5 EA/strategy and safety files; do not move or weaken read-only controls.

This is not a complete per-file disposition for all 238 open PRs. The remaining PR changed-path lists, closed/merged PR reconciliation and review/commit evidence are still outstanding.

## 4. Global no-move / rollback rules

1. Do not move, delete, overwrite or rename any source, data, model, migration, workflow or runtime file in revision 0.1.
2. Do not merge/close PRs or delete/rename branches as part of this inventory.
3. Do not transfer research/learning code or data to/from Datacenter under this Work Order.
4. Keep `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.
5. Keep production deployment paused; no secrets, permissions, hosted DB, paid resources or broker state may be changed.
6. If a future approved revision lists a move, rollback means restoring the exact source path/content and reversing only the associated reference/config changes, with before/after tree hashes and tests. No move may start without an independently reviewable rollback plan.

## 5. Phase status

- Phase 0 — registration/acknowledgement: DONE (prior read-back evidence).
- Phase 1 — complete inventory: IN PROGRESS. Tree, branch and PR metadata enumeration completed; complete changed paths for all PRs and full dependency/caller/workflow mapping remain incomplete.
- Phase 2 — PR/branch disposition: IN PROGRESS (preliminary only; no destructive actions).
- Phase 3 — migration manifest: PRELIMINARY / BLOCKED. This document records a zero-move candidate set; no file move is approved by revision 0.1.
- Phase 4 — restructuring: NOT STARTED.
- Phase 5 — verification: NOT STARTED.
- Phase 6 — final report: NOT STARTED.

## 6. Next actions

1. Complete changed-path coverage and classify all open PRs; then reconcile merged/closed PRs that overlap current paths.
2. Map imports/callers, config, deployment and workflow references for M-001 through M-014.
3. Reconcile PR #373/#377 and Gateway/control-plane overlap candidates with exact diff and test evidence.
4. Publish manifest revision 0.2 only when at least one exact move has unambiguous NOVA ownership, verified dependency parity, test plan and rollback.
5. Keep all paths in place until then.

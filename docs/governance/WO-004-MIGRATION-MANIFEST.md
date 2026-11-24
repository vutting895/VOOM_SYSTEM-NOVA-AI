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


## 7. Additional PR changed-path evidence — second and third batches

Additional full first-page changed-filename lists were fetched for open PRs #365, #364, #363, #362, #358, #357, #356, #355, #354, #352, #351, #350, #349, #348, #347, #346, #345, #344, #341, #340, #339, #338, #337, #336, #335, #334, #333, #332, #331, #329, #327, #326, #324, #322, #321, #319, #318, #317, #316, #315, #314, #313, #312, #311, #310, #309, #308, #307, #306, #305, #304, #303, #302, #301, #300, #299, #298, #297, #296 and #295.

Notable path-level findings:
- **CircleCI overlap:** #363, #364 and #365 all touch `.circleci/config.yml`; #363 also adds app-local test-suite configuration. Do not merge configurations by title; compare complete YAML, orb/context/runner assumptions and path filters. CI/automation mutation is outside WO-004.
- **Root app vs Command Center:** #358 and #352 touch broad overlapping Command Center/root frontend and backend paths, but #352 includes root `server.ts`, root `src/`, System Hub and a database migration while #358 is largely the isolated app and a new AI Worker. They are not interchangeable. Preserve until exact behavior/caller/auth parity is proven.
- **Command Center UX:** #357 touches app-local package/lockfile, routes, styles and Netlify config. It remains a candidate independent of root Netlify build configuration; no deployment or path move authorized.
- **Auth isolation:** #355/#356 change root auth, API clients, AI chat and Worker/runtime code. Security-sensitive; keep blocked from structural moves until exact diff, RLS/tenant tests and current-head CI are reviewed.
- **Manual release policy:** #351 changes multiple existing workflow files and proposes a no-CI release policy. Workflow changes are excluded by WO-004; preserve for separate CI governance review.
- **Research/learning ownership:** #348, #350, #341, #340, #344, #306, #305, #302, #301, #300, #319 and #312 touch training, datasets, quant engine, strategy or research infrastructure. These remain blocked from relocation/consolidation under Datacenter's ownership boundary unless they are proven NOVA-only adapters or governance docs; no transfer is authorized.
- **Data lineage:** #340 introduces raw/normalized/approved/external data directories and source manifests; #341 introduces catalog/schema and ingestion/R2 components. Preserve provenance, hashes and source metadata; no data movement or synthetic backfill.
- **Trading execution boundaries:** #334 and #336 introduce hard-disabled/isolated Demo execution design/API paths; #322 adds an MT5 Decision API and bridge/risk integration; #307/#302/#297 affect execution/position lifecycle and capacity. These are safety-sensitive and outside structural migration until separately reviewed and authorized. Keep broker writes disabled.
- **Broker bridge:** #362/#309/#298/#307 touch tenant relay/proxy/bridge behavior. Preserve existing tenant isolation and GET/read-only contract; no relocation.
- **Backups/release evidence:** #303 adds PDI backup manifest/runbook/scripts/tests; #326 adds release evidence agent; #349 adds agent skills. Preserve their audit and provenance content; map CI consumers before any relocation.
- **Single-file or documentation-only proposals:** #338, #317, #311, #299, #346, #370 and similar PRs still require state/base/commit review; a small path count alone does not establish disposition.

This raises the number of open PRs with changed-filename lists inspected in the current and earlier passes, but does not complete the 238-open-PR requirement. Each PR's changed-file endpoint was read at page 1 with `per_page=100`; any PR exceeding 100 changed files would need pagination. Full patch, commits, reviews and exact-head CI are not yet reconciled for all listed PRs.

**Manifest decision remains unchanged:** zero moves approved. No PR merged/closed, branch deleted, workflow modified, deployment triggered, database migrated, or broker action performed.


## 8. Current-head refresh and MT5 schema collision review — 2026-11-24

- Live main at start of this refresh: `760a9bc0eedc36793daf6c447509e815350cc006`.
- Recursive tree: 488 entries; `truncated=false`. Open PR count is now 237 (the prior snapshot recorded 238); previous counts must not be treated as current.
- Current-main path checks: `integrations/mt5-readonly-proxy/` and `integrations/system-hub/` exist; `integrations/nova-core-api/` does not exist on main and remains PR-only.
- New changed-path lists inspected since the prior 84-PR count: #387, #376, #375, #372, #371 and #370. Previously inspected PR lists were rechecked for #384, #383, #382, #381, #380, #386 and #385. The verified distinct-list count is at least 90; this remains incomplete coverage of 237 open PRs.
- **#375/#376 database collision — BLOCKED:** both PRs add migrations that create `nova.mt5_broker_connections` and its owner-scoped RLS policy family, and both update the MT5 proxy to read `public.nova_broker_connections`. #376 additionally includes a second migration for `nova` schema usage grants, staging relay origin allowlisting, redirect rejection and wider validation configuration. #375's migration creates the narrow security-invoker view; #376's migration path also creates the same underlying table/view contract. These migration files are separately timestamped and cannot both be treated as independent additive changes. Reconcile SQL equivalence, migration ordering, current Supabase ledger and branch ancestry before either is selected. Do not apply either migration or assume one safely supersedes the other.
- **#373/#377 Core API remains BLOCKED:** both modify the same new Worker source/package/tests/config; #373 adds two schema migrations and a schema-repair plan; #377 adds app UI and CI changes. Current main still has no `integrations/nova-core-api/` path. No Core API is proven deployed.
- **#387 dependency update:** only changes `apps/nova-command-center/package.json` (Zod 3→4 and Vite 8.1.5→8.1.6); compatibility/build/test evidence is required before adoption.
- **Research boundary:** #372/#371 also touch quant/EA/point-in-time research paths and remain preserve-only / BLOCKED under the Datacenter ownership boundary. #370 is architecture documentation, not implementation proof.
- No source/data/model/migration/workflow/runtime files moved or edited. No PR state changed, no branch deleted, no workflow run/deployment, no database action, and no broker action.
- Manifest decision remains **zero moves approved**. Phase 1 and Phase 2 remain IN_PROGRESS; Phase 3 remains PRELIMINARY / BLOCKED.


## 9. Current-main consumer parity check for MT5 connection schema — 2026-11-24

- Read current-main `integrations/mt5-readonly-proxy/worker.js`: connection lookup still targets `/rest/v1/broker_connections`.
- Read current-main `integrations/system-hub/worker.js`: control-plane connection lookup also targets `/rest/v1/broker_connections`.
- Read current-main `integrations/remote-mcp-worker/README.md`: MT5 tool access contract requires an owner-scoped `broker_connections` row.
- PRs #375/#376 change the MT5 proxy to `/rest/v1/nova_broker_connections` and introduce a separate `nova.mt5_broker_connections` backing table/view. Their changed-path lists do not include the System Hub Worker or Remote MCP Gateway README/source.
- **Consumer parity finding — BLOCKED:** adopting only #375 or #376 would create a split schema contract: proxy uses `nova_broker_connections`, while System Hub and documented MCP Gateway still use `broker_connections`. This is not proof of a runtime outage or production schema state; it is a source-level contract mismatch that requires an explicit compatibility plan and tests across all consumers before migration.
- Current-main source blobs read: proxy Worker `5ae365379a5c255658545a9b058648cac2a8cdc5`; proxy tests `59eadd53e6ed7a07d6d9f7b421680cb8b3366e3f`; System Hub Worker `6d371e4bd619a84fa8d7010309ff517de15bc33e`; Remote MCP README `478a596c0c21f8c6043054ca302f3681022af82c`.
- Required before reconsideration: map all consumers and migration history; decide canonical schema/view; test proxy, System Hub and Remote MCP together; prove owner isolation and read-only behavior; obtain exact-head CI and rollback evidence. No migration or source change is authorized by this finding.

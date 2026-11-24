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


## 10. Live inventory refresh — 2026-11-25 (supersedes older counts)

**Exact source snapshot**
- Canonical branch: `main`
- Main SHA: `9b03eaac5d6a3c20a7192cdf375d2446407f6a30`
- Recursive Git tree SHA equals main; `truncated=false`; 489 tree entries, 374 blobs/files.
- Branch pagination completed in 5 pages: **331 unique branch names**. This supersedes the earlier 318-branch count.
- GitHub REST Pull Requests pagination completed: **242 open + 133 closed = 375 PR records**. This supersedes the older 364-PR snapshot (238 open + 126 closed).
- Root directory counts from the current tree: `apps` 62 entries, `integrations` 72, `workers` 43, `docs` 46, `tests` 32, `.github` 12, `supabase` 6, `infra` 5. Counts include directory entries, not only files.

**Recent PR overlap and disposition refresh**
| PR | Current evidence | WO-004 disposition |
|---|---|---|
| #396 | Open Draft, 14 changed files, base exactly current main. Bounded read-only History API across Bridge, Relay, Proxy and System Hub. PR body records exact-head GitHub Actions run 45452374172 SUCCESS and 27 Bridge/history tests plus Node/Windows checks. Authenticated owner-vs-foreign-tenant Demo E2E not run. | KEEP / REQUIRED CANDIDATE; BLOCKED from merge pending independent security review and tenant-isolation E2E. Existing read-only invariants remain mandatory. |
| #397 | Open Draft, 7 changed files, base exactly current main. Ports MCP syntax, case-sensitive MT5 symbol validation, RiskWorker gate ordering and full Remote MCP Node tests. It changes `datacenter-client.js` but its SMC CI path filters still omit that file. | PREFERRED CONSOLIDATION CANDIDATE over stale #394 and overlapping #400; exact-head CI still pending. Requires the complementary #399 path-filter fix or equivalent. |
| #398 | Open Draft, 3 changed files, base exactly current main. Archives legacy Python MCP behind opt-in `legacy-archive` Compose profile. Compose-specific validation job passed on exact head; overall SMC CI failed on two failures also reported on main. | KEEP / REQUIRED CANDIDATE; no runtime deployment or Docker startup performed. Keep Draft until unrelated baseline failures are dispositioned and full review completes. |
| #399 | Open Draft, 1 workflow file. Adds `integrations/remote-mcp-worker/src/datacenter-client.js` to both SMC CI path filters. The #397 branch changes this source file but omits it from those filters. | KEEP / REQUIRED COMPLEMENT to #397; not a duplicate. Exact-head validation pending. |
| #400 | Open Draft, 2 files, current-main base. Narrow RiskWorker gate-order correction. Branch test file contains **two functions with the same name** `test_risk_pass_requires_authenticated_approval_context`; Python's later definition shadows the earlier test, so the intended test coverage is not preserved. | BLOCKED / DEFECT. Overlaps the RiskWorker/test changes in #397; prefer #397 after exact-head validation. Do not merge #400 as-is. |
| #395 | Open Draft, test-only feature-flag adjustment. Sets `NOVA_APPROVALS_ENABLED=true` in existing approval route tests. | ALTERNATE TEST-ONLY WORKAROUND; likely superseded by #397's runtime gate-order fix and revised tests. Preserve until #397 is validated; no merge/closure. |
| #394 | Open Draft on stale/diverged base `07afb3f...`; earlier exact-head CI success does not validate current main. | SUPERSEDED implementation candidate by current-main port #397; keep history, no merge. |
| #388 / #389 | #388 closed/unmerged; #389 open Draft; both are the two-file multi-repo contract documentation pair. | #388 SUPERSEDED candidate by #389; docs only, not implementation or runtime integration proof. |
| #390 / #391 / #392 / #398 | Earlier Compose archive proposals were closed unmerged; #398 is a clean current-main proposal with focused Compose profile test. | #398 is the current candidate; prior branches are history only. |

**Scope and safety findings**
- The current tree has both root frontend sources (`src/`, root `package.json`, `frontend/`) and a separate `apps/nova-command-center/` application. Their deployment/build ownership is not fully mapped; do not consolidate or move either yet.
- The existing canonical Remote MCP Gateway is `integrations/remote-mcp-worker/`; legacy `integrations/nova-ai-mcp-full-clean/` contains both a Python MCP prototype and research/learning code. PR #398 only isolates the legacy service from default Compose startup; it does not authorize relocating or deleting its source directory.
- Existing System Hub, MT5 Bridge, Relay and Proxy paths are active contract boundaries. PR #396 extends them in place; no directory move is required for this capability.
- PR #373/#377 Core API overlap and #375/#376 MT5 schema migration collision remain blocked as recorded above.
- PR #66 and #147 remain isolated. PR #238 remains training-ineligible with its 7,419-hour gap preserved.
- Complete changed-path lists and exact diff/review/CI reconciliation for every one of the 375 PRs are still not complete. Full repository tree and PR metadata pagination do not equal a completed per-file dependency map.

**Migration decision**
- Manifest revision 0.1 remains **PRELIMINARY — ZERO FILE MOVES APPROVED**.
- No source, docs, tests, migrations, workflows, data, model or artifact files were moved in this refresh.
- No PR merged/closed, no branch deleted, no deployment, DB migration, secret/permission change or broker action occurred.
- Phase 1 remains IN_PROGRESS; Phase 2 remains IN_PROGRESS; Phase 3 remains PRELIMINARY/BLOCKED; Phases 4–6 remain NOT STARTED.

**Next actions**
1. Reconcile #397/#399/#400/#395 with exact-head CI and review; do not merge overlapping variants together.
2. Finish per-PR changed-path coverage for the 375 PRs and map import/caller/workflow/deployment references.
3. Build a per-directory ownership and dependency matrix for the 374 files, with special attention to the dual frontend roots, legacy MCP, System Hub, and database migrations.
4. Revise the manifest only when a specific move has proven NOVA ownership, no unresolved callers, passing tests, and rollback evidence.


## 11. Frontend ownership and deployment-path verification — 2026-11-25

**Evidence read on current main**
- Root `netlify.toml` builds from repository root with `npm run build` and publishes `dist`.
- Root `package.json` defines Vite build; root `vite.config.ts`, `index.html` and `src/main.tsx` are the corresponding React SPA entry/build files. `frontend/README.md` identifies Netlify as the current public production frontend (`https://voomsystem.netlify.app/`).
- `apps/nova-command-center/` is a separate TanStack Start/Vite application with its own package.json, Vite config, UI routes, tests and draft app-local Supabase migration. Its README describes a read-only Command Center; its deployment document describes manual Cloudflare Workers deployment. `.github/workflows/nova-command-center-ci.yml` runs app-local dependency resolution, typecheck, lint, tests and build.
- The current recursive tree contains only these paths under `frontend/`: `README.md`, `scripts/nova-approval-local-supabase.integration.mjs`, `stores/README.md`, and `wix-export.html` (plus directory entries). There is **no** `frontend/package.json`, `frontend/package-lock.json`, or Next.js app source tree.
- However, `.github/workflows/cloudflare-deploy.yml` and `.github/workflows/nova-approval-migration-ci.yml` set `working-directory: frontend`, reference `frontend/package-lock.json`, and run `npm ci`; the Cloudflare workflow also invokes `npm run cf:build`. Those inputs are absent from current main. Treat these workflow paths as **deployment/CI blockers requiring separate workflow remediation**, not as proof that the frontend is deployable.
- `.github/workflows/frontend-ci.yml` builds the root Vite frontend. Its only trigger is `workflow_dispatch`; the downstream Cloudflare deployment workflow listens for completion of this workflow on main. Do not manually trigger or deploy as part of WO-004.
- The Cloudflare deploy workflow checks changes under `frontend/` for the frontend Worker; it does not target `apps/nova-command-center/`. The app has its own CI but no current production deployment evidence in the inspected workflows.

**Correction to Section 10 PR overlap row**
- #397 changes `integrations/remote-mcp-worker/src/datacenter-client.js` and expands MCP tests, but its SMC CI path filters do **not** include `datacenter-client.js`.
- #399 independently adds that exact path to both pull_request and push filters. #399 is therefore **complementary/required**, not a duplicate of #397. The earlier Section 10 wording that treated #399 as duplicate is superseded by this evidence.
- #397 remains the preferred current-main code consolidation candidate over #394/#400. #399 is a separate CI-trigger correction. #400 remains blocked because its test file defines `test_risk_pass_requires_authenticated_approval_context` twice; the later definition shadows the earlier test.

**Migration implications**
- Root Vite SPA, legacy `frontend/` residue, and `apps/nova-command-center/` are three distinct path groups with different build/deploy assumptions. They must not be collapsed or moved as a single "frontend" directory.
- Keep root SPA and Netlify config in place. Keep the app-local Command Center in place until its target hosting and consumer contracts are explicitly selected. Preserve legacy `frontend/` paths until CI references are either corrected under a separate Work Order or proven obsolete.
- No source or workflow files moved/edited. No CI workflow was run, no deployment was triggered, and no secrets or production configuration were changed.


## 11. Command Center API caller and runtime binding audit — 2026-11-25

- Audited exact NOVA main SHA `6114725d5aaee20feeaa73877c67340e5f15fa11`; recursive tree contains 489 entries and is not truncated.
- Command Center API caller chain is confirmed in source:
  - `src/lib/nova/auth.tsx` obtains the current Supabase session and supplies its access token through `setTokenGetter`.
  - `src/lib/nova/api.ts` reads `VITE_NOVA_API_BASE_URL`, sends GET requests with the session bearer token, and provides an unauthenticated health call.
  - `src/components/nova/useApi.ts`, `src/routes/_authenticated/dashboard.tsx`, and `settings.tsx` consume the API client.
  - `.env.example` intentionally leaves `VITE_NOVA_API_BASE_URL` blank. The app therefore remains disconnected by default.
- Current frontend callers require `GET /v1/health`, `/v1/services`, and `/v1/bridge/status`. The documented API contract additionally specifies `/v1/me`, `/v1/bridge/account`, `/v1/risk/policy`, `/v1/approvals`, `/v1/audit`, and `/v1/assistant/status`.
- The frontend's `ALLOWED_API_PATHS` lists these endpoints, but `assertReadOnlyRequest` currently enforces GET and blocks forbidden path patterns; it does **not** enforce membership in the allow-list. This is a client-side guard gap, not a substitute for server authorization. No client write endpoint is present in the inspected API client.
- Existing `integrations/system-hub/` is a distinct authenticated broker-connection control plane: it exposes `/v1/integrations`, `/v1/connections`, and per-connection status/check/account/quotes routes. It does not implement the Command Center service/risk/approval/audit API contract. Do not redirect all Command Center calls to System Hub.
- Existing `integrations/remote-mcp-worker/` is the sole NOVA MCP Gateway (`voom-system-mcp`), exposing `/mcp` and forwarding the user's Supabase bearer session to the configured Datacenter MCP endpoint. It is not a REST replacement for the Command Center API.
- Deployment/configuration evidence:
  - The app-local `VITE_NOVA_API_BASE_URL` is blank in the checked-in example.
  - The app has a dedicated CI workflow, but the inspected Cloudflare deployment workflow targets the legacy `frontend/` directory and the existing System Hub/MCP/MT5 Workers; it does not deploy `integrations/nova-core-api/` or the Command Center app.
  - No NOVA Core API Worker configuration/deployment target exists on current main. PR #377 documents a separate staging Worker, but its README explicitly says it is not connected to Command Center. No production deployment is established by the inspected evidence.
- PR comparison against current main:
  - #373 head `bef349fd9010b39e008b2d2e7960f1e14dff941b`: 18 commits ahead, 134 behind; diverged from merge base `0cceaf5d1d32b4323bcf72f9f26877c6d75886ff`. Its Worker implements the broader documented routes, but several sources remain explicit placeholders/503 (bridge account, risk policy); service and bridge status are static/not verified.
  - #377 head `1835daca108d993ad98bd878a4f02bb1c4d30fd2`: 40 commits ahead, 134 behind; same stale merge base. Its Worker currently implements health and identity only; README explicitly states the other contract routes are not implemented and the staging Worker is not connected to the Command Center.
  - Both branches add the same Core API directory and overlap on Worker/package/tests, but #373 adds two Supabase migrations/schema docs and #377 adds distinct Command Center/CI/deployment changes. They are not interchangeable and neither is merge-ready against current main.
- Preliminary disposition: keep the Command Center REST API boundary as a separate proposed control-plane API only if its authoritative data sources are specified; retain System Hub for broker connections and Remote MCP for MCP/Datacenter. Do not merge either PR wholesale. Port/rebase only after a current-main contract and data-source review.
- Blockers: no verified production API deployment/binding; no authenticated end-to-end Command Center → API test; no current evidence that #373's claimed production migrations match the actual Supabase migration ledger; no authoritative bridge/risk data integration for all contract routes.
- No source code, runtime configuration, database, PR state, deployment, secret, permission, or broker state changed during this audit. Trading remains disabled.


## 12. Repo-first continuation — 2026-11-25

**Canonical main snapshot**
- Re-read live `refs/heads/main` immediately before this update: `7a54b753ea250ab8bd98e36ca89c3a9b35a2e2b2`.
- Since prior audit SHA `6114725d5aaee20feeaa73877c67340e5f15fa11`, main advanced by 12 commits, all limited to governance documentation: Supabase migration reconciliation, Command Center API data-source plan, migration manifest and operations log. No runtime/code paths changed in this 12-commit interval.

**PR status correction**
| PR | Live state | Current comparison / evidence | Disposition |
|---|---|---|---|
| #397 | Open Draft; head `d69d9396420443d43085377ae97431024d55af50`; base main `7a54b753...` | GitHub compare: 1 ahead / 2 behind, diverged from merge base `e7d1f379...`. Exact-head SMC job `45466226126` is still IN_PROGRESS; Supabase Preview is SKIPPED. Latest patch includes #399's missing Datacenter-client path filter and a new `tests/test_approval_guard.py`. Duplicate test-function issue observed earlier on #400 is not present in #397 head's current `tests/test_research_pipeline.py` (only one definition). | Preferred consolidation candidate; do not merge until CI completes, reconcile the two newer docs-only main commits, review approval guard tests and obtain valid/invalid JWT behavior evidence. |
| #399 | Closed, unmerged | PR comment says superseded by #397; #397 now includes the two path-filter additions. | SUPERSEDED by #397; no further action. |
| #400 | Closed, unmerged | Its gate-order change is incorporated in #397; earlier duplicate test definition is not present in #397's current test file. | SUPERSEDED by #397; no further action. |
| #395 | Closed, superseded | PR #397 includes the broader test/runtime gate-order correction. | SUPERSEDED; retain history. |
| #396 | Open Draft; base `9b03eaac...` | 29 ahead / 16 behind current main; diverged from merge base `9b03eaac...`; adds bounded read-only History API across Bridge/Relay/Proxy/Hub. | BLOCKED for merge; rebase/port only after per-file review and tenant-isolation E2E. |
| #398 | Open Draft; base `9b03eaac...` | 5 ahead / 16 behind current main; diverged from merge base `9b03eaac...`; Compose legacy archive profile change. | BLOCKED for merge; preserve until current-main port and Docker default/profile startup validation. |

**Command Center API data-source plan**
- `docs/governance/WO-004-COMMAND-CENTER-API-DATA-SOURCE-PLAN.md` is a documentation-only design artifact. It confirms that Command Center API, System Hub REST control plane, and Remote MCP Gateway are separate boundaries; do not route all Command Center traffic to System Hub or MCP.
- Durable approval source is the repository's `public.nova_approval_requests/public.nova_agent_threads` design, but selected Supabase project `rovhmjeowracayicbqij` currently lacks those public tables while containing `nova.approvals/nova.audit_events`. No migration repair is authorized; project tier/environment and migration provenance remain unresolved.
- Bridge heartbeat, numeric risk-policy source, unified customer-safe audit projection, service probe registry and AI provider aggregate health remain BLOCKED / NOT IDENTIFIED. No static healthy values or inferred connected status.
- The data-source plan does not authorize Core API runtime implementation, schema change, PR merge or deployment.

**Migration decision and phase status**
- Full tree, branch pagination and PR metadata pagination were completed for the prior snapshot; this continuation refreshed live main and priority PR states. Full changed-path/dependency mapping for all 375 PRs remains incomplete.
- No exact source-to-destination candidate has yet passed ownership + caller/import + workflow + tests + rollback acceptance. **Zero file moves remain approved.**
- Phase 0 DONE; Phase 1 IN_PROGRESS; Phase 2 IN_PROGRESS; Phase 3 PRELIMINARY/BLOCKED; Phases 4–6 NOT STARTED.
- No code/data/model/migration/workflow files moved; no PR merged or closed by this operation; no branch deleted; no CI triggered; no deployment, DB, secret, permission or broker state changed.

**Next actions**
1. Wait for exact-head #397 SMC job; then review full check summary and two-commit divergence against main.
2. Complete approval guard test review for valid, invalid, expired and owner-mismatched JWT/RPC cases without enabling approval creation.
3. Keep #396/#398 blocked; reconcile separately against current main.
4. Continue per-file caller/import/workflow mapping and only then prepare any move manifest with rollback evidence.


## PR #397 head refresh — 2026-11-25

- Latest PR #397 head re-read: `f10a7bcc92a3af830fde5f48c7c39d3f951293d1`; base remains `7a54b753ea250ab8bd98e36ca89c3a9b35a2e2b2`; state OPEN / DRAFT; GitHub mergeable=true at this read.
- Compared with current main `d134bb3b220551d296ad92a1d90d1c3c3d62f14d`: 1 ahead / 2 behind, diverged from merge base `7a54b753...`. Do not merge while behind/diverged.
- Current exact-head check run `smc-tests` is still IN_PROGRESS; Supabase Preview is SKIPPED. Earlier success on prior head `3e1db...` does not validate current head `f10a7...`.
- Inspected current #397 head `tests/test_research_pipeline.py`: exactly one definition of `test_risk_pass_requires_authenticated_approval_context`; duplicate-function defect identified in #400 is not present in #397. SMC workflow includes both `datacenter-client.js` and `tests/test_approval_guard.py` in trigger filters.
- Disposition remains: retain #397 as preferred candidate, wait for exact-head CI, review JWT/RPC tests, then reconcile the two docs-only commits on main. No merge, rebase, CI trigger or runtime action performed.

# NOVA Remote MCP Operations Log

Append-only integration history. Timestamps are UTC. Never record bearer tokens, Supabase secrets, Tunnel tokens, or private connection credentials.

## 2026-11-24 — NOVA-DATACENTER-001

- Actor: ChatGPT GitHub integration, acting on the repository owner's instruction to connect Datacenter through the existing NOVA API.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; all implementation writes were made on `main`.
- Datacenter repository: `vutting895/Datacenter`.
- NOVA main SHA before this log entry: `db4173af84dc7505e00bf281b6830e2b92b41250`.
- Changes:
  1. Added `integrations/remote-mcp-worker/src/datacenter-client.js` with fixed HTTPS `DATACENTER_MCP_URL` validation, stateless MCP initialize/notification/tool-call flow, bounded timeout, and forwarding of the signed-in user's existing Supabase Bearer session.
  2. Routed the Datacenter Learning tool group through the existing `voom-system-mcp` Gateway. No second NOVA Gateway or per-worker MCP server was created.
  3. Added `dataset_collect_mt5`, a read-only wrapper over the existing Exness MT5 Demo Bridge. It requests closed candles, excludes the still-forming candle, preserves source order and exact broker symbol casing, builds a typed UTC manifest, and forwards rows to Datacenter ingestion. It never approves the dataset.
  4. Updated tool catalog smoke checks to 41 tools and added Node tests for session forwarding, fixed endpoint rules, stateless MCP initialization, and closed-candle conversion.
  5. Updated the existing Cloudflare deployment workflow to pass the operator-controlled GitHub Actions variable `DATACENTER_MCP_URL` to the existing Worker when configured. The deployment smoke check verifies an unauthenticated Datacenter endpoint returns 401 when the variable is configured.
- Key code commits:
  - Client scaffold: `b4200552e8f78d96839818c0ce47b31b801f21b0`
  - Gateway tool routing: `f6b3ce221c975dcde716086886f52f532b7c4c4c`
  - MT5 ingestion adapter: `4b92e7f1b77a25bca8faf97866a79b7e90be6c39`
  - Latest Worker code/config commit before this log: `db4173af84dc7505e00bf281b6830e2b92b41250`
- Security invariants:
  - No caller-controlled upstream URL, owner ID, or tenant ID.
  - Original signed-in user session is forwarded and independently verified by Datacenter.
  - No Supabase service-role key or new shared service token.
  - MT5 source remains Demo/read-only; no order, position, withdrawal, transfer, or execution capability.
  - Missing Datacenter endpoint fails closed; no mock or local fallback.
- Validation: tests were added but the consolidated test run is deferred by owner instruction until the Datacenter host endpoint is provisioned and configured. No test PASS or production connection is claimed.
- Deployment state: Oracle Cloud VM and Cloudflare Tunnel hostname are not yet provisioned; `DATACENTER_MCP_URL` is not yet recorded as configured.
- Outcome: IN PROGRESS — code-level Gateway integration committed; hosted endpoint configuration and one final combined test run remain pending.


## NOVA-DATACENTER-001 — release-gate addendum

- Latest NOVA main SHA: `b502cd559967deb9a891950f0dbdae09e9860f18`.
- `Frontend CI` is now manual-dispatch only so the Remote MCP integration suite is run once after Datacenter is ready.
- The Cloudflare deployment workflow will not deploy the Remote MCP Worker until the GitHub Actions variable `DATACENTER_MCP_URL` is set to the fixed HTTPS Datacenter `/mcp` endpoint.
- When the endpoint is configured, the deployment workflow installs Wrangler and deploys the latest Remote MCP Worker regardless of whether the endpoint variable was added after the code commits. It then checks the 41-tool catalog, read-only safety, and unauthenticated rejection.
- When the endpoint is absent, Remote MCP deployment and its release smoke checks are skipped; existing Cloudflare worker safety checks remain separate.
- No Datacenter endpoint has been provisioned or recorded. No authenticated Gateway-to-Datacenter call or final test PASS is claimed.
- Outcome: IN PROGRESS — integration code and release gating are ready; host provisioning, endpoint configuration, and one consolidated validation remain pending.


## NOVA-DATACENTER-001 — final release-health addendum

- Current NOVA main SHA: `1125edbd8441f492bee8156d6b5a60c5decee032`.
- Remote MCP `/health` now exposes `learningServiceConfigured` without revealing the endpoint value.
- The Cloudflare deployment smoke check requires `learningServiceConfigured=true`, the 41-tool catalog, and read-only trading flags when the Datacenter URL is configured.
- Remote MCP deployment and its smoke checks remain skipped until the fixed Datacenter endpoint variable is present.
- Both relevant CI workflows remain manual-dispatch only. No tests were run.
- Outcome: IN PROGRESS — release gating is ready; Datacenter host provisioning, endpoint configuration, and one final consolidated test remain pending.


## OP-20261124-007 — Datacenter research/backtest Gateway integration

- NOVA main baseline at start: `4cc59e0c8f6c9b9404ec21e7388d05eec6fd7018`.
- Extended the existing `datacenter-client.js` catalog with `backtest_run`, `research_run_get`, and `research_run_list`.
- All three tools route through the existing `isDatacenterTool` → `callDatacenterTool` path and forward the authenticated user's existing Supabase Bearer session to the configured fixed Datacenter `/mcp` endpoint.
- Updated Gateway catalog tests and README to describe the new research tools and their limitations.
- The tool catalog exposes only the implemented `backtest` run type; walk-forward is not advertised until implemented.
- No direct browser-to-Datacenter API, no second MCP server, no environment variable/secret changes, no Worker deployment.
- Tests updated but not executed; final consolidated test gate remains pending.
- Outcome: IN PROGRESS. Next: implement Datacenter walk-forward orchestration and then replace NOVA frontend legacy Backtest service only after parity.


## OP-20261124-008 — Walk-forward replay tool wired through NOVA Gateway

- NOVA main baseline at start: `3cbe3db8de39fbf95f167e370afd81a95370b916`.
- Added `walk_forward_replay` to the Datacenter tool catalog and argument schema, including explicit train-context, purge-gap, test-window, and step controls.
- Extended `research_run_list` run-type filter to include `walk_forward`.
- Updated tool catalog tests and README.
- Scope qualification retained in tool description: evaluation-only replay of precomputed signals; it does not refit/retrain models per fold.
- All calls route through existing NOVA Remote MCP Gateway and fixed Datacenter `/mcp` client path. No new MCP service, no browser-direct endpoint, no deployment.
- Tests updated but not run pending the one consolidated test gate.
- Outcome: IN PROGRESS. Next: replace NOVA Backtest frontend service with typed Gateway calls after inspecting current UI expectations and implementing result/history parity.


## OP-20261124-009 — Frontend Learning, Intelligence, and Backtest cutover

- NOVA main baseline at start: `2b65f8975983e0ea161ae7b28a7d36265a94165d`.
- Frontend Gateway integration:
  - Added `src/api/mcpClient.ts` to call the existing NOVA Remote MCP Worker using the current Supabase session from `getSupabaseClient().auth.getSession()`. The access token is not copied to local storage or accepted from user input.
  - Added `src/services/datacenterResearchService.ts` for datasets, universes, models, training jobs, research runs, backtest and walk-forward replay.
  - Replaced Learning Dashboard with Datacenter Dataset/Universe/Model Registry views and explicit training submission/status/log access.
  - Replaced Trading Intelligence mock cards with persisted Datacenter model records only.
  - Replaced Backtest Simulator with approved dataset/version selection, explicit signal column, transaction cost controls, backtest/walk-forward replay, and Datacenter research history.
- Legacy service ownership:
  - `modelService.ts` now delegates to Datacenter.
  - `backtestService.ts` now delegates to Datacenter; removed Firebase/Firestore duplicate backtest persistence.
  - Removed legacy Intelligence/Learning/Backtest/Auto-Train methods from `src/api/apiClient.ts`.
  - Removed unverified symbol-only Auto-Train UI triggers from Chat and Settings; the Settings panel now explains the approved Dataset + pinned Universe requirement.
  - Removed inactive hard-coded Kaggle status/quota/session scaffolding and unused API methods from the frontend.
- Local server legacy routes now return HTTP 410 with explicit replacement tools for `/api/intelligence/models`, `/api/backtest/run`, `/api/learning/universe`, and symbol-only `/api/auto-train/*`.
- Updated frontend tests, read-only guard tests, sync documentation, service exports, and Cloudflare deploy health assertion to the current tool catalog count of 45. No deployment was triggered.
- Static review correction: preserved the truthful `trainingUnavailable` health payload after retiring the old Auto-Train routes.
- Tests and typecheck/build were NOT run. The Datacenter endpoint, CORS, browser auth, and full Gateway → Datacenter call are not yet verified.
- No broker write capabilities were added. No production deployment or secrets were changed.
- Outcome: IN PROGRESS. Next: run static typecheck and source review when the migration slice is complete; then implement actual model walk-forward refit and remaining ML runtimes before one consolidated validation pass.


## OP-20261124-010 — Expose Datacenter XGBoost training option

- Learning Dashboard model-family choices now include XGBoost for classification and regression, matching Datacenter's newly added bounded CPU runtime.
- No model has been trained or evaluated as part of this code change; no accuracy or performance result is claimed.
- Training still requires a pinned approved Dataset and registered Universe. Model artifacts remain pending human approval and cannot enable trading.
- Tests/build not run; deployment remains paused.


## OP-20261124-011 — Browser MCP transport and XGBoost UI alignment

- Fixed the frontend MCP client to use the existing Worker's supported legacy transport consistently: initialize body carries protocol version, while notifications and tool calls do not send the modern `MCP-Protocol-Version` header. This avoids the Worker's modern-transport header requirements and keeps the existing Gateway path.
- Frontend now preserves tool-level validation error text instead of replacing every error with a generic message.
- Added a static contract test for Supabase session use, Bearer header, Gateway endpoint, and absence of local token storage or modern transport headers.
- Updated Learning Dashboard to offer XGBoost for classification and regression, matching Datacenter runtime.
- Updated sync documentation: XGBoost is supported; PyTorch/LSTM and other advanced families remain pending.
- No browser-to-Datacenter direct call, no second MCP server, no deployment, no secret changes.
- Tests and build remain unexecuted pending consolidated validation.
- Outcome: IN PROGRESS. Next: finish source review, then assess PyTorch/LSTM runtime and remaining model families.


## OP-20261124-012 — Gateway client source correction and release gate audit

- Repo-first main verification before this log update: NOVA `6928f7bef74ada4dd3a91fbdc681572e74918af4`; Datacenter `6d4aa1c0548c38048cdce20e718ceed8304c4f00`.
- Source review found an invalid Python-style triple-quoted module header at the top of `integrations/remote-mcp-worker/src/datacenter-client.js`. Replaced it with a valid JavaScript line comment in commit `6928f7bef74ada4dd3a91fbdc681572e74918af4`.
- Confirmed the Worker still validates a fixed HTTPS `/mcp` URL, forwards the authenticated Supabase session, and does not accept a caller-controlled upstream URL or tenant identity.
- The Datacenter host/Tunnel remains unprovisioned and no `DATACENTER_MCP_URL` is verified. The existing Worker must not be deployed with a guessed endpoint.
- Frontend CI is manual-dispatch only; no workflow-dispatch action is available in the connected GitHub operation surface. The connected Windows execution device has no authorized repository workspace directories. Therefore no current-main build/test PASS is claimed.
- An earlier SMC Research CI run on pre-current NOVA SHA `c7a5a45c332b6a4b6864f9091f40abbc1aaff153` failed in two unrelated legacy `tests/test_research_pipeline.py` cases because `/v1/risk/approval` returned HTTP 503 instead of the tests' expected 200/401. That stale run is not evidence about the current Datacenter integration and must not be represented as its test result.
- No deployment, secret update, or broker capability change was made. Live Trading and order submission remain disabled.
- Outcome: IN PROGRESS — the source syntax defect is corrected; the final consolidated validation and hosted Gateway → Datacenter proof remain BLOCKED on authorized execution/host configuration.


## 2026-11-24 — WO-2026-11-24-001 Phase 3 local governance instructions

- Timestamp: 2026-11-24 16:00 UTC.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Main SHA before instruction write: `f63abff9bb609ba306af2b07ca5701bc6c831230`.
- Added `WORK_ORDER_INSTRUCTIONS.md` linking the central registry and Issue #36, requiring current-main/PR evidence review, append-only operation logs, Datacenter-only research ownership, and existing Gateway use.
- Explicitly preserved Demo/read-only trading flags and prohibited production deployment, live execution, and Oracle Cloud VM provisioning under this Work Order.
- Commit: `6f5557998a4f6d823a44e55f351bbc5d74ec3c7f`; blob: `9443657c912c16c13854b0b69c1eeb5233feb810`.
- Read-back: PASS; file fetched from `main` and Work Order ID verified.
- Tracker finding: Issue #36 embeds a 2026-11-23 main baseline and stale historical CI snapshots; re-check current main and PR heads before relying on them.
- Tests: documentation-only change; no code tests run or claimed.
- Outcome: DONE for local instruction installation; overall Phase 3 remains REVIEW_REQUIRED pending unresolved repository-boundary classification.
- Next: inspect existing CI/agent enforcement without creating duplicate automation.


## 2026-11-24 — WO-2026-11-24-002 reporting scope rollout

- Work Order: `WO-2026-11-24-002`; policy: `REPORTING-SCOPE-001`.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Action: appended repository-local reporting scope to `WORK_ORDER_INSTRUCTIONS.md`.
- Rule: NOVA-local reports cover NOVA's own work only; cross-repository reporting is reserved for central governance and must keep repository evidence/status separate.
- Commit: `ac4bb160439ed5118b2bb5b03eb6320c8dac6993`.
- Validation: instruction write succeeded; read-back verification pending. Documentation-only change; no source tests or deployment performed.
- Next: read back the instruction and complete the other approved repository rollouts.


### Read-back verification — WO-2026-11-24-002

- Verified `WORK_ORDER_INSTRUCTIONS.md` on `main`; blob SHA: `f5b1c5ba43a5fcebc381044a1db6ad82f503943b`.
- Verified this operation record on `main`; blob SHA: `e59ca7f6929edbf717946a70d9ed6c8c6ccc55bb`.
- Result: PASS for documentation presence and policy/work-order reference. Source tests not applicable; no runtime behavior or deployment claimed.


## 2026-11-24 — WO-2026-11-24-003 target architecture documentation

- Timestamp: 2026-11-24 16:30 UTC.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Main SHA before this documentation phase: `c8f27a67455630e6a797ab97318d8a0570d1ff2b`.
- Central registry: `vutting895/voom-shared-contracts`; Work Order `WO-2026-11-24-003` approved and recorded in `work-orders/WO-2026-11-24-003-voom-target-architecture.md`; registry Work Order commit `3b5a6866691feb582efcc4a79bf9ecfd8803caf4`.
- Added:
  - `docs/architecture/VOOM-ECOSYSTEM-TARGET-ARCHITECTURE.md` — commit `ba08e070311ecbae892229765c1944c758bd47c6`.
  - `docs/governance/REPOSITORY-OWNERSHIP-MATRIX.md` — commit `fcf8bfe975fa80713ce80654404264cd346bdc33`.
  - `docs/architecture/COMMAND-CENTER-REPOSITORY-STRUCTURE.md` — commit `d9c730952ac26c9660da9ee320e81a12e2d58e50`.
  - `docs/workstreams/README.md` — commit `03590218ff00ea8ccf03449153887ed6a422bd88`.
  - `docs/workstreams/security-identity/README.md` — commit `1ce212c8a52beaac38f42abd27bdfe89a186e313`.
  - `docs/workstreams/infrastructure-devops/README.md` — commit `3e3fbba4136aa08c532dea10d382488e2c7a50e6`.
  - `docs/workstreams/knowledge-center/README.md` — commit `f2191596817433e0e4e5882b7f0710d49579593e`.
  - `docs/workstreams/qa-testing/README.md` — commit `a0cfd769d65af527e6d2fa8b3f342373c43f3c82`.
- Updated `WORK_ORDER_INSTRUCTIONS.md` to reference WO-2026-11-24-003 and require repository-identifying reports; commit `259de1880a5b68e4c3150d4346968201e7648a50`.
- Scope: documentation and logical structure only. No source code moved, no runtime/API behavior changed, no workflows/secrets/permissions modified, no deployment, and no broker action.
- Checks: GitHub file writes succeeded. Read-back verification and final main SHA check are pending. No source tests/builds were run or claimed; documentation-only changes.
- Status: IN_PROGRESS pending read-back verification.
- Next: verify all added files and local instructions from main; append final read-back evidence; update central registry changelog and NOVA tracker reference.


### Read-back verification — WO-2026-11-24-003

- Timestamp: 2026-11-24 16:42 UTC.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Verified all eight documentation files by fetching them again from `main`; all returned successfully and contained the expected architecture/workstream content.
- Verified `WORK_ORDER_INSTRUCTIONS.md` includes WO-2026-11-24-003 and per-repository reporting fields.
- Verified this operation log contains the implementation record.
- Main SHA at verification: `05e9f1eec782b7e44ca22849dcbf55272c93387e` (before this read-back record).
- Result: PASS for documentation presence/read-back. No source tests/builds were run because no source code changed. No migration, deployment, secret/permission change, or broker action occurred.
- Outcome: DONE for documentation phases 1–3; Phase 4 remains IN_PROGRESS for repository ownership/dependency mapping and follow-up work-order planning.


## 2026-11-24 — WO-2026-11-24-004 registration and acknowledgement

- Timestamp: 2026-11-24 (UTC; exact execution time not supplied by GitHub connector).
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Work Order: `WO-2026-11-24-004`; central status: APPROVED.
- Central registry: `vutting895/voom-shared-contracts`; Work Order file commit `de57a0b4aa3514d2187c3453ffa1d22047187104`.
- Action: added the WO-004 mandatory read-before-work instruction, inventory requirements, PR disposition categories, Datacenter ownership boundary, research PR isolation, dataset preservation, logging requirements and safety constraints to `WORK_ORDER_INSTRUCTIONS.md`.
- Instruction update commit: `36aadbf4f3ca488e65137ab204435972b9a2d753`.
- Baseline operations log blob read before append: `25da4628e9736c2e45ef257b02e4a6d14ae7000c`.
- Status: Phase 0 NOVA local acknowledgement recorded; read-back verification pending.
- Checks: documentation write accepted by GitHub; no code tests/builds run or claimed. No source/data movement, PR merge/closure, branch deletion, deployment, secret/permission change, database change or broker action.
- Next: read back central Work Order, NOVA instructions and this log; then begin Phase 1 complete read-only inventory.


## 2026-11-24 — WO-2026-11-24-004 Phase 1 initial inventory

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Observed main HEAD before inventory record: `b05459f0396c8d5108ddca0afc6b547315fec640`.
- Inventory artifact: `docs/governance/WO-004-INITIAL-REPOSITORY-INVENTORY.md`.
- Inventory artifact commit: `023a7a0263f36d24ced2d7abbcb81aa492d115aa`.
- Branch inventory: four pages, 318 discovered branch names including main; pagination reached final cursor `MzE4`. No branch was deleted, renamed, merged or rewritten.
- PR inventory: repository-scoped search returned 100 entries (configured cap); this is not complete PR enumeration. Individually fetched PR metadata and changed paths for #389, #388, #387, #386, #385, #384, #383, #382, #381, #380, #377, #373, #66, #147 and #238.
- Confirmed key findings: #389 open Draft and #388 closed/unmerged share the same two documentation paths; #373/#377 overlap at `integrations/nova-core-api/` but differ in schema migrations and other unique files; #66/#147 remain separate research workstreams; #238 remains blocked with a historical coverage gap; #383/#380/#381 touch research paths that conflict with Datacenter's canonical ownership.
- Stale-base comparisons against observed main: #389 base is 48 commits behind; #373/#377 base is 104 commits behind; #66/#147/#238 base is 142 commits behind. This does not establish mergeability or redundancy.
- No-move decision: no code/data paths moved because complete tree/caller inventory and per-file migration manifest are not yet available. Preserve research, datasets, models, reports, migrations, workflows and Gateway paths.
- Checks: GitHub branch pagination and PR metadata/path reads completed for listed records; inventory artifact write succeeded. Direct recursive tree enumeration and full PR enumeration remain incomplete. No source tests/builds run or claimed.
- Status: Phase 0 DONE; Phase 1 IN_PROGRESS; Phases 2–6 NOT STARTED.
- Next: complete bounded PR coverage, source-tree and dependency/reference inventory, then produce migration manifest before any move.
- Safety: no PR merge/closure, branch deletion, deployment, secret/permission change, DB migration, broker write or trading activation.


## 2026-11-24 — WO-2026-11-24-004 expanded Phase 1 inventory

- Timestamp: 2026-11-24 UTC; inventory pass performed during the 23:43+07 session.
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Main SHA immediately before this update: `60ff0cf3958237e0bb3d7c4097f71099e9e11539`.
- Work Order: `WO-2026-11-24-004`; central status APPROVED; Phase 1 IN_PROGRESS.
- Re-read: local `WORK_ORDER_INSTRUCTIONS.md`, central WO-004, central WO-001, NOVA Master Tracker Issue #36, NOVA `logs/OPERATIONS.md`, and target repository structure specification.
- Read-only inventory evidence:
  - Main recursive tree: 487 entries, `truncated=false`.
  - Branches: 318 names including main, four pages (100/100/100/18), final cursor `MzE4`.
  - Pull requests: 364 records across four complete REST pages (100/100/100/64); page 5 empty. Counts: 238 open, 126 closed, 82 merged, 44 closed-unmerged; 220 open Draft and 18 open non-Draft.
  - Full changed-filename lists fetched for #389, #388, #386, #385, #384, #383, #382, #381, #380, #377, #373, #66, #147 and #238.
- Updated inventory artifact: `docs/governance/WO-004-INITIAL-REPOSITORY-INVENTORY.md`; commit `60ff0cf3958237e0bb3d7c4097f71099e9e11539`.
- Key findings: #389/#388 touch the same two documentation paths but need history/review reconciliation; #373/#377 overlap in Core API source but have distinct migration/UI/CI changes; #383/#381/#380 touch Datacenter-owned research paths; #66/#147 remain isolated; #238 remains blocked and preserved.
- Checks: live main ref and source files were read before mutation; inventory update was accepted by GitHub. Read-back verification of this update is pending.
- Incomplete: changed-path enumeration for remaining PRs, PR commit/review reconciliation, import/caller/workflow/deployment reference mapping, and full ownership matrix. Phase 1 remains IN_PROGRESS; Phases 2–6 remain NOT STARTED.
- No source/data/model/migration/workflow/runtime files moved or changed; no PR merged/closed; no branch deleted; no deployment, database, secrets, permissions or broker actions.
- Next: read back the updated inventory and log; then complete remaining PR changed-path and dependency/reference inventory before preparing Phase 2 disposition.


## 2026-11-24 — WO-2026-11-24-004 PR overlap verification

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Main SHA before this log update: `eacfb02f806b2387ad916f6cf7f883b5ba66ea73`.
- Compared full PR diffs, commit lists, comments and per-file resulting blob SHAs for #388 and #389.
- Evidence: both PRs change the same two paths; both resulting blob SHAs match exactly; fetched unified diff strings are byte-identical (31,177 characters); #388 is closed/unmerged with four distinct commits; #389 is open Draft with two distinct commits; no shared commit SHAs; both PR comment timelines are empty.
- Updated `docs/governance/WO-004-INITIAL-REPOSITORY-INVENTORY.md` with preliminary disposition evidence; inventory artifact commit `eacfb02f806b2387ad916f6cf7f883b5ba66ea73`.
- Preliminary disposition only: #389 KEEP candidate; #388 SUPERSEDED candidate. No PR was merged/closed and no branch was deleted.
- Checks: complete PR diff equality and file blob equality confirmed via GitHub API. Read-back of this inventory update is pending.
- Status: WO-004 Phase 1 remains IN_PROGRESS; Phase 2 disposition is not complete. No merge readiness is inferred for #389.
- Next: continue remaining PR changed-path coverage and source dependency/caller mapping. Preserve all safety and no-deployment boundaries.


## 2026-11-24 — WO-2026-11-24-004 dependency review and preliminary migration manifest

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Main SHA before this operation's manifest write: `95d788b31b6fd031f2cd8f1c3c493ee05601c851`; latest verified main after the inventory update and before this log append: `bd87cf514ab9416cdda1d22a7b569b1ffc4cb667`.
- Re-read the approved central WO-004, local `WORK_ORDER_INSTRUCTIONS.md`, NOVA Master Tracker #36, existing operations log, and target repository structure specification.
- Live inventory: 318 branches (four pages); 364 PRs across all states (four pages: 100/100/100/64; page 5 empty), 238 open PRs; recursive tree at `e1e23cc4a2ebe5b6f7a5369e06f15667d60b5692` contains 488 entries with `truncated=false`.
- Fetched changed-filename lists for open PRs #389, #387, #386, #385, #384, #383, #382, #381, #380, #377, #376, #375, #374, #373, #372, #371, #370, #368, #367 and #366. Earlier evidence covers #388, #66, #147 and #238. This is not complete changed-path coverage for all PRs.
- Read current-main files for root `package.json`, `netlify.toml`, `vite.config.ts`, `tsconfig.json`, `server.ts`, root workflows, Command Center app config, Remote MCP Gateway README/source, System Hub README/config, and infrastructure docs.
- Dependency finding: root app and `apps/nova-command-center/` are distinct application trees with separate packages/config/CI. Root tests directly read root `server.ts`, root `src/components/*`, Remote MCP and MT5 files. No source move is safe without preserving these callers.
- Deployment config finding: current recursive tree has no `frontend/package.json` or `frontend/package-lock.json`; current `.github/workflows/cloudflare-deploy.yml` nevertheless runs `npm ci` from `frontend/` and references `frontend/package-lock.json`. Recorded as a BLOCKED deployment/config audit finding only. WO-004 excludes workflow changes; no repair or workflow run was performed.
- Gateway/control-plane distinction: existing `integrations/remote-mcp-worker/` is the single NOVA MCP Gateway; `integrations/system-hub/` is the authenticated control plane. Both preserved in place.
- Created `docs/governance/WO-004-MIGRATION-MANIFEST.md` revision 0.1; commit `e1e23cc4a2ebe5b6f7a5369e06f15667d60b5692`. It records M-001..M-014, explicit no-move decisions and rollback requirements. No source/data/runtime file move is approved by revision 0.1.
- Updated `docs/governance/WO-004-INITIAL-REPOSITORY-INVENTORY.md` with current tree/runtime findings and manifest link; commit `bd87cf514ab9416cdda1d22a7b569b1ffc4cb667`.
- Verification: manifest and inventory were fetched from `main` after writes; content and blob SHAs returned. No source tests/builds were run; no tests are claimed.
- No code, data, model, migration, workflow or runtime files moved or edited; no PR merged/closed; no branch deleted; no deployment, database, secret, permission or broker action.
- Status: Phase 1 IN_PROGRESS (all branches/PR metadata/tree enumerated; full PR changed-path and dependency/caller mapping outstanding); Phase 2 IN_PROGRESS (preliminary classification only); Phase 3 PRELIMINARY / BLOCKED (zero moves approved); Phases 4–6 NOT STARTED.
- Next: complete changed-path and commit/review reconciliation for remaining PRs; map import/caller/config/deployment references for M-001..M-014; prepare manifest revision 0.2 only after a safe exact move set is evidenced.


## 2026-11-24 — WO-2026-11-24-004 expanded PR changed-path coverage

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Main SHA before inventory append: `90c31ec3176a9235f820e550016eaf6a7ddd9d98`; inventory update commit: `b376cb35e277ecd7be2a07208523d83f6d72f9e1`.
- Fetched changed-filename lists for an additional 60 open PRs: #365, #364, #363, #362, #358, #357, #356, #355, #354, #352, #351, #350, #349, #348, #347, #346, #345, #344, #341, #340, #339, #338, #337, #336, #335, #334, #333, #332, #331, #329, #327, #326, #324, #322, #321, #319, #318, #317, #316, #315, #314, #313, #312, #311, #310, #309, #308, #307, #306, #305, #304, #303, #302, #301, #300, #299, #298, #297, #296 and #295.
- Combined with prior reads, 84 distinct PR changed-filename lists are inspected. This remains partial coverage of 238 open PRs; no complete per-PR classification is claimed.
- Key findings recorded in manifest and inventory: #363/#364/#365 overlap on CircleCI config; #358/#352 have different root/app/Worker/migration scopes; #355/#356 affect auth/token-sensitive paths; #351 affects workflows; #340/#341 add data lineage/catalog candidates; multiple quant/training PRs remain Datacenter-owned or blocked; #334/#336/#322/#307/#302/#297 and Bridge PRs affect trading/MT5 safety boundaries.
- Updated `docs/governance/WO-004-MIGRATION-MANIFEST.md` revision 0.1 at commit `90c31ec3176a9235f820e550016eaf6a7ddd9d98` and `docs/governance/WO-004-INITIAL-REPOSITORY-INVENTORY.md` at commit `b376cb35e277ecd7be2a07208523d83f6d72f9e1`.
- Checks: GitHub file lists and read-only metadata fetched; documentation writes accepted. No source tests/builds run or claimed.
- No source/data/model/migration/workflow/runtime files moved or edited; no PR merged/closed; no branch deleted; no deployment, DB, secrets, permissions or broker action.
- Status: Phase 1 IN_PROGRESS; Phase 2 IN_PROGRESS (partial classification); Phase 3 PRELIMINARY / BLOCKED (zero moves approved); Phases 4–6 NOT STARTED.
- Next: continue remaining open PR changed paths; then inspect PR commits/reviews/patches for overlap candidates and map exact current-main callers/workflows/config/deployment references.


## 2026-11-24 — WO-004 current-head refresh and MT5 migration collision review

- Main SHA before this log append: `a6bc260251f823e9247ce4820dab4d359bef9b83`.
- Re-read exact live main first; recursive tree at `760a9bc0eedc36793daf6c447509e815350cc006` has 488 entries and `truncated=false`; latest open PR count is 237.
- Inspected six additional distinct changed-file lists (#387, #376, #375, #372, #371, #370), bringing the recorded unique inspected PR-list count to at least 90. Re-read #384/#383/#382/#381/#380/#386/#385 for overlap review. This is partial coverage, not all 237.
- Reviewed full PR diffs for #375/#376. Both create the same NOVA MT5 customer connection table/RLS/view contract and change proxy lookups to `public.nova_broker_connections`. #376 additionally includes staging relay origin allowlisting, redirect rejection, broader tests/validation and a schema-usage migration. Marked the pair BLOCKED pending SQL equivalence, migration-ledger and branch-ancestry reconciliation. No migration applied.
- Confirmed current main contains `integrations/mt5-readonly-proxy/` and `integrations/system-hub/`, but no `integrations/nova-core-api/`; #373/#377 remain PR-only candidates and are not proof of deployed service.
- #387 is a dependency-only Command Center package update (Zod 3→4, Vite 8.1.5→8.1.6); exact-head app validation remains required.
- Updated `docs/governance/WO-004-MIGRATION-MANIFEST.md` at commit `30b14071b7c11531f496958248bba4d2fc3d797b` and `docs/governance/WO-004-INITIAL-REPOSITORY-INVENTORY.md` at commit `a6bc260251f823e9247ce4820dab4d359bef9b83`.
- No source/data/model/migration/workflow/runtime files moved or edited; no PR merged/closed; no branch deleted; no workflow run/deployment; no DB, secrets, permissions or broker action.
- Status: Phase 1 IN_PROGRESS; Phase 2 IN_PROGRESS (partial); Phase 3 PRELIMINARY / BLOCKED (zero moves approved).
- Next: complete remaining PR changed-path coverage and review commits/reviews/exact-head CI for overlapping paths; map source callers/workflows/config/deployment references before any move.


## 2026-11-24 — WO-004 MT5 schema consumer parity blocker

- Main SHA before log append: `68fedcd86fa0c488136eca6264e0c55ef135eb88`.
- Read current-main proxy Worker, System Hub Worker and Remote MCP Gateway README.
- Proxy Worker and System Hub both query `public.broker_connections`; Remote MCP Gateway contract also documents `broker_connections`.
- PR #375/#376 change the proxy to `public.nova_broker_connections` and create a separate NOVA schema/view, but their changed paths do not update System Hub or Remote MCP consumers.
- Recorded this as a source-level contract mismatch and BLOCKER in the migration manifest and inventory. This is not a claim about deployed production DB state.
- Updated manifest commit: `d840692056584307242f6df3a07c52089d2ea0c1`; inventory commit: `68fedcd86fa0c488136eca6264e0c55ef135eb88`.
- Required gates: canonical schema choice; all-consumer migration plan; proxy/System Hub/Remote MCP contract tests; cross-tenant denial; pending-only creation; read-only/no-order-write proof; exact migration ledger and rollback.
- No source code or migration modified; no DB action, deployment, PR state change or broker action.
- Phase 1 and 2 remain IN_PROGRESS; Phase 3 remains PRELIMINARY / BLOCKED; zero moves approved.


## 2026-11-25 — WO-004 latest PR overlap refresh

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`. Current PR base SHA observed on latest PRs #391–#394: `07afb3f3ed1948788bb9961682715518823aff4c`; #394 is the latest inspected PR. Branch search confirms `main` exists. This is the latest PR base evidence, not a claim that every PR in the repository is based on this SHA.
- Refreshed PR metadata, full changed-file lists and patches for #390–#394, plus #388/#389. #393 is closed/unmerged and explicitly superseded by #394. #390 is closed/unmerged; #391 and #392 remain open Drafts. #388 is closed/unmerged and superseded by #389.
- #394 changes `integrations/remote-mcp-worker/src/index.js`, `tests/test_research_pipeline.py`, and `workers/runtime.py`. Patch review confirms the MCP tools-array comma fix and moves deterministic RiskWorker rejection ahead of the optional approval service check; unauthenticated risk-pass requests return 401; authenticated requests still fail closed with 503 while approvals are disabled. This is source-diff review only; no test was run by this operator.
- #394 exact head: `08cc8207528012cf0322cb0982d166af4d44894a`. Combined status contexts: CircleCI Pipeline = error (pipeline 1817); Vercel deployment context = success. Vercel success is not evidence of production deployment. PR remains Draft; exact-head GitHub Actions and required Python/Node/Compose/container checks are not evidenced as passing here.
- #391 and #392 both change `infra/docker-compose.yml` to archive the legacy Python MCP prototype behind `legacy-archive` and disable restart. #391 additionally adds `.github/workflows/nova-compose-architecture-ci.yml`; #392 instead corrects `infra/README.md`. They overlap but are not identical or proven interchangeable. The workflow file is absent from current-main contents (GitHub returned 404 when read from `main`), and current-main `infra/docker-compose.yml` still defines the default `mcp-server` service. Keep both Drafts pending a single integrated proposal and runtime validation; do not close either as duplicate without reconciling the complementary README/CI changes.
- #391 exact head `b3e646b21362ec00164709bf44702bfefb410c9f`: CircleCI error (pipeline 1806), Vercel context success. #392 exact head `079c11e42c4275525de29c334ec42ff62c2e3419`: CircleCI error (pipeline 1810), Vercel context success. Compose CLI/config and startup smoke tests remain outstanding per PR bodies.
- #389 is open Draft, docs-only (integration plan + OpenAPI contract), based on an older main SHA `73d8b6bb4fbe31bc8bc19c88129dad1d8e943c3b`; #388 is closed/unmerged and superseded. No architecture docs PR is treated as proof of actual cross-repository integration.
- Current-main Compose blob SHA read: `1a52b30d87cc6614f3115b0875a65f911b83cd89`; it still includes `mcp-server` in default services. No runtime Compose test was run in this pass.
- No PR merged/closed, no branch deleted, no workflow changed, no source/data/model/migration moved or modified, no deployment/DB/secrets/permission/broker action. No tests/builds run or claimed.
- WO-004 status unchanged: Phase 1 IN_PROGRESS; Phase 2 IN_PROGRESS; Phase 3 PRELIMINARY / BLOCKED with zero moves approved; Phases 4–6 NOT STARTED.
- Next: inspect exact commit ancestry and full CI/run logs for the latest overlapping PRs; agree one combined Compose proposal with Docker CLI/runtime evidence; continue remaining PR path coverage and current-main caller/config map.


## Exact-head GitHub Actions addendum — PR #394

- GitHub Actions run `45447170407` (SMC Research CI, run #590) is attached to exact PR #394 head `08cc8207528012cf0322cb0982d166af4d44894a`.
- Run conclusion: **SUCCESS**. One job (`smc-tests`) completed successfully. Verified steps include Python dependency setup, SMC module compile, focused SMC tests, pytest regression suite, Cloudflare Worker SMC classification tests, Docker Compose configuration validation, research-worker container build, and frontend container build.
- This is meaningful exact-head evidence and updates the earlier statement that no exact-head Actions result was verified. It does **not** prove a separate full Remote MCP Node test suite was run: no step is explicitly named as the complete MCP Worker Node test suite. CircleCI status remains error (pipeline 1817), and Vercel context success remains non-production evidence.


## Additional stale-branch review — PRs #290–#294

- Current main HEAD observed by commit comparison: `1230ca736522e612dc79cd86d3613cd0960b8c52`.
- #292 (open Draft, 6 files) is a read-only multi-timeframe SMC research analyzer. It adds `workers/feature/smc_wave/multi_timeframe.py`, changes `workers/runtime.py` and `.github/workflows/smc-research-ci.yml`, and adds API/unit tests. It explicitly keeps the route research-only, has no end-user authentication, and must remain inside the internal Docker network. Compare current `main` → PR head: **diverged, 11 ahead / 219 behind**, merge base `97b956f3929011192e92d82e5e7f97249bf303a0`. Historical PR body reports prior CI failures before runner assignment; those are not current exact-head pass evidence. **Disposition: KEEP FOR REBASE/REVIEW; do not merge as-is.** It also overlaps `workers/runtime.py` with newer PR #394, so rebase and retest against current main are mandatory.
- #291 (open Draft, 2 files) adds a bounded read-only Exness MT5 Demo M1–D1 exporter and tests. It requires confirmed Exness Demo/server/symbol/BID mode, exports native tick_volume and UTC bar-open timestamps, writes SHA-256 manifests and marks outputs training-ineligible pending independent audit. It does not contact an MT5 terminal in the reported tests and does not recover the #238 missing dataset. Compare current `main` → PR head: **diverged, 7 ahead / 221 behind**, merge base `dad49ccbd6e69a02c6bb5c248657d6e12a421fe3`. PR body reports 7/7 Windows unit tests but historical CI is inconclusive/blocked and no real export occurred. **Disposition: KEEP AS A UNIQUE DATA-RECOVERY TOOL CANDIDATE; do not merge as-is or claim dataset recovery.** Rebase and exact-head tests required.
- #294 and #290 are closed/unmerged aggregate-profit-close feature candidates. #293 is merged but is explicitly titled a revert restoring main before the aggregate-profit-close feature; its changed paths are the migration and tests. Therefore these PRs do not establish that aggregate-profit-close is currently active on main. Do not treat the old candidate as implemented or reopen it without a fresh requirement and full schema/risk review.
- These five PR metadata/path lists and two full patch sets were reviewed in this pass. No PR state or branch changed, no code was merged, no exporter was run, and no data/model/DB/broker action occurred.


## WO-2026-11-24-004 — live inventory refresh (2026-11-24T17:52Z)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Before SHA: `9b03eaac5d6a3c20a7192cdf375d2446407f6a30` (verified live before this documentation-only operation).
- Inventory evidence: recursive tree 489 entries / 374 blobs, `truncated=false`; 331 unique branches across 5 cursor pages; 375 PR records from REST pagination (242 open, 133 closed).
- Updated `docs/governance/WO-004-MIGRATION-MANIFEST.md` with current snapshot and PR overlap findings for #395–#400, including #400's duplicate test function defect and #397/#399 workflow-path overlap.
- Key evidence: #396 exact-head CI reported PASS but owner-vs-foreign-tenant Demo E2E remains absent; #398 Compose-specific validation passed but overall SMC CI remains failed on two failures also observed on main; #397 exact-head CI pending.
- After SHA for manifest update: `bcab510b08361409a570480a323e88a74d52595c`.
- No source/runtime/data/model/test/migration/workflow file moved or edited; only governance documentation changed. No PR state, branch, deployment, database, secret, permission or broker state changed.
- Status: Phase 1 IN_PROGRESS; Phase 2 IN_PROGRESS; Phase 3 PRELIMINARY/BLOCKED (zero moves approved).
- Next: reconcile overlapping PRs #397/#399/#400/#395; finish per-PR path coverage and dependency/caller/workflow mapping before revising the zero-move manifest.


## WO-2026-11-24-004 — frontend path and PR #399 correction (2026-11-24T17:52Z)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Evidence: root `netlify.toml` + root Vite package/config/index entry establish the root React SPA build for Netlify. `apps/nova-command-center/` is a separate TanStack Start app with its own CI. Current `frontend/` tree has no package.json, package-lock.json or Next.js app source.
- Blocker: Cloudflare deploy and approval migration workflows reference `frontend/package-lock.json`, run `npm ci` from `frontend`, and Cloudflare deploy invokes `npm run cf:build`; those inputs are absent from current main. No workflow or deployment was run.
- Correction: #397 changes `datacenter-client.js` but its SMC Research CI path filters omit it. #399 adds the missing path to pull_request and push filters, so #399 complements #397 and is not a duplicate.
- #400 remains blocked: two identically named test functions in its test file cause Python's later definition to shadow the earlier test.
- Updated the migration manifest with frontend ownership/deployment-path findings and the corrected PR disposition.
- Manifest update commit: `b91e95eb5d2debcdce854b1105a7cd45f2294116`.
- No source/runtime/workflow/data/model/migration files moved or edited; no PR or branch state changed; no deployment, database, secrets, permissions or broker action occurred.
- Next: keep the three frontend path groups separate; raise workflow remediation as a separate authorized work item; finish caller/import mapping before any move.


## WO-2026-11-24-004 — Command Center API caller/binding audit (2026-11-25)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`; branch: `main`.
- Before SHA: `6114725d5aaee20feeaa73877c67340e5f15fa11`.
- Read-only audit covered Command Center auth/API client/config/callers/tests, System Hub Worker/routes/config/tests, Remote MCP Gateway/client/config, deployment workflows, and PR #373/#377 head implementations.
- Confirmed caller chain: AuthProvider obtains the active Supabase access token and injects it into the API client; Command Center Dashboard consumes health/services/bridge-status; Settings consumes health; API base URL is intentionally blank in the checked-in `.env.example`.
- Confirmed distinct API ownership:
  - Command Center REST contract: system health/services, bridge status/account, risk policy, approvals, audit and assistant status.
  - System Hub: authenticated broker connection registry and tenant-scoped MT5 account/quotes.
  - Remote MCP: the single MCP Gateway, including Datacenter tool forwarding.
- Confirmed gaps: no current-main Core API Worker/deploy binding; no authenticated frontend-to-API E2E evidence; #373 and #377 are both stale/diverged from current main (merge base `0cceaf5d1d32b4323bcf72f9f26877c6d75886ff`, 134 commits behind); #377 implements only health/identity; #373 has broader routes but static/not-verified service and bridge status plus 503 placeholders for bridge account/risk policy. #373's claimed applied migrations remain unverified against the live Supabase migration ledger.
- Security review note: Command Center's `ALLOWED_API_PATHS` constant is not enforced by `assertReadOnlyRequest`; the current client does enforce GET-only and blocks forbidden trading/funds patterns. This is a client-side hardening gap, not evidence of an exposed write route. Server-side authorization remains mandatory.
- Updated `docs/governance/WO-004-MIGRATION-MANIFEST.md` with section 11 caller/binding evidence and preliminary PR disposition.
- Manifest commit: `bb7076d4fed0ed6b171f9d1b88f5885f31932e16`.
- After SHA before operations-log update: `bb7076d4fed0ed6b171f9d1b88f5885f31932e16`.
- No code, runtime configuration, database, secret, permission, PR state, branch, deployment, or broker state changed. No tests were executed in this audit; cited test files were inspected only.
- Status: API caller/binding audit DONE for the inspected paths; PR disposition remains IN PROGRESS; Backend Consolidation BLOCKED pending authoritative data-source contract, migration-ledger verification, current-main port/rebase, and authenticated E2E proof. Production deployment remains PAUSED; trading remains disabled.
- Next action: design a minimal current-main API implementation plan that reuses System Hub for broker connection data and Remote MCP for Datacenter tools, while keeping Command Center's REST control-plane contract separate. Do not merge #373/#377 wholesale.

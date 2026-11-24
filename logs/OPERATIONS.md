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

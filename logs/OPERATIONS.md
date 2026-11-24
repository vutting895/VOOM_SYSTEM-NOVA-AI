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

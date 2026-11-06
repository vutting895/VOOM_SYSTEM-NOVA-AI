# NOVA Delivery, Verification, and Activation Plan

**Last reviewed:** 2026-10-30  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Purpose:** A single repeatable sequence for development, verification, and controlled activation. Follow this plan for future work; update it through a reviewed pull request when the sequence or acceptance criteria change.

## 1. Non-negotiable operating rules

1. Treat this repository's `main` branch as the source of truth for NOVA. Work in feature branches and submit pull requests; do not push unreviewed implementation changes directly to `main`.
2. Preserve existing source until inventory, diff review, and replacement verification prove it is safe to remove. Do not remove unique files just to make repositories look consistent.
3. Keep **Read-only + AI Analysis** as the active operating mode. Keep broker order submission disabled and Live Trading OFF. No stage in this plan grants permission to place a live order.
4. Never commit, paste into issues/chat, or print secrets, broker credentials, tokens, account login IDs, or private tenant configuration. Store secrets only in the appropriate provider's secret store.
5. Distinguish code checks, provider build checks, deployment state, and live runtime verification. A cancelled deployment, a passing unrelated job, or a running process is not proof that the application or broker connection works.
6. Track work in GitHub Issues and PRs. A task is **Done / Verified** only when its acceptance criteria and evidence are recorded. Otherwise use **In progress**, **Blocked**, or **Not started**.

## 2. Execution order

### Phase 0 — Establish the baseline and protect work

- [ ] Confirm `main` is current and identify active PRs, issue dependencies, and deployment targets.
- [ ] Review the two-repository consolidation proposal in PR #35 against current NOVA `main`; classify each incoming file as keep, merge, superseded, or defer.
- [ ] Review the bridge-auth correction in PR #34 and establish whether its tests and security behavior are covered by the current CI.
- [ ] Record the current state of Frontend CI, backend deployment workflow, Netlify site `voomsystem`, Cloudflare backend Workers, and Supabase migration state.
- [ ] Preserve unique work and retain a rollback/reference commit before any cleanup.

**Exit gate:** A reviewed file/directory inventory, dependency/overlap list, named target branch, and evidence-backed baseline. No destructive cleanup before this gate.

### Phase 1 — Reconcile the canonical repository

- [ ] Review PR #35 diff for accidental overwrites, duplicate implementations, secrets, generated artefacts, and changes outside its stated scope.
- [ ] Compare important paths (frontend, MCP server, Workers, Bridge, Supabase migrations, workflows, tests, docs) against current `main`.
- [ ] Resolve conflicts on a branch based on current `main`; do not force-push or merge a stale/diverged integration branch without review.
- [ ] Confirm the canonical MCP entry point, frontend root, Worker deploy targets, and Windows Bridge bootstrap in documentation and CI.
- [ ] Remove duplicated/obsolete files only after references, imports, deploy configuration, and replacement behavior have been verified.

**Exit gate:** The PR diff is understood, required files are retained, no secrets are introduced, and the reconciliation PR is reviewed and passes relevant CI before merge.

### Phase 2 — Code quality and reproducible tests

Run applicable checks from a clean checkout. Record links to actual workflow runs and logs.

- [ ] Frontend: clean dependency install, TypeScript/typecheck, lint if configured, production build, and route-level smoke tests.
- [ ] Workers: unit/contract tests, configuration validation, auth failures, tenant isolation, and health responses.
- [ ] MCP: container/Compose validation, protocol handshake, tool discovery and safe tool-call smoke tests.
- [ ] MT5 Bridge: syntax/import checks and tenant-guard contract tests; confirm the no-credential path fails closed.
- [ ] Backtest/risk: deterministic regression tests, boundary cases, and confirmation that order execution remains disabled.
- [ ] Dependency and repository safety: secret scan, migration review, lockfile consistency, and check for unexpected generated/binary files.

**Exit gate:** All required checks for changed components pass on the PR's current head commit. Any skipped or unavailable check is explicitly recorded as a blocker, not counted as a pass.

### Phase 3 — Authentication, data access, and tenant security

- [ ] Unauthenticated private API requests are rejected (expected 401 when service configuration is valid).
- [ ] Invalid/expired credentials are rejected; a valid credential with a mismatched tenant is rejected (expected 403).
- [ ] Missing required service configuration fails closed (expected 503 where defined).
- [ ] Authenticated users can access only their own profile/account connection; test Supabase RLS and exposed API schemas/functions.
- [ ] Review security-sensitive SQL/RPC grants, profile ownership rules, and migration order before applying migrations.
- [ ] Check logs and responses for secrets, account identifiers, tokens, or excessive personal/broker data.
- [ ] Confirm the service status explicitly reports read-only mode and order submission disabled.

**Exit gate:** Evidence exists for both allow and deny cases, including unauthenticated, invalid/expired credential, tenant mismatch, and cross-user access attempts. A UI status label alone is insufficient.

### Phase 4 — Provider configuration and Netlify Preview validation

- [ ] Verify Netlify site `voomsystem` uses the intended GitHub repository, Next.js frontend under `frontend/`, and intended branch.
- [ ] Verify required environment-variable **names and presence** without exposing values; never paste secret values in a PR or log.
- [ ] Confirm Netlify is the customer-facing frontend target and Cloudflare workflows deploy backend Workers only. Keep the Cloudflare frontend as rollback until Netlify's production routes and auth gates pass.
- [ ] Confirm expected Supabase Auth URLs/providers, migration state, RLS policies, and API exposure using the provider consoles.
- [ ] Review the exact Netlify Build Plugin failure before retrying; do not treat a cancelled Preview or build-rate-limit/403 response as a successful build. UI-installed plugins must be fixed/disabled intentionally through Netlify Project configuration > Developer settings > Build plugins.
- [ ] Deploy only to Preview/staging during this phase. Verify the deployment commit SHA, project, provider status, and the relevant browser/API routes.

**Exit gate:** Correct source commit and intended project are verified; relevant Preview URLs respond as expected; private routes deny unauthenticated access; backend health and auth behavior match the security contract.

### Phase 5 — Read-only broker/Bridge verification

- [ ] Keep the broker request pending until a dedicated tenant route exists and passes verification.
- [ ] Confirm the local MT5 terminal is the intended **Demo** session using sanitized metadata only.
- [ ] Verify the Windows Bridge's authenticated outbound WSS connection to the tenant-scoped Cloudflare Relay; confirm the route-map binding exists in the trusted secret store. The old named Tunnel/custom-domain route is not the active path.
- [ ] Match tenant ID, HTTPS origin, and tenant-specific token exactly without disclosing the token.
- [ ] Test health, authentication, tenant mismatch, and per-user isolation end to end through the deployed proxy and Windows Bridge.
- [ ] Mark a broker connection as connected only after an authenticated read-only account check returns verified evidence; a Worker, terminal process, or tunnel alone does not qualify.

**Exit gate:** The account is verified through the intended route with sanitized evidence, `mode=read-only`, and `order_submission_enabled=false`. If any prerequisite is missing, leave the request pending/blocked and report the exact blocker.

### Phase 6 — Controlled release and post-release checks

- [ ] Confirm Phases 0–5 required for the release are passed, all PR reviews are complete, and CI refers to the exact candidate commit.
- [ ] Obtain explicit approval before production deployment; never turn a documentation or test task into an unrequested production cutover.
- [ ] Deploy through the designated provider workflow; record deployment ID/URL, provider result, commit SHA, and timestamp.
- [ ] Run post-deploy route, authentication-denial, Worker health, and safe read-only smoke tests.
- [ ] Verify the intended UI is served by the intended host and the backend points to the expected services.
- [ ] Review errors/monitoring and write the outcome, known limitations, and rollback reference in the tracking issue.
- [ ] Keep Live Trading and real order submission disabled after release.

**Exit gate:** Provider deployment is successful for the intended commit and project, all release smoke tests pass, and the evidence is attached to the tracking issue. Do not declare complete while any critical check is blocked or unverified.

## 3. Release decision table

| Area | Required evidence | Decision if missing or failing |
|---|---|---|
| Git/repository | Reviewed diff; no unexplained deletions; required PR checks on current head | Do not merge |
| Frontend | Typecheck/build and intended Preview route smoke tests | Do not release frontend |
| Backend Workers/MCP | Tests pass; intended Worker/version; health and authentication behavior verified | Do not activate dependent UI path |
| Supabase | Migration status, RLS and user-isolation tests | Keep user/private features blocked |
| MT5 Bridge | HTTPS route, tenant guard, authenticated read-only account response | Leave broker request pending |
| Production | Explicit approval, provider success, intended commit and post-deploy smoke tests | No production cutover |
| Trading safety | Read-only mode, order submission false, Live Trading OFF | Block release if not confirmed |

## 4. GitHub tracking and update protocol

For each implementation item:

1. Create or update a GitHub Issue with scope, dependencies, acceptance criteria, and owner if known.
2. Implement on a branch based on current `main`; submit a focused PR that links the issue and describes tests, risks, and deployment impact.
3. Record checks by name and run URL/SHA. Separate automated test results from provider deployment results and manual UI/runtime observations.
4. Mark an item complete only when its acceptance criteria are evidenced. If blocked, record the blocker, who/action can unblock it, and the next safe step.
5. Update this plan when the execution sequence changes; use a reviewed PR and retain a dated change note.

## 5. Initial work queue (status at review time)

| Priority | Work item | Initial status | Rule for moving forward |
|---|---|---|---|
| P0 | Review repository consolidation PR #35 | Needs review; not assumed merged | Complete Phase 0 inventory and Phase 1 diff review first |
| P0 | Review Bridge auth correction PR #34 | Verify PR/CI state | Confirm deny-case tests against current code |
| P1 | Resolve Netlify deployment/Preview blocker | Blocked: PR #60's Deploy Preview failed in UI-installed `netlify-plugin-checklinks` on `onPostBuild`; `netlify-plugin-fetch-feeds` was also seen in earlier logs | Inspect/disable or correct the intended UI-installed plugin, then rerun Preview and production route smoke checks |
| P1 | Complete tenant route, Tunnel, and read-only Bridge checks (Issue #33) | Blocked until route/origin prerequisites pass | Follow Phase 5; do not mark connected early |
| P1 | Validate frontend/backend host split (Issue #30) | Target is Netlify frontend + Cloudflare backend; cutover remains gated | Verify exact deployed commit and `/`, `/login`, `/settings/broker` route responses per Phase 4 |
| P2 | Complete Auth/RLS, migration, and full security test coverage | Not complete until evidence is attached | Follow Phase 3 and only then enable the relevant read-only UI path |
| P2 | Production readiness review | Not ready by default | All applicable release gates must pass |

This queue is a starting snapshot, not proof of current provider status. Re-check GitHub Actions, Netlify, Cloudflare, and Supabase at the point each item is worked.

## 6. Definition of done

An item is done only when the code/configuration change is reviewed, relevant automated tests pass, applicable deny-case/security tests pass, provider/runtime evidence is recorded, documentation reflects the actual state, and no secret or unapproved live-trading capability was introduced.


## 7. Current evidence and remaining blockers — 2026-10-30

This addendum supersedes older deployment and Bridge snapshots only where it records newer evidence. It does not assert that the user-session Proxy, full Netlify cutover, or production activation has passed.

### Verified in this check
- PR #64 merged into `main` as `1b6574aec7f7023734694412366210433469f059`; the research document now includes SciSpace-discovered literature and validation gates for backtest selection bias, Deflated Sharpe Ratio, chronological walk-forward evaluation, and explicit research limitations.
- The authorized Windows device is online. The private tenant configuration was read only in process memory; no token, account identifier, broker balance/equity, or quote price was emitted.
- Authenticated local Windows MT5 Bridge checks returned HTTP 200 for health, account summary and quotes. Health reported the terminal and account session connected. Account reported connected. Quotes returned 5 XAUUSDm M5 bars. Every successful response reported `mode=read-only` and `order_submission_enabled=false`.
- Authenticated external Cloudflare Relay GET health, account and quotes returned HTTP 200; relay health reported `relay_ready`, the account response reported connected, and quotes returned 5 XAUUSDm M5 bars. All returned read-only/order-disabled fields.
- Unauthenticated requests to System Hub `GET /v1/connections`, the dummy connection account/quotes paths, and Relay account/quotes returned HTTP 401. This confirms negative unauthenticated responses, not cross-user authorization behavior.

### Still blocked / not verified
- PR #60 remains open. Netlify reported that the Deploy Preview failed in the UI-installed `netlify-plugin-checklinks` `onPostBuild` step with `Links checking failed`; an earlier log also mentioned `netlify-plugin-fetch-feeds`. Those plugin settings are not in the reviewed `netlify.toml`. Netlify's build-plugin documentation directs site owners to manage UI-installed plugins from Project configuration > Developer settings > Build plugins. Fix or intentionally disable only the unneeded plugin in the Netlify site UI, then rerun Preview.
- Netlify's current published deploy is `ready` on commit `fa1aced6bb5559446b72877c39ec7eb5583348bf`. That deployment record does not prove the current `main` commit is serving or that all routes/authenticated paths work. HTTP requests to the public Netlify routes could not obtain an HTTP status in the current Windows check; do not count that as success or as a confirmed 404.
- The actual Supabase user-session path through System Hub / MT5 Proxy is not yet verified using a real authenticated browser session. A test showing unauthenticated 401 is not a substitute.
- A valid owner-session read and a foreign connection-ID denial are still required. Do not infer a pass from the Relay's tenant-token success; the Hub/Proxy must also prove owner-scoped access.
- Do not update the database connection state or route map on the basis of process status, stored status, Relay health alone, or an old timestamp.

### Next executable gates, in order
1. Resolve the site-level Netlify Build Plugin blocker; ensure the Preview passes, then verify `/`, `/login`, and `/settings/broker` on the production URL and attach exact commit/deploy evidence.
2. With a valid signed-in Supabase session, test the owner's actual connection read and then a second user's connection ID; require owner success and foreign-ID denial.
3. Only after those checks, reconcile stored connection metadata with fresh evidence, update tracking issues, and evaluate whether any staging/runtime change is justified.
4. Keep the Windows Bridge available as rollback until the alternative headless candidate has an approved security review and real staging test. Do not cut over to the Linux/Docker candidate yet.

**Safety invariant:** Exness Demo only; read-only + AI Analysis; order submission disabled; Live Trading OFF. These checks do not authorize broker writes.


## 8. Closure status refresh — 2026-10-30

This section records changes after the previous evidence snapshot. It distinguishes merged source changes from production/authentication checks that are still open.

### Merged and confirmed
- PR #34 — hardened MT5 Bridge authentication ordering and fail-closed status handling; reviewed CI passed.
- PR #37 — canonical delivery/verification plan; merged.
- PR #58 — Remote MCP rejects unapproved supplied Origins; allowlists the current Netlify UI and the Cloudflare UI fallback. Frontend CI and SMC Research CI passed.
- PR #64 — SciSpace literature review added: Probability of Backtest Overfitting / CSCV, Deflated Sharpe Ratio, GT-Score applicability limits, chronology and leakage checks.
- PR #68 — stateless MCP 2026-07-28 request-metadata path and tests merged. Frontend CI, SMC Research CI, and its Netlify Deploy Preview passed. This is a tools-only subset; it does not claim full MCP resource/prompt/session/SSE support.
- PR #69 — removed the hard-coded Turnstile site-key fallback. Frontend CI and Netlify Deploy Preview passed. This change makes missing configuration fail closed; it does not prove that a real user completed login.
- PR #70 — retired Alpaca integration source removed from the repository. Historical Supabase migrations were preserved. A current read-only Cloudflare inventory returned 12 scripts and none named `voom-alpaca-oauth`; no Worker deletion, provider secret deletion, database table drop, or data deletion was performed.
- Several old or superseded PRs were closed with explanatory comments while preserving their branches: #10, #13, #15, #16, #23, #52, #54, #59, and #61. This is not a claim that all future work in those areas is complete.

### Current live/runtime evidence
- The authenticated local Windows MT5 Bridge and external Cloudflare Relay returned HTTP 200 for health, account and bounded quote GETs for the configured Demo tenant. Both paths returned read-only/order-disabled flags; quote checks returned 5 XAUUSDm M5 bars.
- Unauthenticated Hub and Relay protected reads returned HTTP 401.
- These tests demonstrate direct Bridge/Relay read capability and anonymous rejection. They do **not** prove the full authenticated browser → Supabase session → System Hub → MT5 Proxy chain or foreign-connection denial.

### Open blockers — do not claim overall closure yet
1. **Netlify hosting cutover / PR #60:** still open. The earlier Deploy Preview failed in the UI-installed `netlify-plugin-checklinks` `onPostBuild` phase with `Links checking failed`; an earlier log also mentioned `netlify-plugin-fetch-feeds`. These site-level plugins are not declared in the checked-in `netlify.toml`, and the connected Netlify API tools do not expose the Build Plugins settings. The account owner must inspect Project configuration → Developer settings → Build plugins, fix the links/feeds configuration or intentionally disable only plugins that are not required, then rerun the Preview. Do not merge PR #60 until the Preview and the production route checks pass.
2. **Auth callback hardening / PR #71:** merged as `1f798f4e976d1516a044b0c53e4ca299f0e742e6`. Frontend CI (Next.js and OpenNext builds) and Netlify Deploy Preview passed for reviewed head `1ea3f53792bc00969f53fbf6631be3a29ffaa0c2`. The callback now requires a Supabase session and verifies the user with `auth.getUser()` before allowing a redirect to `/profile` or `/`. A real email OTP click/browser session on the production host and confirmation of the Supabase Auth redirect allowlist are still acceptance tests. No Supabase redirect settings have been changed.
3. **Authenticated owner and foreign-user tests:** run with two authorized test sessions. Require owner connection/account read success and foreign connection-ID denial. Anonymous HTTP 401 is not a substitute.
4. **Supabase Advisor:** `auth_leaked_password_protection` remains disabled on the Free tier. This capability is plan-gated; no upgrade has been approved or performed. Do not upgrade or change billing without owner approval. Performance Advisor currently reports 29 unused-index notices; no index has been deleted without workload review.
5. **Local source safety / PR #35:** the old `C:\Program Files\voom_system` checkout has modified and untracked files. Do not overwrite it or merge a large consolidation until all unique local changes have been compared and preserved. The runtime checkout also trails current main.
6. **Headless Bridge / PR #51:** remains a draft candidate. Do not switch from the currently working Windows Bridge until staging, tenant isolation, reconnection, observability and rollback tests pass.
7. **Research/approval extensions / PRs #66 and #67:** remain drafts. Wave3/SMC ML is research-only; the durable approval lifecycle needs tested two-user ownership, expiry and replay protection before any state-changing capability could be considered.

### Closure criteria
- Netlify production serves the exact reviewed main commit and returns HTTP 200 for `/`, `/login`, `/settings/broker`, and the auth callback path; evidence records the exact deployed commit.
- A real Supabase OTP session succeeds after callback and persists through refresh/logout.
- Owner read and foreign connection-ID denial pass with two authorized test sessions.
- Security/tenant tests and relevant CI pass on the exact commit.
- The external Relay remains read-only and order submission remains disabled.

**Non-negotiable:** Exness Demo only; Read-only + AI Analysis; `order_submission_enabled=false`; Live Trading OFF. No broker-write capability, production host cutover, or account/route-map mutation is authorized by this checklist alone.


## 9. Netlify Production observation refresh — 2026-10-30

### Deployment evidence
- Netlify's current published Production deploy is `6ae38a268cef1a5112a095bb`, state `ready`, branch `main`, on commit `1f798f4e976d1516a044b0c53e4ca299f0e742e6` (PR #71's merge commit). The later main commit `f8845887ebf2619e2723727735634246a4a54be9` changes only this delivery plan, not application runtime code.
- Netlify Observability recorded direct `GET /` with HTTP 200 after this Production deploy; Next.js RSC requests for `/login`, `/profile`, and `/broker` returned HTTP 200, as did the relevant static JS assets. This is evidence of live routes/assets on this deploy, but is not a complete route acceptance test.
- The unauthenticated `GET /api/broker/status?broker=mt5` returns HTTP 401, which is expected for a protected account endpoint without a Supabase bearer token.
- No direct request to `/settings/broker` was observed in the reviewed logs window. The old `/auth/callback` HTTP 404 records predate the new callback code and the current Production deploy; no post-deploy direct request has been observed. Therefore those two route checks remain open rather than inferred from build success.
- The authorized Windows machine could not obtain HTTP status for Netlify URLs, while the System Hub remained reachable and returned 401 for unauthenticated protected reads. Netlify non-production previews require SSO and are not anonymously accessible from this test route.

### Observability items to investigate
- The last 24-hour window showed 16 `PUT /api/inngest` requests returning HTTP 404. A repository search did not find an `/api/inngest` route or Inngest reference in current source. Do not infer its source or add a handler blindly; identify which provider/plugin/automation sends the requests before deciding whether it is actionable.
- The only HTTP 500 in the same window was for a static login JavaScript asset on an older Netlify Deploy Preview, not the current Production deploy. It is not evidence that the current production login route is failing.
- Historical direct requests to the production `/login` and `/auth/callback` paths returned 404 before the current deploy; this is an old observation and must not be treated as the current status. The later `/login?_rsc=...` requests returned 200, but no real OTP click/session was verified.

### Updated closure gates
1. Verify a direct production GET of `/settings/broker` after the current deploy and retain its exact status/commit evidence.
2. Complete a real email OTP click in a signed-in browser against `https://voomsystem.netlify.app/auth/callback`; verify session persistence, refresh, logout, and Supabase Redirect URL allowlist.
3. With two authorized user sessions, prove user A can read only their own Hub/Proxy connection and user A cannot access user B's connection ID.
4. Resolve PR #60's Netlify frontend/Cloudflare backend repository alignment and inspect/retest the exact branch preview. Do not merge on the basis of an old failed Preview or a different PR's success.
5. Identify the owner of the recurring `/api/inngest` 404s and classify whether a fix is needed.

**Safety invariant remains:** Exness Demo only; read-only + AI Analysis; `order_submission_enabled=false`; Live Trading OFF. No user session, broker credential, or connection route was fabricated during this observation.


## 10. Post-cutover check — 2026-10-30

### Code and CI completion
- PR #74 merged to `main` as `a53623063d8cf9ebcc30f6c508d2a44b7ba8d9fd`. It adds root `netlify.toml` for `frontend/`, makes the Cloudflare deployment workflow backend-only, adds a bounded main-branch route smoke test, and permits the Netlify origin plus the existing Cloudflare rollback UI origin in the Hub/Proxy/NOVA AI/Bridge CORS configuration.
- Exact reviewed PR head `548625330d4b3f165323e16039b18fdb11844b43`: Frontend CI and Windows Runtime CI passed; Netlify Deploy Preview is `ready` at https://deploy-preview-74--voomsystem.netlify.app.
- Main commit `a53623063d8cf9ebcc30f6c508d2a44b7ba8d9fd`: Frontend CI passed, Windows Runtime CI passed, `Deploy authenticated NOVA AI Worker` passed, and `Deploy VOOM Workers to Cloudflare` passed.
- The main-branch `netlify-production-smoke-test` completed successfully. Its logs confirm that `/`, `/login`, and `/settings/broker` returned HTTP 200. This is route availability evidence, not proof of an authenticated broker session or of which source commit Netlify served.

### Production commit reconciliation remains open
- Netlify's connected project API still reports published deployment `6ae38a561eb1efe24a5a1105`, state `ready`, branch `main`, commit `f8845887ebf2619e2723727735634246a4a54be9` (older than `main` `a53623063d8cf9ebcc30f6c508d2a44b7ba8d9fd`).
- Therefore, do **not** claim the Netlify Production deployment record matches the latest main source yet. The current GitHub smoke test checks HTTP status/content for the routes but does not cross-check Netlify's published commit. Resolve/inspect the provider-side production deploy so its published commit is current, then record that exact deploy ID and SHA.
- The connected Netlify tool surface exposes project/deploy reads but not a deployment-trigger or Build Plugins configuration operation. If the site does not advance automatically, the owner must inspect the Netlify Git integration / deploy status in the Netlify dashboard; no provider settings were changed by this PR.

### User/session and security gates still open
1. Exercise a real Supabase email OTP link on the Production host; confirm callback completion, session persistence through refresh, and logout, and verify the Supabase Auth redirect allowlist.
2. With two authorized test sessions, prove a signed-in owner can read their own Exness Demo connection and cannot read a foreign connection ID. Anonymous HTTP 401 is not a substitute.
3. Identify the source of the recurring `PUT /api/inngest` 404 requests seen in Netlify Observability (16 in the earlier 24-hour window). No handler was added because there is no corresponding route/reference in the repository.
4. Supabase Security Advisor still flags `auth_leaked_password_protection` disabled on the Free tier; this is plan-gated and has not been enabled or upgraded. Performance Advisor reports 29 unused-index notices; none were automatically deleted.
5. The local checkout `C:\Program Files\voom_system` remains dirty with modified/untracked files. Do not overwrite or consolidate it into main until every unique local change has been compared and preserved.
6. PR #35 remains Draft for the source-consolidation safety hold. PRs #5, #51, #66, and #67 remain staged/draft work for alternate MCP, headless Bridge, Wave3/SMC research, and durable approval lifecycle; none is authorized as production execution code.

**Safety invariant:** Exness Demo only; Read-only + AI Analysis; `order_submission_enabled=false`; Live Trading OFF. A green route smoke test does not authorize broker writes, automatic RL activation, or skipping tenant isolation.

## 11. Supabase Free approval verification — 2026-10-30

### Free replacement and evidence
- Kept the existing Supabase project on the Free plan. No paid Supabase development branch was created; no hosted Supabase compute was incurred for this test.
- PR #67 runs a disposable Supabase Local Stack inside GitHub Actions with Docker. It uses generated local-only API/Auth keys and localhost URLs, applies only `20261027160402_mt5_customer_connections.sql`, `20261031070311_nova_durable_approval_lifecycle.sql`, and a temporary `pgcrypto` bootstrap, then stops the stack.
- The test creates two throwaway users through local Supabase Auth, signs in through the password grant to obtain real Auth-issued JWTs, and calls the actual Next.js approval API routes plus local PostgREST.
- Local acceptance passed with two local Supabase Auth users and Auth-issued JWTs against the actual Next.js APIs/PostgREST: unauthenticated request is 401; owner A can create/list threads and create/read/approve drafts; owner B cannot see A's thread, create in A's thread, list A's approvals, or resolve A's approval; approve replay is rejected; edit and reject decisions persist; a fresh GET restores the edited/rejected states after the API request; owner A can read their Exness MT5 Demo pending connection while owner B receives no row under RLS.
- Frontend CI run [40983936466](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/40983936466) passed on latest code commit `b7ed3209b8e197b336f9b9f1af65c9c5158e7844`, including approval contracts, Netlify-aligned Next.js build, MT5 read-only, tenant guard, and proxy/relay checks. The Netlify Production smoke job is skipped for pull-request events, as expected.
- NOVA Approval Migration CI run [40983936449](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/40983936449) passed both jobs: ephemeral PostgreSQL migration/owner isolation (including edit, expiry, stale-policy, and replay cases), and local Supabase Auth + PostgREST + Next.js API isolation (including approve/edit/reject, replay denial, and read-after-write recovery).
- The MT5 proxy suite reports 18 passing tests. The foreign connection ID case returns 404 and asserts zero **mocked** outbound Relay calls. This is not a live production Relay request or production telemetry.
- Netlify Deploy Preview for the same latest code commit is `ready`: deploy `6ae3edd3ef8bceb71b60ce9b`, commit `b7ed3209b8e197b336f9b9f1af65c9c5158e7844`, preview URL https://deploy-preview-67--voomsystem.netlify.app.

### What remains separate
- The hosted `Voom_system` database has not received this approval migration. No hosted test users/connections, production flags, secrets, DNS, hosting configuration or broker settings were changed.
- Real hosted email OTP/browser-session acceptance and the hosted Supabase Auth/Data API -> System Hub -> MT5 Proxy -> Relay chain remain unverified. Do not use production as a test tenant. Only run a hosted test later if a no-cost isolated environment is already available.
- PR #67 is ready for review but remains unmerged. `main` uses Netlify as the primary frontend host; the Cloudflare deployment workflow is backend-only. A merge can start the Netlify Git-integrated Production build, so production release remains a separate approval gate.
- Supabase Free limitations (including the plan-gated leaked-password protection setting) remain plan-gated; do not upgrade the plan or add billing to close this test.
- Preserve the mandatory safety invariant: Exness Demo only, Read-only + AI Analysis, no broker order submission or position mutation, Live Trading OFF.

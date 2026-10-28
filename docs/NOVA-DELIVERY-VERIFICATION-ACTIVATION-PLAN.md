# NOVA Delivery, Verification, and Activation Plan

**Last reviewed:** 2026-10-28  
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
- [ ] Record the current state of Frontend CI, backend deployment workflow, Vercel project `voom_system_nova`, Cloudflare Workers, and Supabase migration state.
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

### Phase 4 — Provider configuration and Preview validation

- [ ] Verify Vercel project `voom_system_nova` uses the intended GitHub repository, frontend root directory, and intended branch.
- [ ] Verify required environment-variable **names and presence** without exposing values; never paste secret values in a PR or log.
- [ ] Confirm Cloudflare workflows deploy backend Workers only and do not inadvertently cut over the frontend host.
- [ ] Confirm expected Supabase Auth URLs/providers, migration state, RLS policies, and API exposure using the provider consoles.
- [ ] Review the exact Vercel build/deployment failure reason before retrying; do not treat a cancelled Preview or build-rate-limit/403 response as a successful build.
- [ ] Deploy only to Preview/staging during this phase. Verify the deployment commit SHA, project, provider status, and the relevant browser/API routes.

**Exit gate:** Correct source commit and intended project are verified; relevant Preview URLs respond as expected; private routes deny unauthenticated access; backend health and auth behavior match the security contract.

### Phase 5 — Read-only broker/Bridge verification

- [ ] Keep the broker request pending until a dedicated tenant route exists and passes verification.
- [ ] Confirm the local MT5 terminal is the intended **Demo** session using sanitized metadata only.
- [ ] Restore and verify the approved HTTPS tunnel/origin; confirm the route-map binding exists in the trusted secret store.
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
| P1 | Resolve frontend deployment/Preview blocker | Known blocker in prior deployment records; re-check current provider state | Diagnose exact Vercel status before retrying |
| P1 | Complete tenant route, Tunnel, and read-only Bridge checks (Issue #33) | Blocked until route/origin prerequisites pass | Follow Phase 5; do not mark connected early |
| P1 | Validate frontend/backend host split (Issue #30) | Maintain intended Vercel frontend + Cloudflare backend split | Verify commit and live routes per Phase 4 |
| P2 | Complete Auth/RLS, migration, and full security test coverage | Not complete until evidence is attached | Follow Phase 3 and only then enable the relevant read-only UI path |
| P2 | Production readiness review | Not ready by default | All applicable release gates must pass |

This queue is a starting snapshot, not proof of current provider status. Re-check GitHub Actions, Vercel, Cloudflare, and Supabase at the point each item is worked.

## 6. Definition of done

An item is done only when the code/configuration change is reviewed, relevant automated tests pass, applicable deny-case/security tests pass, provider/runtime evidence is recorded, documentation reflects the actual state, and no secret or unapproved live-trading capability was introduced.

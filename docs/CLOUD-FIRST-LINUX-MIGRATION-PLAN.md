# NOVA Cloud-First / Linux Migration Plan

- Date: 2026-11-05
- Status: Proposed migration plan; no runtime or hosted changes have been applied.
- Source of truth: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Main baseline: `6e8d390ac45187fb70b6acb23f1e428a20ca7006`
- Branch policy: PR only; never edit `main` directly.
- Cost policy: use existing free/zero-cost services and existing CI capacity; do not provision paid compute, trial credits, new cloud resources or billing.
- Production policy: no deployment, route/DNS, environment, secret, migration, database, storage or production configuration changes under this plan.
- Trading policy: Exness MT5 Demo remains read-only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

## 1. Decision

Move routine development, automated tests, builds and CPU-compatible research workflows away from the user's Windows workstation. Use GitHub-hosted Ubuntu runners as the first Linux execution environment and retain existing Netlify and Cloudflare responsibilities.

This is **not** a decision to create a permanent Linux VM or GPU machine. No always-on server is required for the first migration phase.

Windows is not a general NOVA development dependency. Keep the existing Windows MT5 Bridge only as a temporary, isolated Exness Demo data adapter until a supported alternative passes authenticated account/quote and tenant-isolation acceptance. Do not remove or replace that bridge based on a health-only check.

## 2. Verified repository baseline

The following were read from the current `main` commit:

| Area | Observed state | Migration implication |
|---|---|---|
| Root application | Vite + React + Express; `npm run dev` starts `tsx server.ts` | Node 22 Linux is a practical development/CI baseline |
| Root scripts | `dev`, `build`, `start`; no root test script declared | Add or retain explicit test commands by subsystem; do not assume one root test command covers all |
| Frontend hosting | Netlify builds with `npm run build`, publishes `dist`, Node 22 | Keep the current frontend host; no hosting cutover is needed |
| Existing CI | Frontend CI uses `ubuntu-latest`, Node 22, Node tests, Python checks, Wrangler dry-runs and Vite build | Linux CI already exists and should be the migration acceptance baseline |
| Cloud backend | Separate Cloudflare Worker configurations exist under `integrations/**` | Keep Worker deployments separate from Linux research jobs |
| Trading bridge | Existing Exness path uses Windows MT5 Bridge → Relay/Proxy → System Hub | Preserve until replacement acceptance is proven |

The root `server.ts` contains hard-coded illustrative market prices and research-scenario logic. Those values must not be treated as live market data or as proof of a broker connection during migration testing.

## 3. Target operating model

### 3.1 Development and verification

- GitHub is the source of truth; all code changes flow through short-lived branches and pull requests.
- GitHub Actions `ubuntu-latest` is the default clean Linux environment for lint, unit/contract tests, type checks, build and packaging.
- Pin Node to the repository's supported major (currently Node 22 in Netlify and CI); pin Python and package/tool versions where reproducibility requires it.
- Use lockfiles and deterministic install commands. Do not introduce dependency upgrades as part of an OS migration.
- Use disposable workspaces and CI artifacts for non-sensitive build outputs; never upload secrets, customer data, broker data or raw tokens as artifacts.
- Developers may use any OS as a client; Windows is no longer a required workstation for ordinary code changes.

### 3.2 Runtime boundaries

| Workload | Target | Guardrail |
|---|---|---|
| NOVA frontend | Existing Netlify site | No host migration in this plan |
| NOVA API / System Hub / edge services | Existing Cloudflare Workers | Worker limits apply; not a general Linux VM |
| CPU-first Video Engine | Existing project code + Linux CI tests | No model inference, media execution or upload until separately accepted |
| Trading data validation / backtests / classical ML | On-demand Ubuntu CI or approved ephemeral Linux runner | CPU-first; no always-on VM or paid GPU |
| Quantum circuit simulation | Optional CPU simulator in isolated research jobs | Simulation is not QPU execution or quantum advantage |
| Model training | Separate bounded Linux job only after dataset, provenance, compute, reproducibility and evaluation gates pass | No automatic promotion; no use of final OOS for tuning |
| Exness MT5 Demo | Existing Windows bridge temporarily | Read-only; no broker writes |
| Customer secret custody | Separate custody architecture / security boundary | Not moved to developer machine, CI artifacts or NOVA Core |

### 3.3 Project separation

NOVA Core remains the shared control plane. Trading remains a separate product/repository and runtime; Video remains a separately bounded product runtime. Project integrations must use versioned, authenticated NOVA contracts and server-derived identity/capabilities. Do not copy business logic, credentials, model checkpoints or product databases into NOVA Core.

## 4. Migration phases and gates

### Phase A — Inventory and Linux reproducibility (safe to perform in PRs)

1. Record each subsystem's entrypoint, supported Node/Python versions, dependency lock, environment variable *names* (never values), test command, build command and external service dependencies.
2. Ensure each supported subsystem can be installed and tested on a clean Ubuntu runner.
3. Add explicit CI path filters for any new Linux-only checks; avoid broad workflow rewrites.
4. Verify scripts do not rely on Windows paths, PowerShell, drive letters, case-insensitive filesystems or shell-specific behavior.
5. Test file permissions, executable bits, line endings, path case and timezone assumptions.
6. Keep CI credentials absent for untrusted PR code; use mock/local tests and Wrangler dry-run only.
7. Record exact-head CI evidence for each PR.

**Exit gate:** all selected tests and builds pass on exact PR head under Ubuntu; no secret-bearing integration or production side effect is involved.

### Phase B — CPU-first project workloads

1. Run deterministic Video Engine planning/contract tests on Linux; keep actual model inference and media processing blocked until worker isolation, model licensing and zero-cost compute are independently proven.
2. Run Trading data-quality checks, strategy unit tests and small deterministic backtests on CPU.
3. Add reproducible experiment manifests: source, immutable dataset snapshot/checksum, timeframe, symbol, feature/label versions, code SHA, dependency lock, seed, cost assumptions and metrics.
4. Keep final out-of-sample data sealed from tuning and model selection.
5. Label quantum backends honestly: classical baseline, analytic proxy, simulator or real QPU. Do not call a classical enumeration routine QAOA or a fixed heuristic trained QRL.
6. Keep daily training disabled until a trusted data source, schedule, resource bound, artifact retention, evaluation gate and failure alert path are tested.

**Exit gate:** reproducible Linux run with provenance and baseline comparison; no automatic model promotion and no paid compute.

### Phase C — Cloud service integration (review before activation)

1. Keep Netlify as frontend hosting and Cloudflare Workers as the existing edge/backend platform.
2. Validate Worker bundles with dry-run and local contract tests before any publish.
3. Use authenticated NOVA project contracts; never expose arbitrary URL proxying or client-selected tenant identity.
4. Require tenant-isolation tests, independent security review and exact-origin acceptance before publishing any new API.
5. Keep Supabase schema unchanged until migration history is reconciled and encrypted backup plus isolated restore are proven.
6. Do not move customer secrets into GitHub Actions, developer tooling, logs, model inputs or project repositories.

**Exit gate:** review-approved, reversible release plan with exact artifact SHA, security evidence, backup/restore evidence and a separate explicit production authorization.

### Phase D — MT5 bridge replacement (separate project)

Do not migrate or uninstall the current Windows MT5 Bridge yet. A replacement is acceptable only after all of the following are demonstrated in an isolated environment:

- authenticated `/api/account` and `/api/quotes` using the customer's actual owner session;
- canonical owner/tenant binding and foreign-tenant denial;
- read-only provider permissions and no order/withdraw/transfer capability;
- reconnect, stale-session, timeout and ambiguous-outcome behavior;
- rollback to the current Windows bridge without losing the verified data path.

A healthy process, open port, successful ping or generic health endpoint is not sufficient proof.

## 5. Backup and rollback

### Before each migration slice

- Capture current main SHA, PR head/base SHA and exact changed-file list.
- Preserve all uncommitted or untracked user work; never clean or overwrite a workstation workspace as part of this plan.
- Retain the current Windows MT5 bridge configuration and its known-good version until replacement acceptance.
- Keep existing Netlify and Cloudflare configuration unchanged.
- For data/schema changes, require exact migration history, verified encrypted backup and a successful isolated restore before any apply. This plan authorizes no data/schema change.

### Rollback

- Revert the individual PR or disable the new non-production workflow/job.
- Restore the prior pinned dependency/runtime version if a Linux compatibility change regresses.
- Keep existing frontend/backend hosts and current bridge path unchanged during early phases.
- Preserve sanitized CI logs and experiment metadata; do not delete user data or rewrite migration history.
- Do not roll back by force-pushing shared branches.

## 6. Explicitly out of scope

- Creating, purchasing or starting a Linux VM, GPU instance, QPU account or paid service.
- Production deployment, Worker publication, routes, DNS, secrets, environment variables or hosted configuration changes.
- Supabase migrations, SQL, grants, RLS, storage changes, backup exports or restore operations.
- Removing the Windows MT5 Bridge before its replacement passes the full acceptance gate.
- Broker credentials, order submission, execution, withdrawals, transfers or Live Trading.
- Daily model training activation or model promotion.
- Bulk workstation cleanup, deleting user files, killing processes or changing the user's Windows installation.

## 7. Immediate implementation sequence

1. Treat existing Ubuntu CI as the baseline; inspect and extend only the subsystem tests that currently lack Linux coverage.
2. Add Linux compatibility checks for case-sensitive paths, executable permissions and dependency reproducibility.
3. Separate CPU research jobs from edge Worker deployment workflows.
4. Publish a small Linux developer quick-start after validating exact commands on CI.
5. Run one isolated CPU-only Trading research job and one Video Engine contract-test job.
6. Review evidence before considering any runtime or hosting change.

## 8. Project update reconciliation — 2026-11-05

The following open PRs were visible during the latest repository review. These are parallel project changes, not merged main-branch capabilities:

| PR | Current scope/evidence | Cloud-first consequence |
|---|---|---|
| #226 | Linux path portability audit. Exact-head Frontend CI run 42023750031 passed, including path audit, tests, existing Node/Python contracts, Wrangler dry-runs and Vite build. Netlify production smoke test was skipped as expected for a PR. | First concrete Linux compatibility gate is green; still does not prove all subsystems are portable. |
| #225 | NOVA Project Contract v1; dedicated contract CI run 42023704572 passed. Its Frontend CI run 42023704611 was cancelled. Contract validates payload shape and server-owned project metadata only. | Project integration contract is a candidate, not yet an authenticated runtime boundary. Reconcile with #217/#218 before adoption. |
| #222 | CPU-first Video Engine Core plans scenes, workflow DAG and safe FFmpeg argument vectors. Its declared generation/export states remain blocked. | Suitable for CPU/Linux planning and contract tests only; not evidence of actual video rendering or inference. |
| #221 | NOVA-owned Video Engine Core; exact-head run 42021722349 passed 34 tests. Actual model inference is disabled; no verified free GPU/checkpoint. | Separate Linux CI can validate the engine contracts; actual Wan inference remains blocked. |
| #216 | Synthetic auto-training claims disabled; exact-head CI and Preview evidence are recorded in its PR. | Daily training remains unconfigured until authenticated data, lineage, reproducibility and out-of-sample gates exist. |
| #220 | Video migration runbook identifies unreconciled Supabase Production migration history and missing encrypted backup/restore evidence. | Do not apply Video or other Supabase migrations as part of Linux migration. |

### Newly confirmed reproducibility gap

The repository-root `package.json` has no corresponding root `package-lock.json`. The current root Frontend CI installs with `npm install --no-package-lock --include=dev`, so successful Ubuntu builds prove compatibility for that run but do **not** prove deterministic dependency resolution.

This is now an explicit Phase A blocker. The next safe implementation slice should create and review a root lockfile from the current package manifest in a clean Ubuntu environment, then switch only the root install step to `npm ci` after exact-head tests pass. Do not blindly generate or commit a lockfile from the full Windows workstation, and do not combine dependency upgrades with the lockfile change.

### Current migration evidence

- Main remains `6e8d390ac45187fb70b6acb23f1e428a20ca7006` at this review.
- PR #226 head `519ba67fbd590bc02c9a303b47e2b2516d096019`; compare: 4 commits ahead, 0 behind.
- PR #224 contains only this migration plan; compare: 1 commit ahead, 0 behind.
- PR #224 and #226 have no submitted reviews or inline review threads at this review.
- PR #226 exact-head Frontend CI: run `42023750031` SUCCESS; the production smoke job was skipped for the PR event.
- No merge, production deploy, Worker publication, hosted setting, secret, schema or data change is authorized by this migration plan.

## 9. Definition of done

The workstation is no longer required for routine NOVA development when a clean Ubuntu runner can reproduce install, test, build and package steps for every in-scope subsystem; PR evidence is exact-head and reproducible; no local Windows-only dependency remains except the explicitly isolated MT5 bridge; and rollback to the existing hosted services is documented and tested.

This plan is a controlled migration proposal. It does not claim that a Linux VM, production runtime, MT5 replacement, automatic training, AI video generation or quantum advantage is already running.

The workstation is no longer required for routine NOVA development when a clean Ubuntu runner can reproduce install, test, build and package steps for every in-scope subsystem; PR evidence is exact-head and reproducible; no local Windows-only dependency remains except the explicitly isolated MT5 bridge; and rollback to the existing hosted services is documented and tested.

This plan is a controlled migration proposal. It does not claim that a Linux VM, production runtime, MT5 replacement, automatic training, AI video generation or quantum advantage is already running.

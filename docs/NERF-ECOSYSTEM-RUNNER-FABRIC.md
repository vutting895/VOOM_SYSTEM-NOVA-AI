# NERF — NOVA Ecosystem Runner Fabric
## Phase 1 Inventory & Architecture Baseline

**Snapshot date:** 2026-11-26  
**Status:** Phase 1 inventory captured; architecture baseline drafted; implementation remains Development-only  
**Configuration selected:** Processing = Hybrid · Scope = All · Autonomy = Continuous  
**Safety:** Main branches are not modified by this change. No runner was installed, no service was started, no paid service was enabled, and no broker/live-trading action was performed.

---

## 1. Executive finding

The ecosystem already has multiple GitHub Actions workflows and a small set of runner/retry utilities, but it does not yet have a verified cross-repository runner fabric. The present state is **federated CI, not a unified NERF control plane**.

The evidence supports a hybrid design:
- Keep GitHub-hosted runners as the default ephemeral CI/build pool.
- Treat the existing Windows MT5 workstation as a **candidate local execution host**, not an installed self-hosted runner.
- Treat Kaggle/Colab as on-demand research compute, not a persistent NERF runner.
- Keep Core Brain and Affiliate as separate security and data domains; a common scheduler must not imply shared secrets, workspace access, or deploy authority.

Do not add another permanent runner until the failure modes and account policies are understood. The recent failures are not one common runner problem: NOVA has successful runner allocation and a test failure, while Core Brain and Affiliate recent runs show failures before any step records were available.

## 2. Repository baseline (repo-first)

| Repository | Visibility | Default branch | Main SHA at inspection | Main protection API |
|---|---|---|---|---|
| `vutting895/VOOM_SYSTEM-NOVA-AI` | Public | `main` | `821db357d70d3613b0ca61520eaae5c5307e8fd4` | `protected=false` |
| `vutting895/voom-core-brain-` | Private | `main` | `2cf97ad7ec0a27fe070abb43c8352ae7d292a1db` | `protected=false` |
| `vutting895/Voom-studio-affiliate-` | Private | `main` | `a3404d2bdd8df51fbc3e83eb5f7c7594605d2f2d` | `protected=false` |

All three repositories report owner-level admin/push access for the connected GitHub identity. The repository owner is a personal account in the inspected repository metadata; no shared organization runner group was verified. Do not assume organization-wide runner sharing.

### Existing development references
- NOVA: current NERF work branch is created from the inspected Main SHA: `dev/nerf-ecosystem-runner-fabric-20261126`.
- Core Brain: `dev/core-brain-bootstrap` at `4589d9b72d6b9c2e5fa9a0b9db40464a5debe3f3`; `dev/nova-adaptive-learning-engine` at `9ca875f7f8877c3c96f8644e62b83672d0510964`.
- Affiliate: existing PR branches include runner recovery/diagnostic work; do not port or merge those branches wholesale into NOVA.

## 3. Runner and workflow inventory

### 3.1 NOVA System Core
Observed workflow files on Main (12):
- `ai-worker-deploy.yml`
- `cloudflare-deploy.yml`
- `frontend-ci.yml`
- `kaggle-api-readonly-check.yml`
- `kaggle-daily-ingestion.yml`
- `nova-approval-migration-ci.yml`
- `nova-ci-inspector-tests.yml`
- `nova-command-center-ci.yml`
- `nova-video-migration-ci.yml`
- `quant-engine-foundation-ci.yml`
- `smc-research-ci.yml`
- `windows-runtime-ci.yml`

Evidence:
- Run [45683589832](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/45683589832), Quant Engine Foundation CI, SHA `5a308a27299057d9ad41969614b32c8d72d60761`: runner setup, checkout, Python setup and compile passed; the contract-test step failed. This is a **test failure after runner allocation**, not evidence of a runner-provisioning failure.
- Run [45683702772](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/45683702772), SMC Research CI, SHA `eb36302d0044062631c454ef8e17b063771ac495`: runner was allocated; focused tests, regression tests, Docker Compose validation and research-worker container build had passed at inspection; frontend container build was still in progress. Do not record the run as passed.
- `workers/jobs/runner.py` already provides bounded retries, timeouts, freshness checks and secret masking. It is a job-execution helper, not a cross-repository dispatcher, durable queue, lease manager, or runner daemon.
- `windows-runtime-ci.yml` uses `windows-latest` for static PowerShell parsing and read-only bridge safety assertions.
- `kaggle-daily-ingestion.yml` uses GitHub-hosted Ubuntu to download data through Kaggle CLI and upload an artifact. This is not proof that a Kaggle compute runtime is attached to NERF.

### 3.2 Core Brain
Evidence:
- Main SHA: `2cf97ad7ec0a27fe070abb43c8352ae7d292a1db`.
- Recent run [45683685537](https://github.com/vutting895/voom-core-brain-/actions/runs/45683685537), branch `dev/core-brain-bootstrap`, SHA `4589d9b72d6b9c2e5fa9a0b9db40464a5debe3f3`: workflow failed; the Jobs API returned no step records for job `139450534529`.
- Earlier ALE branch runs [45681217803](https://github.com/vutting895/voom-core-brain-/actions/runs/45681217803) and [45681208682](https://github.com/vutting895/voom-core-brain-/actions/runs/45681208682) also failed without recorded steps in the earlier audit.
- Current evidence does not identify the underlying cause. Treat as **runner allocation / pre-step failure suspected, root cause unknown** until Check Run annotations or GitHub Support confirms it. Do not label it billing/quota failure without evidence.

### 3.3 VOOM Studio Affiliate
Evidence:
- Main SHA: `a3404d2bdd8df51fbc3e83eb5f7c7594605d2f2d`; repository is private.
- Main has one workflow, `.github/workflows/affiliate-ci.yml`: GitHub-hosted `ubuntu-latest`, Bun install, lint, tests, frontend build and Docker image build.
- Recent run [45217836790](https://github.com/vutting895/Voom-studio-affiliate-/actions/runs/45217836790), PR #66 head SHA `60e551eaf48b4f1bdc4139c03601d515e5850414`: job `137868413079` failed and the Jobs API returned no step records.
- Affiliate already has `docs/verification/GITHUB-ACTIONS-RUNNER-RECOVERY.md` and `scripts/diagnose-actions-runner.mjs`. The diagnostic classifies jobs with no runner identity and no steps as `PRE_RUNNER_FAILURE`, checks log archive availability and reads Check Run annotations with redaction. Reuse this diagnostic pattern; do not duplicate its implementation into NOVA.
- Affiliate remains a separate product, deployment and secret boundary. NERF may route jobs across repositories, but must not combine repository credentials, artifacts or release authority.

### 3.4 Existing Windows host
Read-only inspection of Desktop Commander device `10_3_6_9`:
- Online Windows host; Node.js `26.13.1`, Python `3.14.10`.
- Desktop Commander reports Docker is not installed/available on this host.
- Allowed directories include MT5 Common Files export, MT5 scripts/logs and `C:\Users\Administrator\Documents\NOVA-DEV`.
- A read-only PowerShell probe found no service matching `actions.runner` / “GitHub Actions Runner” and no `Runner.Listener` / `Runner.Worker` process. This host is **not currently verified as a GitHub self-hosted runner**.
- MT5 terminal processes are present. Therefore this machine must not be treated as a generic untrusted-code CI worker. Any future Windows pool must use a separate low-privilege account/workspace and must never receive broker execution credentials.
- No installation or configuration change was made.

## 4. Inventory conclusions

| Pool | Current evidence | NERF classification | Decision |
|---|---|---|---|
| GitHub-hosted Linux | Active NOVA workflows; successful runner allocation observed | Available, repository-scoped ephemeral pool | Use as default CI pool |
| GitHub-hosted Windows | NOVA Windows workflow targets `windows-latest` | Available through hosted workflow only | Use for Windows CI; not a persistent local runner |
| Local Windows / MT5 | Online host; no Actions runner service/process | Candidate local execution host only | Do not install in Phase 1 |
| Kaggle / Colab | Kaggle CLI ingestion workflow; separate notebook usage | On-demand research compute, not persistent worker | Require explicit job adapter and artifact contract later |
| Local Linux / Docker | No verified local Linux worker; Windows host reports Docker unavailable | Not available as local pool | Do not assume |
| Cross-repo dispatcher / durable queue | No verified shared NERF control plane | Missing | Design and build in later phases |

## 5. NERF target architecture

### Control plane
1. **Job Intake** — accept only signed/authorized job requests from allowlisted repository events.
2. **Policy Engine** — enforce repository, branch, job type, cost, secret scope, safety and autonomy policies before enqueue.
3. **Queue + Lease Registry** — durable state machine, idempotency key, claim lease, heartbeat, expiry and cancellation.
4. **Capability Router** — select Linux, Windows, research or build pool from declared capabilities and trust level.
5. **Evidence Verifier** — verify exact repository, commit SHA, workflow ref, runner identity, exit code, tests, artifact hashes and redaction.
6. **Recovery Manager** — retry only idempotent jobs; never retry a timed-out task while an uncancellable process may still be running.
7. **Audit Ledger** — append-only job events and evidence references; never store secret values.

### Execution pools
- **R1 — GitHub-hosted CI:** default for lint, unit tests, compile, contract checks and isolated builds.
- **R2 — Windows local:** future opt-in worker for MQL5/MT5-specific tasks only; separate OS account, dedicated workspace, explicit job allowlist, no fork/untrusted PR code.
- **R3 — Research compute:** on-demand Kaggle/Colab jobs with pinned datasets and immutable artifacts; not a persistent runner and not an unattended production training authority.
- **R4 — Build/package:** ephemeral Linux/Windows builds using hosted runners unless a verified free local host becomes available.

### Required Job lifecycle
`REQUESTED → POLICY_APPROVED → QUEUED → CLAIMED → RUNNING → VERIFYING → SUCCEEDED`

Terminal alternatives: `FAILED`, `CANCELLED`, `EXPIRED`, `REJECTED`. A job cannot become `SUCCEEDED` from a queue acknowledgement alone.

### Required evidence envelope
Every job must record:
- `job_id`, idempotency key, repository, owner, branch, exact commit SHA and workflow file SHA;
- job type, declared capabilities, trust class, policy decision and policy version;
- runner pool, runner identity/labels, start/end time, lease/heartbeat history;
- exit code, test report, redacted log reference, artifact URI and SHA-256 manifest;
- retry history, cancellation/timeout reason and verifier result.

No secrets, broker credentials, raw tokens or personal account data may appear in the job envelope or artifacts.

## 6. Continuous autonomy boundaries

Continuous autonomy is approved only for offline, allowlisted automation:
- enqueue and route CI, lint, tests, compile, static analysis and artifact verification;
- retry idempotent failures within a fixed attempt/time budget;
- stop stale jobs, recover expired leases and publish evidence;
- create/update Development-branch artifacts and Draft PRs when explicitly permitted by repository policy.

It does **not** authorize:
- writing to or merging into `main`;
- changing repository permissions, branch rules, secrets, billing or account plans;
- installing or enabling self-hosted runner services;
- enabling paid compute, Cloudflare Containers, paid queues or paid APIs;
- production deployments, database migrations or secret rotation;
- broker order placement, account modification or Live Trading.

Trading hard-disable remains mandatory: `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`. NERF jobs must not receive credentials or network routes capable of bypassing this boundary.

## 7. Security and reliability requirements

- Deny by default; allowlist repository + branch + job type + runner capability.
- Never execute fork PR code on a self-hosted runner.
- Exact-commit checkout; fail if the fetched SHA differs from the requested SHA.
- Separate workspaces and credentials for NOVA, Core Brain and Affiliate.
- Read-only GitHub permissions by default; write permission only for a narrowly scoped Development-branch action.
- Concurrency groups and per-repository quotas to avoid CI storms.
- Retry only idempotent tasks. A timeout with uncertain process termination is non-retryable until the worker is confirmed stopped.
- Redact secrets before logs/artifacts leave the runner.
- Verify artifact hashes before any downstream consumer uses them.
- Manual approval required for runner installation, paid services, deployment, migrations, policy changes or any execution-related capability.

## 8. Phased implementation plan

| Phase | Deliverable | Gate |
|---|---|---|
| 1 — Inventory (this phase) | Repository/runner/workflow inventory, evidence baseline, architecture and risk register | Evidence linked; no Main changes |
| 2 — Job Contract | Versioned JSON Schema, trust classes, idempotency, lifecycle and evidence envelope; unit tests | Schema validation and adversarial tests pass |
| 3 — GitHub Adapter | Read-only run discovery + allowlisted Development-branch dispatch adapter | Exact-SHA and permission tests pass; no Main dispatch |
| 4 — Queue/Lease | Durable queue/lease abstraction with replay and crash recovery tests | Duplicate delivery and stale-lease tests pass |
| 5 — Windows Adapter | Design/test in isolated workspace; installation only after separate explicit approval | No MT5 terminal interference; no broker execution capability |
| 6 — Research Adapter | Kaggle/Colab job contract and immutable artifact import | Provenance, data hashes and OOS boundaries verified |
| 7 — Ecosystem Rollout | NOVA, Core Brain and Affiliate adapters independently enabled | Per-repo security and cost acceptance signed off |

## 9. Phase 1 acceptance status

- [x] Confirm canonical repositories and Main SHAs.
- [x] Inventory visible GitHub Actions workflows and selected recent run outcomes.
- [x] Inspect current Windows host configuration and runner process/service presence.
- [x] Identify existing retry utility and Affiliate runner diagnostics for reuse.
- [x] Create a fresh Development branch from the current NOVA Main SHA.
- [x] Record architecture, security boundaries, evidence envelope and phase gates.
- [ ] Verify Core Brain failure root cause from Check Run annotations / GitHub Support.
- [ ] Verify Affiliate failure root cause from Check Run annotations / GitHub Support.
- [ ] Obtain exact-head CI result for this NERF documentation branch.
- [ ] Do not proceed to runner installation or paid services in Phase 1.

**Phase 1 status:** Inventory and architecture baseline drafted. CI root causes remain partly unknown. This is not a production-ready runner fabric and no runtime dispatcher/queue has been implemented.

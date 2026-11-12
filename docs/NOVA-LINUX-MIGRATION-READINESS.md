# NOVA Linux Migration Readiness, Backup & Rollback

**Evidence date:** 2026-11-12  
**Status:** Readiness plan only — migration, backup export, restore, deployment and provider configuration changes have NOT been performed.  
**Canonical repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Canonical branch:** `main`  
**Inspected main SHA:** `1604dab1083e6eedc21d23dfc959b79991e90636`  
**Production Supabase project:** `Voom_system` / `tlyyxufuiimrbaksoitf`  
**Cost policy:** zero additional spend; do not provision paid compute, hosted branches, new resources or billing.  
**Trading policy:** Exness Demo only; read-only; `ordersEnabled=false`, `executionEnabled=false`, `liveTradingEnabled=false`.

## 1. Executive decision

NOVA is **not ready for Linux runtime cutover**.

The connected provider inventory confirms Cloudflare Workers, Netlify hosting and the Supabase Production database. It does not establish a NOVA-owned Linux VPS/VM, active NOVA Sprite, working GitHub-hosted Ubuntu runner, active Codespace, or running Linux MT5 engine.

The safe target is a staged migration:
1. Keep Netlify as the frontend host and Cloudflare Workers as the edge/backend layer.
2. Use a reproducible, on-demand Linux environment for development and CPU-compatible tests.
3. Keep the Windows Exness Demo Bridge as the rollback path until the Linux replacement passes authenticated account/quote reads and tenant-isolation acceptance.
4. Do not move production data or schema until a verified backup and isolated restore drill exist.

This plan does not authorize production deployment, Worker publication, route/DNS changes, secret changes, database migrations, data writes, broker writes or Live Trading.

## 2. Evidence-backed infrastructure inventory

| Area | Evidence observed on 2026-11-12 | Assessment |
|---|---|---|
| GitHub repository | Private repository; default branch `main`; inspected SHA above | Source of truth |
| GitHub Actions | Issue #264 records jobs failing before runner assignment; `runner_id=0`, no steps | Linux CI execution blocked; cause not proven |
| Ubuntu Linux CI | Existing workflows declare `runs-on: ubuntu-latest` | Configuration exists; current runner availability is not proven |
| Linux Dev Container | PR #253 branch contains Node 22 Bookworm, Bun and Python 3.12 devcontainer | Candidate only; not merged or launched |
| Linux portability audit | PR #226 contains path audit and Ubuntu workflow changes | Candidate is stale relative to current main |
| Root dependency lock | Main contains `bun.lock`; no root `package-lock.json`; Frontend CI currently runs `npm install --no-package-lock` | Package-manager reproducibility decision required |
| Root Dockerfile | Main contains a Node 22 Alpine build/runtime Dockerfile | Container definition exists; not proof of a running NOVA Linux host |
| MT5 Headless Docker | PR #51 describes a Wine/Xvfb Linux bridge and contract CI | Draft/candidate; no real Linux MT5 login or authenticated tenant E2E proof |
| Cloudflare | Connected account exposes 13 Worker scripts; MT5 Relay/Proxy deployment metadata is dated 2026-10-29; System Hub latest listed deployment is 2026-11-01 | Edge services exist; not a general-purpose Linux VM |
| Netlify | Site `voomsystem`, Free team; PR #308 Preview is READY at commit `b94b21cbeff9ba9b33bbffdd804f7ab39db45823` | Preview only; not Production release evidence |
| Supabase Production | `Voom_system` is ACTIVE_HEALTHY, PostgreSQL 17.11, region `ap-southeast-1`, Free organization | Production database exists; backup/restore not verified |
| Supabase branch metadata | Listed branch `main` reports `MIGRATIONS_FAILED`; preview project status reports `ACTIVE_HEALTHY` | Reconcile before branch use; do not infer Production is failed |
| Sprites | Only listed Sprite is `chatgpt-fly-mcp-voom-studio-affiliate`, status COLD | Affiliate resource, not NOVA |
| Fly.io | No Fly account connector/API was available in this audit | NOVA Fly resource state unverified |
| Colab/Kaggle | Repository contains Kaggle training work; no connected notebook runtime or active training job was verified | Training runtime unverified; do not claim a live Linux notebook |

Provider reads were metadata/read-only checks. No secret values were retrieved or displayed.

## 3. Stale candidate branches — do not merge as-is

Comparisons below use inspected current `main` SHA `1604dab1083e6eedc21d23dfc959b79991e90636`.

| Candidate | Ahead / behind | Changed scope | Required action |
|---|---:|---|---|
| PR #253 — Linux Dev Container | 1 / 72 | `.devcontainer/devcontainer.json` | Recreate/rebase a clean candidate from current main; build in a real compatible runtime |
| PR #224 — Cloud-first plan | 2 / 132 | Migration plan documentation | Reconcile against current architecture and evidence; do not merge stale snapshot |
| PR #226 — Linux portability | 4 / 132 | Workflow + path audit + tests | Rebase/cherry-pick narrowly; require exact-head Ubuntu execution |
| PR #228 — npm lockfile | 2 / 132 | Workflow + generated package-lock | Do not merge blindly; choose one package-manager strategy against current `package.json` and `bun.lock` |
| PR #303 — Backup manifest/runbook | 9 / 5 | Backup workflow, helper, tests, runbook | Do not merge; rebase and correct project-scope contamination first |

### Critical PR #303 review finding

The proposed NOVA backup runbook names Production project ref `tlyyxufuiimrbaksoitf`, but its project-specific inventory section describes an `affiliate_state_snapshots` table. That is inconsistent with the NOVA Production inventory and indicates cross-project content contamination.

The PR #303 exact-head Backup Manifest CI run `43068563352` failed with an empty step list; no tests ran. The branch is also 5 commits behind current main. Treat the implementation as unverified and do not merge or use it for Production backup until the cross-project content is corrected and exact-head checks actually execute.

## 4. Backup gate — mandatory before any data/schema migration

### 4.1 Inventory first

For the exact Production project ref `tlyyxufuiimrbaksoitf`, record a timestamped inventory of:
- PostgreSQL version, schemas, tables, row counts, extensions, constraints and indexes.
- RLS enabled state, policies, grants and security-sensitive functions/RPCs.
- Supabase migration ledger compared with repository migration files.
- Storage buckets and object inventory, if any.
- Edge Function source/version inventory.
- Provider configuration and secret *names/presence only*; never export or print secret values.
- Relevant Cloudflare Worker names, deployment/version IDs, bindings metadata and route ownership; never read secret material.

A migration list is not a database backup. Do not infer schema completeness from the migration ledger alone.

### 4.2 Logical backup artifacts

After the inventory is reviewed, perform a read/export-only logical backup using a secured Linux environment and Supabase CLI v3, always targeting the exact project ref. Export separately:
- Roles.
- Database schema.
- Application data.
- Supabase migration-history schema and data as paired supplemental artifacts.

Use a private directory outside the repository, restrictive file permissions and secure CLI authentication. Do not place database URLs, passwords, service-role keys, access tokens or broker credentials in source control, chat, shell history or logs.

A logical dump does not automatically include Supabase-managed Auth/Storage schemas, Storage object bytes, extension-owned schemas, Edge Function source, project secrets or provider-side settings. Track these as separate recovery domains.

### 4.3 Integrity and archive

- Generate a SHA-256 manifest over the completed artifacts.
- Verify every artifact and manifest after copying.
- Encrypt the archive before transfer; keep encryption keys separately.
- Store a second copy in a separate access-controlled location.
- Record archive provider, object/version ID, retention and read-back evidence.
- Do not claim immutability without a demonstrated write-once or equivalent retention control.
- Do not delete working copies until the independent copy has been read back and verified.

### 4.4 Restore drill

- Restore only into a disposable local Supabase/Docker environment or a separately approved non-Production target.
- Do not create a hosted Supabase branch/project under the zero-additional-spend constraint without checking cost and obtaining explicit approval.
- Verify PostgreSQL major version, extensions, schema, row counts, constraints, indexes, RLS, policies, grants, migration lineage and representative data checksums.
- Run owner-access and foreign-tenant-denial tests.
- Record tool versions, target identity, start/end time, results and sanitized logs.

**Production restore is prohibited as a test.**

## 5. Rollback design

| Change class | Rollback method | Gate |
|---|---|---|
| Linux developer tooling | Revert the isolated PR; retain prior CI path until new path is proven | No shared dependency or runtime change |
| Package manager/lockfile | Revert only the lock/install change; restore the prior pinned workflow | Exact-head clean install/build must pass first |
| Netlify frontend | Keep the prior known-good Production deploy and exact deploy ID/SHA; use provider rollback only after confirming target | Preview and route/auth acceptance |
| Cloudflare Workers | Preserve current deployed version IDs and deployment metadata; rollback only through reviewed provider release procedure | Exact worker/version and health/auth checks |
| Supabase schema/data | No schema/data change until encrypted backup, hash verification and isolated restore pass; prefer reviewed forward-fix for additive migrations | Restore drill and migration-lineage review |
| MT5 Bridge | Keep existing Windows Bridge available and unchanged until Linux candidate passes all acceptance tests | Authenticated Demo account/quote reads, reconnect and foreign-tenant denial |

Never use force-push, delete user data, overwrite an unreviewed workspace, or restore into Production as a shortcut.

## 6. Migration phases and exit gates

### Phase 0 — Freeze and baseline
- Record current main SHA, candidate PR heads/bases, exact changed files and provider deployment IDs.
- Keep current Netlify, Cloudflare, Supabase and Windows Bridge configuration unchanged.
- Preserve local/untracked work; no cleanup or overwrite.

**Exit:** inventory reviewed and rollback references recorded.

### Phase 1 — Backup and restore readiness
- Correct the PR #303 project-scope contamination.
- Reconcile the live Production migration ledger with repository migrations.
- Create and verify encrypted logical exports and independent archive copy.
- Complete an isolated restore drill.

**Exit:** backup integrity PASS and isolated restore PASS. Until then, no Production schema/data migration.

### Phase 2 — Linux development reproducibility
- Rebase the Dev Container and portability candidates on current main.
- Choose one canonical package manager and lockfile strategy; do not mix npm/Bun installation semantics without an explicit decision.
- Pin Node/Python/Bun versions and run clean install, tests, lint/typecheck and build on a real Ubuntu runner.
- Resolve GitHub Actions runner allocation under the existing zero-additional-spend policy.

**Exit:** exact-head Linux jobs have non-zero runner IDs, inspectable steps/logs, and all required checks pass.

### Phase 3 — CPU research workloads
- Run only deterministic CPU-compatible tests/backtests.
- Require immutable dataset hashes, provenance, dependency lock, code SHA, seed, cost assumptions and evaluation metrics.
- Keep training and model promotion disabled until dataset, OOS and human-approval gates pass.

**Exit:** reproducible Linux run with evidence; no synthetic data and no automatic promotion.

### Phase 4 — Headless MT5 candidate
- Review the Linux/Wine/Xvfb image security, provenance, vulnerability status and startup behavior.
- Test authenticated Exness Demo account/quotes with the actual owner session.
- Test anonymous denial, foreign-tenant denial, reconnect, stale session and timeout behavior.
- Confirm no order/position mutation routes or execution flags are enabled.

**Exit:** isolated staging acceptance passes and rollback to Windows Bridge is demonstrated.

### Phase 5 — Production cutover
- Require independent review, exact-head CI, verified backup/restore, deployment preview, provider commit reconciliation and explicit production approval.
- Change one subsystem at a time; retain prior provider version and rollback reference.
- Re-run post-change health, authentication, tenant isolation and read-only broker checks.

**Exit:** evidence-backed production acceptance. This document alone does not authorize cutover.

## 7. Current blockers / decisions

1. GitHub Actions runner allocation remains blocked under Issue #264; no test pass may be inferred from runnerless jobs.
2. PR #253, #224, #226 and #228 are stale relative to current main.
3. PR #303 has a cross-project inventory mismatch and unexecuted exact-head CI.
4. Main currently has `bun.lock`, but Frontend CI and root Dockerfile use npm install without an npm lockfile. Select and validate one reproducible install strategy.
5. No NOVA Linux VM/VPS, active NOVA Sprite, active Codespace or live Linux MT5 engine was verified.
6. Supabase Production backup artifacts, encrypted archive and isolated restore are not evidenced.
7. Supabase branch metadata reports `MIGRATIONS_FAILED`; resolve before branch use.
8. Netlify PR Preview readiness is not Production commit verification.
9. The current Windows MT5 Bridge remains the fallback until Linux replacement acceptance passes.

## 8. Change log

- 2026-11-12: Created this readiness plan from read-only GitHub, Cloudflare, Netlify, Supabase and Sprites evidence.
- No source code, hosted settings, secrets, database rows, migrations, backups, deployments, broker settings or trading flags were changed.

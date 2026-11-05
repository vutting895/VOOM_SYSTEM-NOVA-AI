# NOVA Video CI — Zero-Cost Runner Recovery

## Verified observations (2026-11-05)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI` (private).
- Latest verified PR #215 head at time of this note: `6936c217423389c09672ed4c36002b41e51a31eb`.
- On exact PR #215 head `6936c217423389c09672ed4c36002b41e51a31eb`, API, Engine Core, Frontend and Migration jobs failed before any step ran:
  - Engine Core [#42073987413](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42073987413)
  - Video API [#42073987423](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42073987423)
  - Frontend [#42073987415](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42073987415)
  - Migration [#42073987405](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42073987405)
- All four exact-head job records have no step entries; direct log requests return `BlobNotFound`. These runs do not validate the new Wan path, free-VRAM or hard process-isolation gate tests.
- Exact-head Netlify Deploy Preview [`6aecbb51b9fe83b2021cfbf6`](https://app.netlify.com/sites/b6a30a12-d976-464b-8d83-c59809519ef2/deploys/6aecbb51b9fe83b2021cfbf6) has `commit_ref=6936c217423389c09672ed4c36002b41e51a31eb` but was still `new` at the latest read; Preview is not READY.
- Wan hardening in this head: check 24,000 MiB **free** VRAM (not total), validate every output-directory component before generation, and a hard-coded `WAN22_PROCESS_ISOLATION_IMPLEMENTED=false` gate that blocks inference regardless of caller flags. Regression tests were added, but no exact-head CI run has executed their steps yet.
- GitHub REST job records returned `runner_id: 0`, `runner_name: ""`, and `steps: []`. API/Engine/Migration jobs completed within roughly 2–3 seconds of being created. The Actions job-log endpoint returned `BlobNotFound`; no step-level error text was available.
- GitHub's public status page reported Actions Operational and no incident on November 5, 2026.
- The GitHub connector confirms repository Admin/Push permissions for the authenticated owner, but cannot read the account's private Billing usage or spending-limit screen.

These observations mean **the jobs were rejected before a hosted runner executed the workflows**. They do not establish whether the specific cause is exhausted included compute, an account Usage blocked/spending-limit state, or repository Actions policy. Do not label this a source-code test failure because the test steps did not start; do not label it a GitHub-wide outage because public status was Operational.

## No-cost diagnostic steps

1. In the account that owns this private repository, open **GitHub Settings → Billing and licensing → Usage** (menu labels can vary). Inspect Actions included compute, current usage, reset date, and any `Usage blocked` or spending-limit notice. GitHub's published included-usage table currently lists 2,000 Actions minutes/month for GitHub Free personal accounts and 3,000 for GitHub Pro; confirm the actual owner plan rather than assuming it.
2. Do not add a payment method, increase a spending limit, enable overage, or change repository visibility for this project. Keep the repository private.
3. In the repository, open **Settings → Actions → General**. Confirm Actions are enabled for the repository and that the permitted actions/runners policy allows the existing workflow.
4. If private-repository included compute is exhausted or the account is blocked, wait for the next included-usage reset or use a machine owned by the project as a self-hosted runner. GitHub documents that private repositories draw hosted-runner usage from plan allowances and that self-hosted runners are not billed as GitHub-hosted runner compute.
5. Only after a self-hosted runner is registered and online should workflow files be changed from `ubuntu-latest` to its exact labels. No workflow has been switched to self-hosted in this PR because no runner is currently verified as available.

Official documentation:
- https://docs.github.com/en/actions/concepts/billing-and-usage
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/billing/reference/product-usage-included
- https://docs.github.com/en/actions/hosting-your-own-runners

## Self-hosted runner safety requirements

If a trusted machine is made available:
- Register a repository-scoped runner or a dedicated runner group; do not use a broad organization-wide runner.
- Prefer an ephemeral/disposable runner image or VM and destroy/reimage it after the job.
- Do not store production credentials, API keys, Supabase service-role keys, signing secrets, or model-provider secrets on the runner.
- Keep workflow permissions at least privilege (`contents: read` for CI).
- Do not run untrusted fork code or arbitrary externally supplied PR workflows on a persistent machine.
- Do not upload secrets, workspace dumps, caches containing secrets, or user media as CI artifacts.
- Keep model download, GPU inference, media upload, deployment and Production migrations out of CI.

## Current exact-head safety state

- PR #215 remains OPEN / DRAFT on exact head `6936c217423389c09672ed4c36002b41e51a31eb`, based on main `6e8d390ac45187fb70b6acb23f1e428a20ca7006`.
- Wan local runtime now uses free-memory threshold, validates output-directory symlink/permissions before provider spawn, and hard-blocks all inference with `wan22_process_isolation_not_implemented`. This hard block must remain until an ephemeral sandbox with process-tree termination, CPU/RAM/GPU limits, disk quotas, and network/credential isolation has been implemented and verified.
- The migration `20261105143000_nova_video_preparation_approval.sql` is a staging candidate only. Production migration history reconciliation and encrypted backup/restore have not been passed. Do not apply it.
- Netlify Preview is Frontend-only; it does not publish the Cloudflare Worker or validate API routes.

## NOVA Video release gate

Until exact-head API/Engine/Frontend/Migration jobs have actually run and passed:
- PR #215 remains Draft.
- Do not merge or deploy the Worker.
- Do not apply the Production Migration.
- Do not connect the frontend Save/Approval actions to a deployed endpoint.
- The `/video` workspace remains a local-only Director Draft and JSON export tool.
- Generate Video remains disabled and no MP4 generation is claimed.

A successful hosted Actions run must show real job steps on the exact PR head. A job that exits with `runner_id: 0` and no steps is not CI evidence.

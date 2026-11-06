# NOVA Video CI — Zero-Cost Runner Recovery

## Verified observations (2026-11-06)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI` (private; default branch `main`).
- Main SHA verified before this inspection: `6e8d390ac45187fb70b6acb23f1e428a20ca7006`.
- PR #215 source head reviewed immediately before this documentation correction: `3bc42dadcf8ea36952217ed29d4e6da9431e32d6`, based on the verified main SHA above. This documentation-only correction creates a new PR head; all new-head CI must run again and must not be inferred from earlier evidence.
- On source head `3bc42dadcf8ea36952217ed29d4e6da9431e32d6`, the four relevant Actions jobs failed before a hosted runner executed any workflow step:
  - Engine Core [Run #42130443546](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42130443546), job `127640767084`.
  - Video API [Run #42130443522](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42130443522), job `127640783421`.
  - Frontend [Run #42130443436](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42130443436), job `127640738605`.
  - Migration [Run #42130443535](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42130443535), job `127640750932`.
- Each of those four exact-head job records has `runner_id: 0`, an empty `runner_name`, and `steps: []`. The Frontend job completed in roughly 3 seconds; the three other job records have the same pre-runner signature. There is no step-level test output, so these runs do not pass or fail the source tests.
- The Netlify Preview previously inspected was built for an older PR #215 commit (`6936c217423389c09672ed4c36002b41e51a31eb`) and was still in state `new`. It is stale and is not Preview evidence for the source head above. No current-head Worker deployment or MP4 runtime evidence exists.
- The observed failure is a runner-admission failure. It does not establish whether the root cause is exhausted included compute, an account Usage blocked/budget state, repository Actions policy, or another account-specific restriction. Do not label it a source-code test failure or a GitHub-wide outage without additional evidence.

## No-cost diagnostic steps

1. In the personal account that owns this private repository, open **Settings → Billing & Licensing** and inspect Actions included compute, current usage, billing-cycle reset date, and any usage-blocked or budget notice. The current GitHub included-usage table expresses compute as a dollar-denominated allowance rather than a fixed monthly minute count: the published table lists **$12/month for GitHub Free personal accounts** and **$18/month for GitHub Pro**. Verify the actual owner plan and displayed balance; do not assume either value applies. Included compute can be shared with cloud sandbox compute and memory.
2. GitHub documents that if the account has no valid payment method on file, usage is blocked after included compute is consumed. Do **not** add a payment method, increase a budget, enable overage, upgrade a plan, or change repository visibility for NOVA. Record the displayed allowance, usage and reset date only.
3. In the repository, open **Settings → Actions → General**. Confirm Actions are enabled and inspect the allowed actions and runner restrictions. Do not relax security policy merely to force a run.
4. If included compute remains available and the repository policy permits the current `ubuntu-latest` runner, escalate the exact run/job IDs above to GitHub Support. Include repository visibility, branch/head SHA, timestamps, `runner_id=0`, empty runner names, and empty steps. Ask Support to identify the specific runner-admission rejection reason.
5. Do not switch workflows to self-hosted runners until a trusted project-owned machine/VM is explicitly selected, registered, hardened and verified online. A self-hosted runner avoids GitHub-hosted runner compute charges but the host itself may still have operating costs.

Official documentation:
- https://docs.github.com/en/actions/concepts/billing-and-usage
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/billing/reference/product-usage-included
- https://docs.github.com/en/actions/hosting-your-own-runners
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository

## Self-hosted runner safety requirements

If a trusted machine is made available later:
- Register a repository-scoped runner or dedicated runner group; do not use a broad organization-wide runner.
- Prefer an ephemeral/disposable runner image or VM and destroy/reimage it after each job.
- Do not store production credentials, API keys, Supabase service-role keys, signing secrets, or model-provider secrets on the runner.
- Keep workflow permissions at least privilege (`contents: read` for CI).
- Do not run untrusted fork code or arbitrary externally supplied PR workflows on a persistent machine.
- Do not upload secrets, workspace dumps, caches containing secrets, or user media as CI artifacts.
- Keep model downloads, GPU inference, media upload, deployments and Production migrations out of CI.

## Additional Video security blocker recorded on PR #215

The Worker in `integrations/nova-video-api/worker.js` uses the caller's Supabase bearer token for PostgREST. The candidate migration grants `authenticated` direct INSERT on `nova_video_preparations` and `nova_video_approval_decisions` (lines 111–112), while the RLS policies only scope ownership/reference linkage. They do not prove Worker-originated snapshot creation or approval provenance. A signed-in owner can therefore call PostgREST directly and create self-consistent preparation/approval records.

This does not mean rendering is currently executable: all execution flags remain false and the model runtime remains blocked. It does mean these approval rows cannot be trusted by a future dispatcher. The finding and required remediation were posted in the PR #215 conversation. Keep Save/Approval disconnected, do not add a service-role secret as a workaround, and add direct-PostgREST forgery tests before any future approval integration.

## Release gates

Until CI has actually executed real steps and passed on the new exact PR #215 head, and the approval write boundary has been repaired:
- PR #215 remains Draft; do not merge or deploy the Worker.
- Do not apply the candidate Supabase migration to Production.
- Do not connect frontend Save/Approval actions to a deployed endpoint.
- The `/video` workspace remains a local-only Director Draft and JSON export tool.
- Generate Video remains disabled; do not claim MP4 generation.
- Keep Wan process isolation disabled until an ephemeral sandbox with process-tree termination, CPU/RAM/GPU limits, disk quotas, and network/credential isolation is implemented and verified.

A successful hosted Actions run must show real job steps on the exact current PR head. A job with `runner_id: 0` and no steps is not CI evidence.

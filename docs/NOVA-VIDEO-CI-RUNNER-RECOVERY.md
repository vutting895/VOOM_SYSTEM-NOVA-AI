# NOVA Video CI — Zero-Cost Runner Recovery

## Verified observations (2026-11-06)

- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI` (private; default branch `main`).
- Main SHA re-resolved before the current PR work: `6e8d390ac45187fb70b6acb23f1e428a20ca7006`.
- PR #215 remained OPEN / DRAFT, based on that exact main SHA. Source head at this checkpoint: `48847953fb58e6a1bb752b2fafc85aad4c2dffca`. This documentation update will create a new PR head; CI evidence from the prior head must not be reused for the new commit.

### Latest exact-head runner evidence

On PR #215 head `48847953fb58e6a1bb752b2fafc85aad4c2dffca`, all four required workflows failed before a hosted runner executed any workflow step. Runs were created at `2026-11-06T05:51:45Z`:

- Engine Core [Run #42170903781](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42170903781), job `127738227148`.
- Frontend [Run #42170903921](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42170903921), build job `127738227816`; Netlify production smoke test was skipped because the build job failed.
- Video API [Run #42170903896](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42170903896), job `127738228510`.
- Video Migration [Run #42170904030](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/actions/runs/42170904030), job `127738227904`.

Each failed job record has `runner_id: 0`, empty `runner_name`, and `steps: []`. There is no step-level test output. These workflow attempts therefore neither pass nor fail the source tests; the new Worker and SQL negative tests have **not executed in GitHub Actions**.

### GitHub service status correlation

GitHub's official status history records:
- An Actions incident on November 5, 2026, 16:50–17:42 UTC.
- A multi-service incident affecting Git Operations, Issues, Actions and API access from November 5, 23:36 UTC, resolved November 6 at 00:20 UTC.

The latest PR #215 failures above occurred at 05:51 UTC, after that latest recorded incident was resolved. The incidents may explain earlier failures, but do not establish the cause of the later runner-admission failures. The status history page showed systems recovered after mitigation. Do not attribute the current repeated `runner_id=0` condition solely to a resolved provider incident.

- The observed failure is runner admission, not a source-code test failure.
- It does not establish whether the root cause is exhausted included compute, an account Usage blocked/budget state, repository Actions policy, runner availability, or another account-specific restriction.
- Do not label it a GitHub-wide outage without current evidence.

## No-cost diagnostic steps

1. In the personal account that owns this private repository, open **Settings → Billing & Licensing** and inspect Actions included compute, current usage, billing-cycle reset date, and any usage-blocked or budget notice. The current GitHub included-usage table expresses compute as a dollar-denominated allowance rather than a fixed monthly minute count: the published table lists **$12/month for GitHub Free personal accounts** and **$18/month for GitHub Pro**. Verify the actual owner plan and displayed balance; do not assume either value applies. Included compute can be shared with cloud sandbox compute and memory.
2. GitHub documents that when included compute is consumed, additional usage may be billed unless a budget blocks it. Do **not** add a payment method, increase a budget, enable overage, upgrade a plan, or change repository visibility for NOVA. Record the displayed allowance, usage and reset date only.
3. In the repository, open **Settings → Actions → General**. Confirm Actions are enabled and inspect the allowed actions and runner restrictions. Do not relax security policy merely to force a run.
4. If included compute remains available and repository policy permits the current `ubuntu-latest` runner, escalate the exact run/job IDs above to GitHub Support. Include repository visibility, branch/head SHA, UTC timestamps, `runner_id=0`, empty runner names, and empty steps. Ask Support to identify the specific runner-admission rejection reason.
5. Do not switch workflows to self-hosted runners until a trusted project-owned machine/VM is explicitly selected, registered, hardened and verified online. A self-hosted runner avoids GitHub-hosted runner compute charges but the host itself may still have operating costs.

Official documentation and status:
- https://docs.github.com/en/actions/concepts/billing-and-usage
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/billing/reference/product-usage-included
- https://docs.github.com/en/actions/hosting-your-own-runners
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- https://www.githubstatus.com/

## Self-hosted runner safety requirements

If a trusted machine is made available later:
- Register a repository-scoped runner or dedicated runner group; do not use a broad organization-wide runner.
- Prefer an ephemeral/disposable runner image or VM and destroy/reimage it after each job.
- Do not store production credentials, API keys, Supabase service-role keys, signing secrets, or model-provider secrets on the runner.
- Keep workflow permissions at least privilege (`contents: read` for CI).
- Do not run untrusted fork code or arbitrary externally supplied PR workflows on a persistent machine.
- Do not upload secrets, workspace dumps, caches containing secrets, or user media as CI artifacts.
- Keep model downloads, GPU inference, media upload, deployments and Production migrations out of CI.

## Video Approval write-boundary mitigation (PR #215)

The initial review found that a user-owned Supabase session could write Preparation and Approval rows directly to PostgREST. The current source candidate narrows this risk without introducing a service-role secret or disabling owner-scoped user access:

- `nova_video_preparations.execution_authorized` and `nova_video_approval_decisions.execution_authorized` are database columns with `NOT NULL DEFAULT false CHECK (execution_authorized = false)`. The database will not accept `true`.
- Preparation INSERT RLS now requires the snapshot project ID and Director Plan to match the same owner's persisted job record.
- Before returning a stored preparation or recording an approval, the Worker reloads the owner-scoped job, rebuilds the canonical Production Plan and compares the complete snapshot and SHA-256. A forged Production Plan is rejected even if a client recomputes its own matching hash.
- Added negative SQL tests for forged Director Plans and attempts to set execution authorization to true; added Worker tests for a forged Production Plan with an attacker-computed hash, owner scope and non-executable payloads.

An authenticated owner can still directly insert their own `approved` decision row through PostgREST. This is **human-review intent only**, constrained to `execution_authorized=false`; it is not an execution credential, render command, or worker-dispatch permission. Any future dispatcher must independently revalidate the owner job and canonical plan, require a separate explicit execution capability and safety gates, and must never use `decision='approved'` alone.

The mitigation is source-reviewed but is **not yet CI-verified** because the latest exact-head workflows above did not allocate runners and ran zero steps. The Supabase migration remains a candidate; it has not been applied to Production.

## NOVA Video release gates

Until exact-head API/Engine/Frontend/Migration jobs have actually run and passed, isolated staging tenant tests have passed, and the separate execution boundary has been independently designed:
- PR #215 remains Draft; do not merge or deploy the Worker.
- Do not apply the candidate Supabase migration to Production.
- Do not connect frontend Save/Approval actions to a deployed endpoint.
- The `/video` workspace remains a local-only Director Draft and JSON export tool.
- Generate Video remains disabled; do not claim MP4 generation.
- Keep Wan process isolation disabled until an ephemeral sandbox with process-tree termination, CPU/RAM/GPU limits, disk quotas, and network/credential isolation is implemented and verified.

A successful hosted Actions run must show real job steps on the exact current PR head. A job with `runner_id: 0` and no steps is not CI evidence.

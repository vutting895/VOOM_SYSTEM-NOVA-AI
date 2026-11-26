# NOVA Release Controls

## Ownership boundary

- GitHub Actions remains the sole owner of production deployment.
- CircleCI performs release validation, release-candidate evidence generation, and rollback orchestration only.
- CircleCI must not run Wrangler, Netlify deploy commands, Cloudflare deployment commands, production migrations, or broker execution actions.
- Production deployment is still gated by the existing GitHub Actions workflow and its repository protections.

## Operations

### Validate a candidate

Run a CircleCI pipeline with:

- `operation=validate`
- optional `release_sha=<full 40-character SHA>`

The pipeline compiles the Quant Engine, runs the Quant Engine contract tests, and verifies that the repository's GitHub Actions deployment workflow remains the production deploy owner and retains read-only trading safety checks.

### Create a release marker

Run a CircleCI pipeline with:

- `operation=mark-release`
- `environment=staging` or `production`
- optional `release_id=<stable release identifier>`
- optional `release_sha=<full SHA>`

The artifact `release-markers/release-marker.json` records the exact validated SHA, CircleCI build, environment, timestamp, validation result, and explicit `NOT_DEPLOYED_BY_CIRCLECI` status. This is a candidate marker, not proof that production deployment succeeded. The actual deployed SHA/status must be verified from the GitHub Actions deployment run.

### Request a production rollback

Run a CircleCI pipeline with:

- `operation=rollback-request`
- `rollback_target_sha=<full 40-character SHA>`
- `rollback_evidence=<prior GitHub Actions deployment/run URL or retained release-marker reference>`
- `rollback_reason=<reason>`

Preflight verifies that the target commit exists and is an ancestor of current `origin/main`. CircleCI then requires a manual approval and publishes an approved rollback-request artifact.

**Important:** this workflow does not deploy or mutate GitHub refs. The artifact is an orchestration handoff, not an executed rollback. An operator must verify that the target SHA is a known-good deployed release, create/review the revert or rollback change, and allow the existing GitHub Actions production workflow to deploy the approved commit. A commit being an ancestor of main does not by itself prove it was previously deployed or healthy.

## Required release evidence

Retain and correlate:

1. CircleCI validation build URL and exact SHA.
2. CircleCI release marker artifact and release ID.
3. GitHub Actions production deployment run URL and deployed SHA.
4. Post-deployment health/safety validation result.
5. For rollback: target SHA, evidence reference, approval build URL, resulting GitHub Actions deployment run, and post-rollback health checks.

## Safety invariants

`ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false` remain mandatory. No CircleCI job enables trading, submits broker orders, changes secrets, or performs production deployment.

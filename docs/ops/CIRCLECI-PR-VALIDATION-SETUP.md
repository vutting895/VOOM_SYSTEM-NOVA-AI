# CircleCI PR Validation — Current Main Refresh

Status: Draft CI configuration; provider activation and exact-head CircleCI execution are NOT verified.

## Provenance
- Created from `main@821db357d70d3613b0ca61520eaae5c5307e8fd4`.
- The previous CircleCI configuration candidate lives on stale PR #265 branch `feat/circleci-private-pr-ci-20261109` and is 336 commits behind Main in the last recorded comparison. This refresh copies its intended test coverage, not its stale branch ancestry.
- Current-main existence checks passed for all direct test/source paths referenced by the configuration. The optional notebook test is guarded by an existence check.
- The CircleCI workflow expression uses `pipeline.event.name` and `pipeline.event.action` to permit API/manual runs and PR opened/synchronize/reopened events only. This is consistent with CircleCI's documented pipeline event values and workflow conditions.

## Scope
- Six validation jobs: frontend/security contracts, SMC Python, MT5 read-only Bridge Python, SMC Worker, Quant Engine contracts, optional Notebook validation.
- No deployment, production endpoint, credentials, secrets, contexts, broker actions, database writes, or model training.
- An optional test step runs NOVA EA v1.83 source/concurrency fixtures only when those files are present in the checked-out revision.
- Existing GitHub Actions workflows are unchanged.

## Local validation
- YAML parsed successfully with the locally available `js-yaml` parser.
- Six jobs and one workflow were parsed.
- Direct source/test path existence checks against current Main passed, except the notebook module which is explicitly optional.
- CircleCI CLI is not installed on the connected Windows device; `circleci config validate` has NOT been run.

## Provider activation blocker
- CircleCI GitHub App/project connection for this repository is not verified as complete.
- No CircleCI CLI or read-only `CIRCLECI_TOKEN` is available on the connected Windows device, so provider pipeline logs cannot be inspected.
- Keep Free plan only. Do not add billing, payment method, credits, auto-refill, or upgrade.
- Owner must complete GitHub App installation for this repository only and confirm the project uses `.circleci/config.yml`. Then run a manual API pipeline for an exact branch SHA and verify the checked-out SHA equals `CIRCLE_SHA1`, runner assignment is non-zero, and steps/logs are present.

## Release decision
This PR is a configuration refresh, not evidence of a successful CircleCI pipeline. Keep Draft until the provider connection is confirmed and a real exact-SHA run completes with inspectable job steps/logs.

# WO-2026-11-26-008 — Unified CircleCI Validation & Release Control

Status: **IMPLEMENTED ON DEVELOPMENT BRANCH / ACCEPTANCE NOT VERIFIED**.

## Ownership and hard boundaries

- CircleCI is limited to PR validation, release-candidate marker creation, release-evidence checks, and rollback-request orchestration.
- GitHub Actions remains the sole Production Deploy and Production Rollback executor.
- CircleCI has no production deployment credentials, deployment context, Wrangler/Netlify/Cloudflare deployment command, production migration, or broker capability.
- A rollback artifact is a handoff request, never a rollback execution.
- Keep `ordersEnabled=false`, `executionEnabled=false`, and `liveTradingEnabled=false`.
- No merge, auto-merge, deployment, production mutation, secret/permission change, paid service, or billing change is authorized.

## Consolidation and provenance

The authoritative configuration is `.circleci/config.yml`. It combines the six existing NOVA validation jobs from PR #418 with the release-control flow from PR #429. The QuantLab research-job implementation from PR #429 is outside this Work Order and is not copied into this configuration. PR #418's stale base ancestry is not retained; this branch starts from the current Main SHA recorded in the execution log.

The configuration has separate event gates:
- Pull-request events: opened, synchronize, reopened.
- Authorized API pipeline operation `validate`: run all six validation jobs and exact-SHA release preflight.
- API operation `mark-release`: run all validation jobs, exact-SHA release preflight, a CircleCI manual approval gate, then create the candidate marker.
- API operation `rollback-request`: validate the target/evidence input, require a CircleCI manual approval gate, then publish a non-executing handoff artifact.

Push and scheduled events do not run the PR validation workflow.

## Release marker contract

`scripts/release_control.py` creates a deterministic marker identity from repository, exact commit SHA, workflow version, and SHA-256 digests of the configuration, contract, helper, and tests. The marker also records a UTC timestamp, the required CircleCI check names, the CircleCI approval pipeline reference, and explicit deployment/trading safety fields.

The marker is written with exclusive-create semantics. Repeating the same payload is idempotent; attempting to replace an existing marker with different content fails. CircleCI build artifacts are immutable after a completed build. The marker is a release-candidate record only and does not authorize or prove a production deployment. Its deterministic `marker_id` gives the same logical identity for the same repository/SHA/workflow/artifact set. CircleCI stores artifacts per pipeline run; without a separately authorized durable registry, duplicate pipeline runs can retain separate immutable artifacts with the same marker ID. Therefore global duplicate suppression is **NOT IMPLEMENTED** and remains an acceptance limitation.

**Known evidence limitation:** CircleCI approval-job completion does not expose a verified approver identity/timestamp in this artifact. The GitHub review URL is recorded as an operator-supplied reference and is explicitly marked `NOT_MACHINE_VERIFIED`. Therefore the full review-evidence acceptance criterion remains **BLOCKED / NOT VERIFIED** until an approved read-only evidence mechanism is separately authorized and available. No production credential is to be added to CircleCI to work around this limitation.

## Rollback contract

Rollback preflight requires a full SHA, a GitHub Actions deployment-run URL, a reason, a commit that exists, and ancestry to the fetched current `origin/main`. It creates a request whose state is `PENDING_GITHUB_ACTIONS_OPERATOR_VERIFICATION`; the request explicitly records that CircleCI did not execute a rollback.

Ancestry and a URL string do not prove that a SHA was previously deployed or healthy. A GitHub Actions operator must independently verify the deployed SHA, known-good status, approval, and rollback plan before taking any action. The handoff is not a command to deploy. Because CircleCI has no authorized read-only deployment-evidence API in this Work Order, the machine-verification portion of rollback acceptance remains **BLOCKED / NOT VERIFIED**.

## Free-plan / runner policy

The config uses standard hosted Docker executors and does not request paid resource classes, contexts, self-hosted runners, new infrastructure, or billing changes. This source configuration alone does not prove the account's live Free-plan quota or available minutes. CircleCI account-plan/quota and a real non-zero runner assignment must be verified in the provider UI/run evidence. If the Free quota is unavailable, stop and mark execution BLOCKED; do not upgrade or add payment.

## Validation and acceptance status

| Acceptance item | Current status | Evidence required |
|---|---|---|
| One authoritative CircleCI config | IMPLEMENTED / NOT PROVIDER-VALIDATED | exact branch readback; CircleCI CLI validation |
| PR opened/synchronize/reopened triggers | IMPLEMENTED / NOT PROVIDER-VALIDATED | exact-head provider event runs |
| Exact SHA binding | IMPLEMENTED IN JOBS / NOT RUN | executed job logs showing checkout SHA = CIRCLE_SHA1 |
| Deterministic marker identity and artifact SHA-256 | IMPLEMENTED / TESTS NOT RUN | unit tests and stored artifact readback |
| Per-run immutable artifact and local idempotent write | IMPLEMENTED / TESTS NOT RUN; global dedup NOT IMPLEMENTED | duplicate/conflicting-write tests plus durable registry authorization if global suppression is required |
| Missing/altered artifact rejection | IMPLEMENTED / TESTS NOT RUN | regression test output |
| GitHub review approval evidence | BLOCKED / NOT MACHINE VERIFIED | authorized read-only evidence mechanism and independent review |
| Rollback known-good verification | BLOCKED / NOT MACHINE VERIFIED | independently verified GitHub Actions deployment + health evidence |
| No CircleCI production deploy authority | SOURCE REVIEW ONLY | CircleCI project/context/secret inventory |
| Free-plan/no additional spend | NOT VERIFIED | account plan/quota evidence |
| Exact-head CircleCI run, non-zero runner, logs/artifacts | NOT VERIFIED | provider pipeline run on this exact branch SHA |
| Independent security and maintainer reviews | PENDING | recorded reviews |

No acceptance criterion is marked DONE based solely on source implementation. CircleCI CLI validation and provider execution have not been performed by this repository connector. No merge or deployment is permitted until all criteria pass.

## Operator runbook

1. In CircleCI, confirm the project is connected to this private repository on the Free plan and that current quota permits the run. Do not add a payment method, upgrade, or enable paid features.
2. Validate `.circleci/config.yml` with a supported CircleCI CLI path.
3. Trigger a PR event and confirm all six jobs receive a runner and execute steps against the exact PR SHA.
4. For manual validation, use API operation `validate`; confirm the validation job is downstream of all six checks.
5. For a candidate marker, use API operation `mark-release`, provide a GitHub review-evidence URL, and complete the CircleCI approval job. Inspect the marker JSON and SHA-256 digests.
6. For a rollback request, use API operation `rollback-request` with a full target SHA, prior GitHub Actions deployment-run URL, and reason. Complete the approval gate, then inspect the handoff artifact. Do not execute from CircleCI.
7. A GitHub Actions operator independently verifies a previously deployed known-good SHA and decides whether a separate approved GitHub Actions rollback action is appropriate.
8. Keep both source PRs #418 and #429 open until all unique relevant changes are reconciled and acceptance is evidenced. Do not merge either source PR independently.

## Source reconciliation

- PR #418: retained six PR validation jobs and PR event semantics; stale branch ancestry and standalone config are not adopted as-is.
- PR #429: retained the release-candidate and rollback handoff concepts only. Its QuantLab job-store/runtime files are unrelated to WO-008 and are excluded.
- Main's GitHub Actions production workflow remains unchanged.

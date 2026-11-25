# NOVA GitHub App Automation and CI

## Status and scope

This integration is introduced on `ci/nova-github-app-auth-20261126`, based on main commit
`56bf51d2e719a4cc79d73421e135099175a1e300`. It remains a Draft PR until
reviewed. The authenticated smoke test is a post-merge setup verification:
the workflow must be dispatched from `main`, never from a PR or feature ref.

The smoke workflow is deliberately read-only. It verifies that a GitHub App can
mint an installation access token scoped to this repository and use it to read
the repository metadata. It does not create branches, push commits, edit PRs,
merge, deploy, or invoke trading functionality.

## Required GitHub App configuration

Create or use a dedicated GitHub App for NOVA automation and install it on
`vutting895/VOOM_SYSTEM-NOVA-AI` only.

Recommended minimum repository permissions for the smoke test:

- Contents: Read-only
- Pull requests: Read-only
- Checks: Read-only
- Actions: Read-only
- Metadata: Read-only (GitHub's required repository metadata access)

Subscribe only to events needed by the eventual automation, initially:
`pull_request`, `pull_request_review`, `check_run`, and `check_suite`.
Do not grant Administration, Secrets, Deployments, or Workflows permissions
for the smoke test.

Generate a private key for the App and add these repository Actions secrets:

- `NOVA_GH_APP_ID`: the GitHub App ID (not the Client ID)
- `NOVA_GH_APP_PRIVATE_KEY`: the complete PEM private key

Never commit the PEM, JWT, or installation token. Never print them in CI logs.
The workflow uses `actions/create-github-app-token` to create a short-lived,
repository-scoped installation token; the action handles JWT creation and
installation-token minting. GitHub App JWTs use RS256 and expire within ten
minutes; installation tokens expire after one hour.

## Automation and CI trust boundaries

1. Pull-request validation runs with the built-in `GITHUB_TOKEN` and minimal
   read permissions. It checks PR-controlled code but receives no App private
   key and no write-capable installation token.
2. The App authentication smoke test is `workflow_dispatch` only and refuses
   to run unless `github.ref == refs/heads/main`. Do not dispatch it against
   a PR or feature branch. This keeps PR-controlled workflow code away from
   App secrets.
3. A future trusted automation job may mint a short-lived App token only from
   a trusted main-owned workflow after a maintainer-approved trigger. It must
   not check out or execute untrusted PR-head code while a write-capable token
   is available.
4. Scope each token to this single repository and request only the permissions
   required for that job. For PR creation/update automation, use a separate
   job with Contents: write and Pull requests: write; do not add those scopes
   to the read-only smoke workflow.
5. Never use `pull_request_target` to check out and execute PR-head code with
   privileged secrets. Do not expose App credentials to fork PRs.
6. The App may open/update a PR from a development branch, but must never merge
   it, mark it ready, bypass review, modify `main` directly, deploy production,
   or enable trading.

## Development Branch and PR gate

- Source of truth: `main`; re-read its SHA before every new work batch.
- All code changes go to `dev/*` or a dedicated feature branch.
- Open a Draft PR targeting `main` for review.
- Require at least one human approval and approval of the most recent push.
- Require successful CI checks on the latest PR head SHA before merge.
- Resolve review comments and inspect the complete diff before a human merge.
- No auto-merge, bypass, direct push to `main`, or production deployment from
  this integration.

The current active repository ruleset `Root` already requires a pull request,
one approval, and approval of the latest push. Its required status-check list
is currently empty. After this PR has passed review and is merged, configure
the exact successful authentication check as required in the ruleset. Do not
guess a check name before GitHub reports it.

## First-run procedure

1. Review and merge this PR through the existing human PR gate only after
   ordinary review and static validation are complete.
2. Configure the two repository Actions secrets.
3. Confirm the dedicated App is installed on this repository with the
   read-only permissions above.
4. Open Actions → NOVA GitHub App Authentication → Run workflow, selecting
   `main` as the branch.
5. Confirm `Verify scoped GitHub App installation token` passes.
6. Confirm the logs contain no token, PEM, or JWT.
7. Add the exact successful check to the `Root` ruleset as a required check.
8. Propose any write-capable automation in a separate Draft PR and review its
   permission scope and event trust model before enabling it.

## Trading safety

This CI integration is repository automation only. It must not change these
NOVA runtime safety flags:

- `ordersEnabled=false`
- `executionEnabled=false`
- `liveTradingEnabled=false`

No workflow in this integration deploys a Worker, changes Supabase data, or
submits broker orders.

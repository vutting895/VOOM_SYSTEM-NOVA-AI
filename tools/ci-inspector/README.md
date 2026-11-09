# NOVA CI & Deployment Inspector

A zero-dependency, read-only Python CLI and local web dashboard for inspecting one NOVA pull request across GitHub, CircleCI, and Netlify. It validates evidence against the exact current PR head SHA.

## Requirements

- Python 3.10+
- Network access to GitHub, CircleCI, and Netlify APIs
- Read-only API credentials supplied through environment variables:
  - `GITHUB_TOKEN` (or `GH_TOKEN`): repository contents, pull requests, and checks read access
  - `CIRCLECI_TOKEN`: CircleCI pipeline and job read access
  - `NETLIFY_AUTH_TOKEN`: read access to the selected Netlify site
  - `NETLIFY_SITE_ID`: Netlify site UUID (may instead be passed as `--netlify-site-id`)

The tool never asks for credentials interactively, never prints credential values, and does not store credentials in the report. Do not commit tokens or put them in command-line arguments. For NOVA, CircleCI configuration is tracked separately in PR #265; until that configuration is available on the pipeline's checked-out branch and the CircleCI GitHub App/project setup is completed, CircleCI evidence must remain BLOCKED. Do not copy or merge that configuration into this PR.

## Run on Linux

```bash
export GITHUB_TOKEN='...'
export CIRCLECI_TOKEN='...'
export NETLIFY_AUTH_TOKEN='...'
export NETLIFY_SITE_ID='...'

python3 tools/ci-inspector/inspect.py --pr 272
python3 tools/ci-inspector/inspect.py --pr 265 --serve
```

Then open http://127.0.0.1:8765. The dashboard binds to loopback only. Press Ctrl+C to stop it. The JSON report is written outside the repository at `~/.cache/nova-ci-inspector/report.json` by default. Override with `--output /path/to/report.json`.

## Status semantics

- `PASS`: the specific check has positive evidence for the exact PR head SHA.
- `FAIL`: an explicit failing check, merge conflict, or likely credential pattern in available PR diff hunks.
- `BLOCKED`: evidence or credentials are unavailable, the PR is draft, checks are pending/canceled, or an API cannot be queried.
- `STALE`: provider history was completely searched but no pipeline/deploy matches the exact PR head SHA.

GitHub Check Runs are paginated (up to 10 pages); incomplete pagination blocks a PASS. The inspector also reads GitHub Actions job metadata when permitted: a failed job with no runner ID/name and no steps is classified as BLOCKED (runner was not assigned), not as a failed test. Runner diagnostics are correlated to the exact GitHub Check Run ID rather than the display name, so a separate retry or same-named job that actually ran and failed remains FAIL. In the report summary, jobs with no runner assignment are counted separately as `runner unassigned` and are excluded from the failed-test count. Netlify deployments must match the exact commit SHA, source branch, and `deploy-preview` context; production deploys are never counted as preview evidence. Empty GitHub Commit Status contexts do not fail by themselves when GitHub Check Runs exist. A provider error explicitly stating that no project configuration exists is BLOCKED (missing CI setup), while other explicit provider errors remain FAIL. CircleCI is independently inspected through its own API. The PR merge-readiness check is informational and does not replace required reviews or branch protection.

A global PASS means every collected check passed; missing provider credentials prevent PASS. GitHub's PR comparison, check-runs, and diff scan are separate evidence items. The secret scan is heuristic and scans available diff hunks only; it is not a substitute for GitHub secret scanning or a human security review.

## Read-only and safety boundaries

- Uses GET requests only.
- Does not merge or modify pull requests.
- Does not trigger CircleCI workflows or Netlify builds.
- Does not deploy, change environment variables, create secrets, or change billing.
- Does not access broker APIs or execute trading operations.
- Dashboard is local-only; do not expose it to a public network.
- API error messages are truncated and common credential-shaped strings are redacted before inclusion in reports. Netlify deploy records are field-whitelisted to exclude private deploy tokens and user identifiers; still review generated reports before sharing.
- CircleCI job URLs are restricted to HTTPS before the dashboard renders them.

## Tests

```bash
python3 -m unittest discover -s tools/ci-inspector -p 'test_*.py' -v
python3 -m py_compile tools/ci-inspector/inspect.py tools/ci-inspector/test_inspect.py
```

Provider API schemas can change. Treat `BLOCKED` or `STALE` as absence of evidence, not as proof of provider failure. The tool deliberately does not claim a deployment or CI run succeeded without matching commit evidence.

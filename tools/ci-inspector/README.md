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

The tool never asks for credentials interactively, never prints credential values, and does not store credentials in the report. Do not commit tokens or put them in command-line arguments.

## Run on Linux

```bash
export GITHUB_TOKEN='...'
export CIRCLECI_TOKEN='...'
export NETLIFY_AUTH_TOKEN='...'
export NETLIFY_SITE_ID='...'

python3 tools/ci-inspector/inspect.py --pr 265
python3 tools/ci-inspector/inspect.py --pr 265 --serve
```

Then open http://127.0.0.1:8765. The dashboard binds to loopback only. Press Ctrl+C to stop it. The JSON report is written outside the repository at `~/.cache/nova-ci-inspector/report.json` by default. Override with `--output /path/to/report.json`.

## Status semantics

- `PASS`: the specific check has positive evidence.
- `FAIL`: an explicit failing check or a likely credential pattern in available PR diff hunks.
- `BLOCKED`: evidence or credentials are unavailable, pending, canceled, or the API cannot be queried.
- `STALE`: a CircleCI pipeline or Netlify deploy exists, but not for the exact PR head SHA (or no exact-SHA deploy exists).

A global PASS means every collected check passed; missing provider credentials prevent PASS. GitHub's PR comparison, check-runs, and diff scan are separate evidence items. The secret scan is heuristic and scans available diff hunks only; it is not a substitute for GitHub secret scanning or a human security review.

## Read-only and safety boundaries

- Uses GET requests only.
- Does not merge or modify pull requests.
- Does not trigger CircleCI workflows or Netlify builds.
- Does not deploy, change environment variables, create secrets, or change billing.
- Does not access broker APIs or execute trading operations.
- Dashboard is local-only; do not expose it to a public network.
- API error messages are truncated before inclusion in reports; still review generated reports before sharing.

## Tests

```bash
python3 -m unittest discover -s tools/ci-inspector -p 'test_*.py' -v
python3 -m py_compile tools/ci-inspector/inspect.py tools/ci-inspector/test_inspect.py
```

Provider API schemas can change. Treat `BLOCKED` or `STALE` as absence of evidence, not as proof of provider failure. The tool deliberately does not claim a deployment or CI run succeeded without matching commit evidence.

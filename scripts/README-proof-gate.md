# NOVA Automated Proof Gate

A fail-closed CLI that produces a JSON evidence report for one pull request.
It verifies current `main`, PR base/head identity, branch ancestry, and explicitly
named GitHub Check Runs on the exact PR HEAD SHA.

## Requirements

- Python 3.10+
- GitHub token with read access to repository contents, pull requests, commits and checks.
- Set the token in `GH_TOKEN` or `GITHUB_TOKEN`. Never put it in shell history or source code.

## Run

```bash
export GH_TOKEN="..."  # use a secure secret manager/environment injection
python scripts/proof_gate.py \
  --repo vutting895/VOOM_SYSTEM-NOVA-AI \
  --pr 269 \
  --required-check "Windows Runtime CI" \
  --required-check "Frontend CI" \
  --required-check "CircleCI" \
  --output proof-report.json
```

Use exact check-run names shown on the PR Checks tab. Do not guess names. If
CircleCI does not publish a GitHub Check Run, it cannot be verified by this
tool; inspect CircleCI's own pipeline/job evidence separately.

## Exit codes

- `0`: PR is not Draft and all identity, ancestry and required-check gates passed.
- `1`: proof failed or one or more required checks are missing, pending or failed.
- `2`: invocation/configuration error (for example, missing token).

## Fail-closed rules

- PR must be open and target `main`.
- PR head branch ref must resolve to exactly the PR head SHA.
- PR base SHA must equal the current `main` SHA.
- PR must be a descendant of current `main` (`behind_by == 0`).
- Every required check must exist on that exact SHA and have latest status
  `completed` with conclusion `success`.
- Draft PRs never receive an overall pass.

## Scope boundary

This proves repository/CI evidence only. It does **not** prove live service health,
Exness Demo terminal connectivity, owner-vs-foreign tenant behavior, data correctness
against a real broker, deployment identity, or production readiness. It never
merges, deploys, modifies branch protection, or sends trading commands.

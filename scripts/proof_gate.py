#!/usr/bin/env python3
"""Fail-closed evidence checker for a GitHub pull request.

Checks PR/base/head identity and exact-head GitHub Check Runs. A CI green result
is deliberately NOT represented as proof that an external broker/runtime works.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

API = "https://api.github.com"
SUCCESS = {"success"}


class ProofError(RuntimeError):
    pass


def api_get(path: str, token: str) -> dict[str, Any]:
    request = urllib.request.Request(
        API + path,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "nova-automated-proof-gate",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise ProofError(f"GitHub API HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ProofError(f"GitHub API request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise ProofError(f"Unexpected API response for {path}")
    return payload


def latest_check_runs(check_runs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Select latest attempt for each exact check name."""
    latest: dict[str, dict[str, Any]] = {}
    for item in check_runs:
        name = item.get("name")
        if not isinstance(name, str) or not name:
            continue
        previous = latest.get(name)
        current_time = item.get("started_at") or item.get("completed_at") or ""
        previous_time = (previous or {}).get("started_at") or (previous or {}).get("completed_at") or ""
        if previous is None or current_time >= previous_time:
            latest[name] = item
    return latest


def evaluate_required_checks(
    check_runs: list[dict[str, Any]], required_names: list[str]
) -> tuple[bool, list[dict[str, Any]]]:
    latest = latest_check_runs(check_runs)
    evidence = []
    passed = True
    for name in required_names:
        item = latest.get(name)
        if item is None:
            status, conclusion, url = "missing", None, None
        else:
            status = item.get("status")
            conclusion = item.get("conclusion")
            url = item.get("html_url")
        ok = status == "completed" and conclusion in SUCCESS
        passed = passed and ok
        evidence.append({
            "name": name,
            "status": status,
            "conclusion": conclusion,
            "url": url,
            "passed": ok,
        })
    return passed, evidence


def build_report(repo: str, pr_number: int, required_names: list[str], token: str) -> dict[str, Any]:
    parts = repo.split("/")
    if len(parts) != 2 or not all(parts):
        raise ProofError("--repo must be owner/name")

    pr = api_get(f"/repos/{repo}/pulls/{pr_number}", token)
    if pr.get("state") != "open":
        raise ProofError(f"PR #{pr_number} is not open")
    base_ref = (pr.get("base") or {}).get("ref")
    head_ref = (pr.get("head") or {}).get("ref")
    head_repo = (pr.get("head") or {}).get("repo") or {}
    if head_repo.get("full_name") != repo:
        raise ProofError("PR head is not in the target repository; refusing ambiguous ref lookup")
    if base_ref != "main":
        raise ProofError(f"Expected PR base main, received {base_ref!r}")

    main_ref = api_get(f"/repos/{repo}/git/ref/heads/main", token)
    main_sha = (main_ref.get("object") or {}).get("sha")
    head_ref_data = api_get(
        f"/repos/{repo}/git/ref/heads/{urllib.parse.quote(head_ref, safe='/')}", token
    )
    branch_sha = (head_ref_data.get("object") or {}).get("sha")
    pr_head_sha = (pr.get("head") or {}).get("sha")
    pr_base_sha = (pr.get("base") or {}).get("sha")

    if not all(isinstance(value, str) and len(value) == 40 for value in (main_sha, branch_sha, pr_head_sha, pr_base_sha)):
        raise ProofError("Could not resolve full Git commit SHAs")
    if branch_sha != pr_head_sha:
        raise ProofError("PR head SHA does not match the current head branch ref")
    if pr_base_sha != main_sha:
        raise ProofError("PR base SHA is stale relative to current main; update/rebase before proof")

    comparison = api_get(f"/repos/{repo}/compare/{main_sha}...{pr_head_sha}", token)
    ahead = comparison.get("ahead_by")
    behind = comparison.get("behind_by")
    merge_base = (comparison.get("merge_base_commit") or {}).get("sha")
    ancestry_ok = comparison.get("status") in {"ahead", "identical"} and behind == 0
    if not ancestry_ok:
        raise ProofError(f"PR branch is not a clean descendant of current main (status={comparison.get('status')}, ahead={ahead}, behind={behind})")

    checks_payload = api_get(
        f"/repos/{repo}/commits/{pr_head_sha}/check-runs?per_page=100", token
    )
    runs = checks_payload.get("check_runs")
    if not isinstance(runs, list):
        raise ProofError("GitHub did not return a check_runs list")
    checks_ok, checks = evaluate_required_checks(runs, required_names)

    return {
        "schema_version": 1,
        "repository": repo,
        "pull_request": pr_number,
        "pr_url": pr.get("html_url"),
        "state": pr.get("state"),
        "draft": bool(pr.get("draft")),
        "base_branch": base_ref,
        "head_branch": head_ref,
        "main_sha": main_sha,
        "pr_base_sha": pr_base_sha,
        "branch_sha": branch_sha,
        "pr_head_sha": pr_head_sha,
        "merge_base_sha": merge_base,
        "ahead_by": ahead,
        "behind_by": behind,
        "identity_and_ancestry_passed": True,
        "required_checks": checks,
        "ci_passed": checks_ok,
        "runtime_validation": "NOT_PROVEN_BY_CI",
        "production_ready": False,
        "overall_passed": checks_ok and not bool(pr.get("draft")),
        "limitations": [
            "Only explicitly named GitHub Check Runs are evaluated.",
            "CircleCI is included only when its integration publishes the named check to GitHub.",
            "Green CI does not prove Exness Demo connectivity, tenant isolation in a deployed runtime, or production readiness.",
            "This tool does not merge, deploy, change branch protection, or enable trading.",
        ],
        "generated_at_utc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--pr", required=True, type=int, help="Pull request number")
    parser.add_argument(
        "--required-check", action="append", dest="required_checks", required=True,
        help="Exact GitHub Check Run name; repeat for every mandatory CI check",
    )
    parser.add_argument("--output", default="proof-report.json", help="JSON report path")
    args = parser.parse_args()
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        print("ERROR: set GH_TOKEN or GITHUB_TOKEN (never pass tokens on the command line)", file=sys.stderr)
        return 2
    try:
        report = build_report(args.repo, args.pr, args.required_checks, token)
    except ProofError as exc:
        failure = {
            "schema_version": 1,
            "overall_passed": False,
            "production_ready": False,
            "error": str(exc),
        }
        rendered = json.dumps(failure, indent=2)
        print(rendered)
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
        return 1

    rendered = json.dumps(report, indent=2)
    print(rendered)
    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(rendered + "\n")
    return 0 if report["overall_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

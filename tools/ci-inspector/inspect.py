#!/usr/bin/env python3
"""Read-only NOVA pull-request, CircleCI, and Netlify inspector.

Credentials are read only from environment variables and are never emitted:
  GITHUB_TOKEN (or GH_TOKEN), CIRCLECI_TOKEN, NETLIFY_AUTH_TOKEN
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

API_GITHUB = "https://api.github.com"
API_CIRCLECI = "https://circleci.com/api/v2"
API_NETLIFY = "https://api.netlify.com/api/v1"
ROOT = Path(__file__).resolve().parent
SENSITIVE_PATTERNS = [
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"(?i)(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['\"][^'\"]{8,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]


class InspectorError(RuntimeError):
    pass


def request_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", "replace")
        for key, value in (headers or {}).items():
            if key.lower() in ("authorization", "circle-token") and value:
                body = body.replace(value, "[REDACTED]")
        raise InspectorError(f"HTTP {exc.code}: {body[:300]}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise InspectorError(f"Network error: {exc}") from None


def status_item(name: str, status: str, detail: str, url: str | None = None) -> dict[str, Any]:
    return {"name": name, "status": status, "detail": detail, "url": url}


def inspect_github(repo: str, pr_number: int, token: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    base = f"{API_GITHUB}/repos/{repo}"
    pr_url = f"{base}/pulls/{pr_number}"
    pr = request_json(pr_url, headers)
    head_sha = pr.get("head", {}).get("sha", "")
    base_sha = pr.get("base", {}).get("sha", "")
    base_ref = pr.get("base", {}).get("ref", "main")
    head_ref = pr.get("head", {}).get("ref", "")
    items: list[dict[str, Any]] = []

    compare = request_json(f"{base}/compare/{urllib.parse.quote(base_ref, safe='')}...{head_sha}", headers)
    compare_base = compare.get("base_commit", {}).get("sha")
    ahead = compare.get("ahead_by")
    behind = compare.get("behind_by")
    compare_ok = compare_base == base_sha and behind == 0
    items.append(status_item(
        "PR ancestry",
        "PASS" if compare_ok else "FAIL",
        f"base={base_sha[:12]} merge-base={str(compare_base)[:12]} ahead={ahead} behind={behind}",
        pr.get("html_url"),
    ))

    changed = []
    page = 1
    files_complete = False
    while page <= 10:
        batch = request_json(f"{base}/pulls/{pr_number}/files?per_page=100&page={page}", headers)
        if not isinstance(batch, list):
            break
        if not batch:
            files_complete = True
            break
        changed.extend(batch)
        if len(batch) < 100:
            files_complete = True
            break
        page += 1
    patches = []
    files_without_patch = 0
    for file in changed:
        patch = file.get("patch")
        if patch:
            patches.append(patch)
        else:
            files_without_patch += 1
    scan_text = "\n".join(patches)
    secret_hits = sum(1 for pattern in SENSITIVE_PATTERNS if pattern.search(scan_text))
    scan_status = classify_diff_scan(secret_hits, files_complete, files_without_patch)
    items.append(status_item(
        "Diff secret scan",
        scan_status,
        f"{secret_hits} potential credential-pattern match(es); "
        f"{files_without_patch} file(s) without text patch; pagination_complete={files_complete}. "
        "Only available diff hunks are scanned; this is not a full secret scanner.",
        pr.get("html_url"),
    ))

    checks = request_json(f"{base}/commits/{head_sha}/check-runs?per_page=100", headers)
    check_runs = checks.get("check_runs", [])
    bad = [c for c in check_runs if c.get("status") == "completed" and c.get("conclusion") not in ("success", "neutral", "skipped")]
    pending = [c for c in check_runs if c.get("status") != "completed"]
    items.append(status_item(
        "GitHub Check Runs",
        "FAIL" if bad else ("BLOCKED" if not check_runs or pending else "PASS"),
        f"{len(check_runs)} checks; {len(bad)} failed; {len(pending)} pending on {head_sha[:12]}",
        f"https://github.com/{repo}/commit/{head_sha}/checks",
    ))

    commit_status = request_json(f"{base}/commits/{head_sha}/status", headers)
    statuses = commit_status.get("statuses", [])
    status_failures = [s for s in statuses if s.get("state") in ("failure", "error")]
    status_pending = [s for s in statuses if s.get("state") == "pending"]
    items.append(status_item(
        "GitHub Commit Statuses",
        "FAIL" if status_failures else ("BLOCKED" if not statuses or status_pending else "PASS"),
        f"{len(statuses)} status contexts; {len(status_failures)} failed; {len(status_pending)} pending on {head_sha[:12]}",
        f"https://github.com/{repo}/commit/{head_sha}",
    ))

    pr_data = {
        "number": pr_number, "url": pr.get("html_url"), "title": pr.get("title"),
        "state": pr.get("state"), "draft": pr.get("draft"), "merged": pr.get("merged"),
        "mergeable": pr.get("mergeable"), "base_ref": base_ref, "base_sha": base_sha,
        "head_ref": head_ref, "head_sha": head_sha, "ahead_by": ahead, "behind_by": behind,
        "changed_files": [{"path": f.get("filename"), "status": f.get("status"),
                           "additions": f.get("additions"), "deletions": f.get("deletions")}
                          for f in changed],
        "checks": [{"name": c.get("name"), "status": c.get("status"),
                    "conclusion": c.get("conclusion"), "url": c.get("details_url")}
                   for c in check_runs],
        "commit_statuses": [{"context": s.get("context"), "state": s.get("state"),
                             "url": s.get("target_url")}
                            for s in statuses],
    }
    return {"items": items, "data": pr_data}, {"head_sha": head_sha, "head_ref": head_ref}


def fetch_circleci_items(url: str, headers: dict[str, str], max_pages: int = 10) -> tuple[list[dict[str, Any]], bool]:
    """Fetch a bounded CircleCI v2 paginated collection without silently truncating it."""
    items: list[dict[str, Any]] = []
    page_token: str | None = None
    for _ in range(max_pages):
        page_url = url
        if page_token:
            separator = "&" if "?" in page_url else "?"
            page_url += separator + urllib.parse.urlencode({"page-token": page_token})
        payload = request_json(page_url, headers)
        items.extend(payload.get("items", []))
        page_token = payload.get("next_page_token")
        if not page_token:
            return items, True
    return items, False


def classify_circleci_status(workflows: list[dict[str, Any]], jobs: list[dict[str, Any]], evidence_complete: bool = True) -> str:
    workflow_statuses = [w.get("status") for w in workflows]
    failures = [j for j in jobs if j.get("status") in ("failed", "error", "unauthorized")]
    failures.extend(s for s in workflow_statuses if s in ("failed", "error"))
    non_success_jobs = [j for j in jobs if j.get("status") != "success"]
    non_success_workflows = [s for s in workflow_statuses if s != "success"]
    if failures:
        return "FAIL"
    if not evidence_complete or not workflows or not jobs or non_success_jobs or non_success_workflows:
        return "BLOCKED"
    return "PASS"


def classify_diff_scan(secret_hits: int, files_complete: bool, files_without_patch: int) -> str:
    if secret_hits:
        return "FAIL"
    if not files_complete or files_without_patch:
        return "BLOCKED"
    return "PASS"


def inspect_circleci(repo: str, branch: str, expected_sha: str, token: str | None) -> dict[str, Any]:
    if not token:
        return {"items": [status_item("CircleCI", "BLOCKED", "CIRCLECI_TOKEN is not set; no CircleCI API request was made.")],
                "data": {"pipelines": [], "jobs": []}}
    owner, name = repo.split("/", 1)
    slug = urllib.parse.quote(f"gh/{owner}/{name}", safe="/")
    headers = {"Circle-Token": token}
    try:
        pipeline_url = f"{API_CIRCLECI}/project/{slug}/pipeline?branch={urllib.parse.quote(branch)}"
        pipelines, pipelines_complete = fetch_circleci_items(pipeline_url, headers)
        matching = next((p for p in pipelines if p.get("vcs", {}).get("revision") == expected_sha), None)
        if not matching:
            latest_sha = pipelines[0].get("vcs", {}).get("revision") if pipelines else None
            no_match_status = "STALE" if pipelines_complete and latest_sha else "BLOCKED"
            return {"items": [status_item("CircleCI exact SHA", no_match_status,
                f"No pipeline found for expected {expected_sha[:12]}; "
                f"latest branch revision={str(latest_sha)[:12]}; pagination_complete={pipelines_complete}")],
                "data": {"pipelines": pipelines[:10], "jobs": []}}
        workflows, workflows_complete = fetch_circleci_items(
            f"{API_CIRCLECI}/pipeline/{matching['id']}/workflow", headers
        )
        jobs = []
        jobs_complete = True
        for workflow in workflows:
            workflow_jobs, workflow_jobs_complete = fetch_circleci_items(
                f"{API_CIRCLECI}/workflow/{workflow['id']}/job", headers
            )
            jobs_complete = jobs_complete and workflow_jobs_complete
            for job in workflow_jobs:
                jobs.append({"name": job.get("name"), "status": job.get("status"),
                             "job_number": job.get("job_number"), "url": job.get("web_url"),
                             "workflow": workflow.get("name")})
        workflow_statuses = [w.get("status") for w in workflows]
        failures = [j for j in jobs if j.get("status") in ("failed", "error", "unauthorized")]
        failures.extend(s for s in workflow_statuses if s in ("failed", "error"))
        non_success_jobs = [j for j in jobs if j.get("status") != "success"]
        non_success_workflows = [s for s in workflow_statuses if s != "success"]
        status = classify_circleci_status(workflows, jobs, pipelines_complete and workflows_complete and jobs_complete)
        return {"items": [status_item("CircleCI exact SHA", status,
            f"Pipeline {matching.get('number')} revision={expected_sha[:12]}; "
            f"workflows={len(workflows)}, jobs={len(jobs)}, failed={len(failures)}, "
            f"non_success_jobs={len(non_success_jobs)}, non_success_workflows={len(non_success_workflows)}, "
            f"pagination_complete={pipelines_complete and workflows_complete and jobs_complete}",
            f"https://app.circleci.com/pipelines/gh/{owner}/{name}/{matching.get('number')}")],
            "data": {"pipelines": [matching], "jobs": jobs}}
    except (InspectorError, KeyError, ValueError) as exc:
        return {"items": [status_item("CircleCI", "BLOCKED", str(exc))], "data": {"pipelines": [], "jobs": []}}


def inspect_netlify(site_id: str | None, expected_sha: str, token: str | None) -> dict[str, Any]:
    if not site_id or not token:
        missing = "NETLIFY_SITE_ID" if not site_id else "NETLIFY_AUTH_TOKEN"
        return {"items": [status_item("Netlify Preview", "BLOCKED", f"{missing} is not set; no Netlify API request was made.")],
                "data": {"deploys": []}}
    try:
        headers = {"Authorization": f"Bearer {token}"}
        deploys: list[dict[str, Any]] = []
        exact: list[dict[str, Any]] = []
        deploys_complete = False
        for page in range(1, 11):
            page_url = (f"{API_NETLIFY}/sites/{urllib.parse.quote(site_id, safe='')}/deploys"
                        f"?per_page=100&page={page}")
            batch = request_json(page_url, headers)
            if not isinstance(batch, list):
                break
            deploys.extend(batch)
            exact = [d for d in batch if d.get("commit_ref") == expected_sha]
            if exact:
                break
            if len(batch) < 100:
                deploys_complete = True
                break
        if not exact:
            missing_status = "STALE" if deploys_complete else "BLOCKED"
            return {"items": [status_item("Netlify exact SHA", missing_status,
                f"No deploy found for expected commit {expected_sha[:12]}; "
                f"pagination_complete={deploys_complete}",
                f"https://app.netlify.com/sites/{site_id}/deploys")], "data": {"deploys": deploys[:10]}}
        deploy = exact[0]
        state = deploy.get("state")
        status = "PASS" if state == "ready" else ("FAIL" if state == "error" else "BLOCKED")
        safe_fields = ("id", "state", "context", "commit_ref", "branch", "deploy_url",
                       "deploy_ssl_url", "admin_url", "created_at", "commit_url", "review_id")
        safe_deploy = {key: deploy.get(key) for key in safe_fields if deploy.get(key) is not None}
        error_message = str(deploy.get("error_message") or "")[:500]
        safe_deploy["error_message"] = error_message
        return {"items": [status_item("Netlify exact SHA", status,
            f"Deploy state={state}; context={deploy.get('context')}; commit={expected_sha[:12]}; {error_message}".strip(),
            deploy.get("deploy_ssl_url") or deploy.get("admin_url"))],
            "data": {"deploys": [safe_deploy]}}
    except InspectorError as exc:
        return {"items": [status_item("Netlify", "BLOCKED", str(exc))], "data": {"deploys": []}}


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    github_token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    circle_token = os.getenv("CIRCLECI_TOKEN")
    netlify_token = os.getenv("NETLIFY_AUTH_TOKEN")
    try:
        github, refs = inspect_github(args.repo, args.pr, github_token)
    except (InspectorError, KeyError, ValueError) as exc:
        return {"generated_at": now, "repository": args.repo, "pr": args.pr,
                "overall": "BLOCKED", "sections": [{"name": "GitHub", "items": [status_item("GitHub", "BLOCKED", str(exc))], "data": {}}]}
    circle = inspect_circleci(args.repo, refs["head_ref"], refs["head_sha"], circle_token)
    netlify = inspect_netlify(args.netlify_site_id or os.getenv("NETLIFY_SITE_ID"), refs["head_sha"], netlify_token)
    sections = [
        {"name": "GitHub", **github},
        {"name": "CircleCI", **circle},
        {"name": "Netlify", **netlify},
    ]
    statuses = [item["status"] for section in sections for item in section["items"]]
    overall = "FAIL" if "FAIL" in statuses else ("BLOCKED" if "BLOCKED" in statuses else ("STALE" if "STALE" in statuses else "PASS"))
    return {"generated_at": now, "repository": args.repo, "pr": args.pr,
            "expected_head_sha": refs["head_sha"], "overall": overall, "sections": sections,
            "policy": {"read_only": True, "merge_performed": False, "deployment_performed": False,
                       "live_trading_enabled": False}}


def write_report(report: dict[str, Any], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        output.chmod(0o600)
    except OSError:
        # Keep the report usable on filesystems that do not support POSIX modes.
        pass


def serve(report_path: Path, port: int) -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/api/report":
                if not report_path.exists():
                    self.send_error(404, "Run the inspector first")
                    return
                body = report_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path not in ("/", "/index.html"):
                self.send_error(404)
                return
            body = (ROOT / "dashboard.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"NOVA Inspector dashboard: http://127.0.0.1:{port} (local-only)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only NOVA GitHub/CircleCI/Netlify inspector")
    parser.add_argument("--repo", default="vutting895/VOOM_SYSTEM-NOVA-AI")
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--netlify-site-id", default=None)
    parser.add_argument("--output", type=Path, default=Path.home() / ".cache/nova-ci-inspector/report.json")
    parser.add_argument("--serve", action="store_true", help="serve the static dashboard after writing the report")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    report = build_report(args)
    write_report(report, args.output)
    print(json.dumps({"overall": report["overall"], "expected_head_sha": report.get("expected_head_sha"),
                      "report": str(args.output)}, indent=2))
    if args.serve:
        serve(args.output, args.port)
    return {"PASS": 0, "FAIL": 1, "BLOCKED": 2, "STALE": 3}.get(report["overall"], 2)


if __name__ == "__main__":
    sys.exit(main())

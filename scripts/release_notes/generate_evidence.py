#!/usr/bin/env python3
"""Build an evidence-backed release-notes input pack. No publishing or repository writes."""
from __future__ import annotations
import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request

API = os.getenv("GITHUB_API_URL", "https://api.github.com").rstrip("/")
REPO = os.environ["GITHUB_REPOSITORY"]
TOKEN = os.environ["GITHUB_TOKEN"]
NOW = dt.datetime.now(dt.timezone.utc)
MAX_PAGES, PAGE_SIZE, MAX_COMPARE_COMMITS = 10, 100, 250


def api(path: str):
    req = urllib.request.Request(
        f"{API}/repos/{REPO}/{path.lstrip('/')}",
        headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {TOKEN}",
                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nova-release-notes-agent"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read(2048).decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API request failed ({exc.code}) for {path}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"GitHub API request failed for {path}: {exc}") from exc


def pages(path: str):
    for page in range(1, MAX_PAGES + 1):
        separator = "&" if "?" in path else "?"
        data = api(f"{path}{separator}per_page={PAGE_SIZE}&page={page}")
        if not isinstance(data, list):
            raise RuntimeError(f"Expected a list response while paging {path}.")
        if not data:
            return
        yield from data
        if len(data) < PAGE_SIZE:
            return
    raise RuntimeError(f"Pagination safety limit ({MAX_PAGES} pages) reached; refusing a potentially truncated evidence pack.")


def resolve_tag_commit(tag_ref: dict) -> str:
    """Resolve lightweight or annotated (including nested) tag refs to a commit SHA."""
    name = tag_ref.get("name")
    if not name:
        raise RuntimeError("Tag response did not include a name.")
    ref_path = urllib.parse.quote(f"tags/{name}", safe="/")
    obj = (api(f"git/ref/{ref_path}").get("object") or {})
    sha, kind = obj.get("sha"), obj.get("type")
    if not sha or kind not in ("commit", "tag"):
        raise RuntimeError(f"Tag {name} has an unsupported target.")
    for _ in range(5):
        if kind == "commit":
            return sha
        target = (api(f"git/tags/{sha}").get("object") or {})
        sha, kind = target.get("sha"), target.get("type")
        if not sha or kind not in ("commit", "tag"):
            raise RuntimeError(f"Could not resolve annotated tag {name}.")
    raise RuntimeError(f"Annotated tag nesting limit exceeded for {name}.")


def commit_date(data: dict) -> str:
    commit = data.get("commit") or {}
    return (commit.get("committer") or {}).get("date") or (commit.get("author") or {}).get("date") or ""


def compare_commits(base: str, head: str) -> list:
    """Fetch compare pages up to GitHub's documented 250-commit response limit."""
    path = f"compare/{urllib.parse.quote(base, safe='')}...{urllib.parse.quote(head, safe='')}"
    first = api(f"{path}?per_page={PAGE_SIZE}&page=1")
    total = first.get("total_commits")
    if not isinstance(total, int) or total < 0:
        raise RuntimeError("Compare API did not return a valid total_commits value.")
    if total > MAX_COMPARE_COMMITS:
        raise RuntimeError(f"Compare contains {total} commits, above the API safety limit of {MAX_COMPARE_COMMITS}; refusing an incomplete evidence pack.")
    commits = list(first.get("commits") or [])
    expected_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    for page in range(2, expected_pages + 1):
        response = api(f"{path}?per_page={PAGE_SIZE}&page={page}")
        commits.extend(response.get("commits") or [])
    if len(commits) != total:
        raise RuntimeError(f"Compare API returned {len(commits)} of {total} commits; refusing an incomplete evidence pack.")
    return commits


def classify(commits: list) -> tuple[dict, list]:
    groups = {"Features": [], "Bug Fixes": [], "Improvements": [], "Other / Needs Review": []}
    records, seen = [], set()
    for item in commits:
        sha = item.get("sha", "")
        if not sha or sha in seen:
            continue
        seen.add(sha)
        message = item.get("commit", {}).get("message", "").splitlines()[0].strip()
        if not message:
            continue
        record = {"sha": sha, "short_sha": sha[:12], "message": message,
                  "url": item.get("html_url", ""), "author": (item.get("author") or {}).get("login")}
        records.append(record)
        lower = message.lower()
        if lower.startswith(("feat", "feature")):
            groups["Features"].append(record)
        elif lower.startswith(("fix", "bugfix", "hotfix")):
            groups["Bug Fixes"].append(record)
        elif lower.startswith(("perf", "refactor", "docs", "test", "build", "ci", "chore", "style")):
            groups["Improvements"].append(record)
        else:
            groups["Other / Needs Review"].append(record)
    return groups, records


def main():
    default_branch = api("").get("default_branch")
    if not default_branch:
        raise RuntimeError("Could not resolve repository default branch.")
    head_sha = api(f"commits/{urllib.parse.quote(default_branch, safe='')}")["sha"]
    candidates = []
    for tag in pages("tags"):
        commit_sha = resolve_tag_commit(tag)
        tagged_commit = api(f"commits/{commit_sha}")
        date = commit_date(tagged_commit)
        if date:
            candidates.append((date, tag, commit_sha))
    candidates.sort(key=lambda row: row[0], reverse=True)

    if candidates:
        _, tag, tag_commit_sha = candidates[0]
        commits = compare_commits(tag["name"], default_branch)
        baseline = f"latest-by-commit-date tag {tag['name']} ({tag_commit_sha[:12]})"
    else:
        since = (NOW - dt.timedelta(days=7)).isoformat().replace("+00:00", "Z")
        commits = list(pages(f"commits?since={urllib.parse.quote(since, safe=':')}"))
        baseline = f"rolling 7-day window since {since}; no resolvable Git tag found"

    groups, records = classify(commits)
    payload = {"repository": REPO, "generated_at_utc": NOW.isoformat(), "base": baseline,
               "head": head_sha, "default_branch": default_branch, "commit_count": len(records),
               "classification_note": "Prefix-based triage only; AI/human review required.",
               "categories": groups, "commits": records}
    with open("release-notes-evidence.json", "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    lines = ["# Release Notes — Evidence Pack", "", f"- Repository: `{REPO}`",
             f"- Generated (UTC): {payload['generated_at_utc']}", f"- Baseline: {baseline}",
             f"- Head SHA: `{payload['head']}`", f"- Commits: {len(records)}",
             "- Status: DRAFT INPUT — not approved for publication", "",
             "> Categories below are heuristic commit-prefix groupings, not verified product claims.", ""]
    for category, items in groups.items():
        lines.extend([f"## {category}", ""])
        lines.extend([f"- [{item['short_sha']}]({item['url']}) {item['message']}" for item in items] if items else ["- None"])
        lines.append("")
    lines.extend(["## Review requirements", "", "- Verify each item against its PR and diff.",
                  "- Exclude merged/reverted work that does not affect the shipped build.",
                  "- Identify breaking changes, migrations, security changes, and user-visible impact only when evidenced.",
                  "- Do not infer completion from commit messages alone.",
                  "- Human approval is required before creating or publishing a GitHub Release."])
    with open("release-notes-evidence.md", "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    print(f"Generated evidence for {len(records)} commits from {baseline}; no repository files were changed.")


if __name__ == "__main__":
    main()

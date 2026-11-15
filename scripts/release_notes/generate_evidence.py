#!/usr/bin/env python3
"""Build an evidence-backed release-notes input pack. No publishing or repository writes."""
from __future__ import annotations
import datetime as dt
import json
import os
import urllib.error
import urllib.request

API = os.getenv("GITHUB_API_URL", "https://api.github.com").rstrip("/")
REPO = os.environ["GITHUB_REPOSITORY"]
TOKEN = os.environ["GITHUB_TOKEN"]
NOW = dt.datetime.now(dt.timezone.utc)

def api(path: str):
    req = urllib.request.Request(
        f"{API}/repos/{REPO}/{path.lstrip('/')}",
        headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {TOKEN}",
                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nova-release-notes-agent"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def pages(path: str):
    page = 1
    while page <= 10:
        data = api(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        if not data:
            break
        yield from data
        if len(data) < 100:
            break
        page += 1

def main():
    tags = list(pages("tags"))
    tag = tags[0] if tags else None
    if tag:
        compare = api(f"compare/{tag['name']}...HEAD")
        commits = compare.get("commits", [])
        baseline = f"latest tag {tag['name']} ({tag['commit']['sha'][:12]})"
    else:
        since = (NOW - dt.timedelta(days=7)).isoformat().replace("+00:00", "Z")
        commits = list(pages(f"commits?since={since}"))
        baseline = f"rolling 7-day window since {since}; no Git tag found"
    groups = {"Features": [], "Bug Fixes": [], "Improvements": [], "Other / Needs Review": []}
    records = []
    seen = set()
    for item in commits:
        sha = item.get("sha", "")
        if not sha or sha in seen:
            continue
        seen.add(sha)
        msg = item.get("commit", {}).get("message", "").splitlines()[0].strip()
        if not msg:
            continue
        record = {"sha": sha, "short_sha": sha[:12], "message": msg,
                  "url": item.get("html_url", ""), "author": (item.get("author") or {}).get("login")}
        records.append(record)
        lower = msg.lower()
        if lower.startswith(("feat", "feature")):
            groups["Features"].append(record)
        elif lower.startswith(("fix", "bugfix", "hotfix")):
            groups["Bug Fixes"].append(record)
        elif lower.startswith(("perf", "refactor", "docs", "test", "build", "ci", "chore", "style")):
            groups["Improvements"].append(record)
        else:
            groups["Other / Needs Review"].append(record)
    payload = {"repository": REPO, "generated_at_utc": NOW.isoformat(), "base": baseline,
               "head": api("commits/HEAD")["sha"], "commit_count": len(records),
               "classification_note": "Prefix-based triage only; AI/human review required.",
               "categories": groups, "commits": records}
    with open("release-notes-evidence.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    lines = ["# Release Notes — Evidence Pack", "", f"- Repository: `{REPO}`",
             f"- Generated (UTC): {payload['generated_at_utc']}", f"- Baseline: {baseline}",
             f"- Head SHA: `{payload['head']}`", f"- Commits: {len(records)}",
             "- Status: DRAFT INPUT — not approved for publication", "",
             "> Categories below are heuristic commit-prefix groupings, not verified product claims.", ""]
    for category, items in groups.items():
        lines += [f"## {category}", ""]
        lines += ([f"- [{x['short_sha']}]({x['url']}) {x['message']}" for x in items] or ["- None"])
        lines.append("")
    lines += ["## Review requirements", "", "- Verify each item against its PR and diff.",
              "- Exclude merged/reverted work that does not affect the shipped build.",
              "- Identify breaking changes, migrations, security changes, and user-visible impact only when evidenced.",
              "- Do not infer completion from commit messages alone.",
              "- Human approval is required before creating or publishing a GitHub Release."]
    with open("release-notes-evidence.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Generated evidence for {len(records)} commits from {baseline}; no repository files were changed.")

if __name__ == "__main__":
    main()

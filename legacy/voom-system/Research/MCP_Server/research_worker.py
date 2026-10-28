"""Opt-in Brave Search worker for MCP's queued research requests.
Safe defaults: dry-run unless --execute is supplied. Findings are queued for human
review; this worker never publishes knowledge as verified and never executes trades.
Set BRAVE_SEARCH_API_KEY in the process environment; do not put it in this file.
"""
from __future__ import annotations
import argparse, json, os, re, urllib.parse, urllib.request
from typing import Any
import learning_store

BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search"
MAX_QUERY_CHARS, MAX_RESULTS = 500, 5
USER_AGENT = "VOOM-Research-Handoff/1.0"

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not forward the provider token to any redirect destination."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def _https_url(value: str) -> bool:
    from urllib.parse import urlsplit
    try:
        parsed = urlsplit(value)
        return parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username and not parsed.password
    except ValueError:
        return False

def parse_results(payload: dict[str, Any], limit: int = MAX_RESULTS) -> list[dict[str, str]]:
    web = payload.get("web")
    items = web.get("results", []) if isinstance(web, dict) else []
    out, seen = [], set()
    for item in items:
        if not isinstance(item, dict): continue
        url = str(item.get("url", "")).strip()
        title = re.sub(r"\s+", " ", str(item.get("title", "")).strip())[:300]
        snippet = re.sub(r"\s+", " ", str(item.get("description", "")).strip())[:1800]
        if not title or not snippet or not _https_url(url) or url in seen: continue
        seen.add(url)
        out.append({"title": title, "summary": snippet, "source_url": url})
        if len(out) >= max(1, min(int(limit), MAX_RESULTS)): break
    return out

def brave_search(query: str, api_key: str, timeout: int = 15) -> list[dict[str, str]]:
    query = re.sub(r"\s+", " ", query).strip()
    if not query or len(query) > MAX_QUERY_CHARS: raise ValueError(f"query must be 1-{MAX_QUERY_CHARS} characters")
    if not api_key or len(api_key) < 10: raise ValueError("BRAVE_SEARCH_API_KEY is missing or invalid")
    url = BRAVE_ENDPOINT + "?" + urllib.parse.urlencode({"q": query, "count": MAX_RESULTS, "safesearch": "moderate"})
    request = urllib.request.Request(url, headers={"Accept": "application/json", "X-Subscription-Token": api_key, "User-Agent": USER_AGENT}, method="GET")
    opener = urllib.request.build_opener(_NoRedirect())
    with opener.open(request, timeout=max(3, min(int(timeout), 30))) as response:
        if response.status != 200: raise RuntimeError(f"Brave Search returned HTTP {response.status}")
        payload = json.loads(response.read(2_000_000).decode("utf-8"))
    if not isinstance(payload, dict): raise RuntimeError("Brave Search returned an unexpected response")
    return parse_results(payload)

def run_once(execute: bool = False, limit: int = 5, api_key: str | None = None) -> dict[str, Any]:
    queue = learning_store.list_research_requests("pending", max(1, min(int(limit), 20)))
    requests = queue.get("requests", [])
    result = {"mode": "execute" if execute else "dry_run", "pending_requests": len(requests),
              "processed": 0, "findings_queued_for_review": 0, "errors": [],
              "live_trading_enabled": False, "auto_publish_enabled": False}
    if not execute:
        result["next_step"] = "Review preview; pass --execute to search and queue findings."
        result["queries"] = [{"id": item.get("id"), "query": item.get("query", "")[:MAX_QUERY_CHARS]} for item in requests]
        return result
    token = api_key if api_key is not None else os.environ.get("BRAVE_SEARCH_API_KEY", "")
    if not token:
        result["errors"].append("BRAVE_SEARCH_API_KEY is not set; no requests processed.")
        result["next_step"] = "Set BRAVE_SEARCH_API_KEY in the process environment, then retry."
        return result
    for item in requests:
        request_id, query = item.get("id"), str(item.get("query", "")).strip()[:MAX_QUERY_CHARS]
        if not query or not isinstance(request_id, int):
            result["errors"].append({"request_id": request_id, "error": "invalid queued request"})
            continue
        try:
            findings = brave_search(query, token)
            if not findings:
                result["errors"].append({"request_id": request_id, "error": "no usable HTTPS results; request left pending"})
                continue
            saved = 0
            for finding in findings:
                item_result = learning_store.add_research_result(
                    title=finding["title"],
                    summary=f"Search query: {query}\n\nSearch-result summary: {finding['summary']}",
                    source_url=finding["source_url"], evidence_type="web_research_candidate")
                if item_result.get("ok") and item_result.get("inserted"): saved += 1
            if saved:
                note = f"Queued {saved} source-linked finding(s) for review. Search snippets are leads, not verified claims."
                marked = learning_store.mark_research_request(request_id, "done", note)
                if marked.get("ok"):
                    result["processed"] += 1
                    result["findings_queued_for_review"] += saved
                else: result["errors"].append({"request_id": request_id, "error": "findings queued but request status was not updated"})
            else: result["errors"].append({"request_id": request_id, "error": "results were duplicates or rejected; request left pending"})
        except Exception as exc:
            result["errors"].append({"request_id": request_id, "error": type(exc).__name__})
    result["next_step"] = "Review pending candidates in MCP before using them as knowledge."
    return result

def main() -> int:
    parser = argparse.ArgumentParser(description="Opt-in VOOM research handoff worker.")
    parser.add_argument("--execute", action="store_true", help="Search and queue findings. Default is dry-run.")
    parser.add_argument("--limit", type=int, default=5, help="Maximum pending requests per run (1-20).")
    args = parser.parse_args()
    try:
        result = run_once(execute=args.execute, limit=max(1, min(args.limit, 20)))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result.get("errors") and args.execute and result.get("processed", 0) == 0 else 0
    except Exception as exc:
        print(json.dumps({"error": type(exc).__name__, "message": "Research worker failed safely."}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())

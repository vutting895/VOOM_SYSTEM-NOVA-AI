#!/usr/bin/env python3
"""Publish sanitized MT5 market-data CSVs to a Git branch using the Git Data API.

Only market fields are accepted. Never upload account, order, position, balance,
equity, login, ticket, or other personal/broker-account records to this public repo.
"""
from __future__ import annotations
import argparse, base64, csv, datetime as dt, gzip, hashlib, io, json, os, urllib.error, urllib.request
from pathlib import Path

API = "https://api.github.com"
ALLOWED = {
    "bars": {"symbol", "timeframe", "time_server", "time_epoch", "time", "timestamp", "datetime", "open", "high", "low", "close", "tick_volume", "real_volume", "volume", "spread", "spread_points"},
    "ticks": {"symbol", "time_server", "time", "timestamp", "time_msc", "bid", "ask", "last", "volume", "volume_real", "flags"},
}
MAX_COMPRESSED = 4 * 1024 * 1024

class GitHub:
    def __init__(self, repo: str, token: str):
        self.repo, self.token = repo, token
    def request(self, method: str, path: str, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(API + path, data=body, method=method, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "NOVA-MT5-Git-Data-Exporter",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            raise RuntimeError(f"GitHub API {exc.code}: {detail}") from exc
    def publish(self, branch: str, objects: dict[str, bytes], message: str):
        ref = self.request("GET", f"/repos/{self.repo}/git/ref/heads/{branch}")
        parent = ref["object"]["sha"]
        commit = self.request("GET", f"/repos/{self.repo}/git/commits/{parent}")
        base_tree = commit["tree"]["sha"]
        entries = []
        for path, content in objects.items():
            blob = self.request("POST", f"/repos/{self.repo}/git/blobs", {
                "content": base64.b64encode(content).decode(), "encoding": "base64"
            })
            entries.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        tree = self.request("POST", f"/repos/{self.repo}/git/trees", {
            "base_tree": base_tree, "tree": entries
        })
        new_commit = self.request("POST", f"/repos/{self.repo}/git/commits", {
            "message": message, "tree": tree["sha"], "parents": [parent]
        })
        self.request("PATCH", f"/repos/{self.repo}/git/refs/heads/{branch}", {
            "sha": new_commit["sha"], "force": False
        })
        return new_commit["sha"]

def csv_shards(source: Path, kind: str, rows_per_shard: int):
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        raw = handle.read()
    reader = csv.reader(io.StringIO(raw))
    try: header = [h.strip().lower() for h in next(reader)]
    except StopIteration: raise ValueError("CSV is empty")
    if not header or len(set(header)) != len(header):
        raise ValueError("CSV header is empty or contains duplicate columns")
    forbidden = set(header) - ALLOWED[kind]
    if forbidden:
        raise ValueError("Refusing non-market or unknown columns: " + ", ".join(sorted(forbidden)))
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(header)
    shards, rows, part = [], [], 0
    for row in reader:
        if not row: continue
        if len(row) != len(header): raise ValueError("CSV row has a different column count")
        rows.append(row)
        if len(rows) >= rows_per_shard:
            shards.append((header, rows)); rows = []
    if rows: shards.append((header, rows))
    if not shards: raise ValueError("CSV has no data rows")
    output = []
    for header, rows in shards:
        stream = io.StringIO(newline="")
        w = csv.writer(stream, lineterminator="\n"); w.writerow(header); w.writerows(rows)
        compressed = gzip.compress(stream.getvalue().encode(), mtime=0)
        if len(compressed) > MAX_COMPRESSED:
            raise ValueError("A shard exceeds 4 MiB compressed; reduce --rows-per-shard or split the source file")
        output.append((compressed, len(rows), hashlib.sha256(compressed).hexdigest()))
    return header, output

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_file", type=Path)
    ap.add_argument("--repo", default=os.getenv("NOVA_GITHUB_REPO", "vutting895/VOOM_SYSTEM-NOVA-AI"))
    ap.add_argument("--branch", default=os.getenv("NOVA_GITHUB_BRANCH", "feature/mt5-git-market-data-store"))
    ap.add_argument("--symbol", default="XAUUSDm")
    ap.add_argument("--timeframe", choices=["M5", "TICK"], required=True)
    ap.add_argument("--kind", choices=["bars", "ticks"], required=True)
    ap.add_argument("--source-server", default="UNVERIFIED")
    ap.add_argument("--rows-per-shard", type=int, default=50000)
    args = ap.parse_args()
    if args.rows_per_shard < 1 or args.rows_per_shard > 50000: ap.error("--rows-per-shard must be 1..50000")
    token = os.getenv("NOVA_GITHUB_TOKEN")
    if not token: ap.error("Set NOVA_GITHUB_TOKEN in the environment; never put it in source code or CLI arguments")
    header, shards = csv_shards(args.csv_file, args.kind, args.rows_per_shard)
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root = f"datasets/market-data/{args.symbol}/{args.timeframe}/{args.kind}/{now}"
    objects, records = {}, []
    for i, (payload, count, digest) in enumerate(shards, 1):
        name = f"{root}/part-{i:05d}.csv.gz"
        objects[name] = payload
        records.append({"path": name, "rows": count, "sha256": digest, "bytes": len(payload)})
    manifest = {
        "schema_version": 1, "dataset_id": f"{args.symbol}-{args.timeframe}-{args.kind}-{now}",
        "symbol": args.symbol, "timeframe": args.timeframe, "kind": args.kind,
        "source_server": args.source_server, "source_file": args.csv_file.name,
        "exported_at_utc": now, "columns": header, "row_count": sum(x["rows"] for x in records),
        "shards": records, "provenance": "MT5 terminal export; source file hash recorded by uploader",
        "source_sha256": hashlib.sha256(args.csv_file.read_bytes()).hexdigest(),
    }
    manifest_path = f"{root}/manifest.json"
    objects[manifest_path] = (json.dumps(manifest, indent=2) + "\n").encode()
    client = GitHub(args.repo, token)
    sha = client.publish(args.branch, objects, f"data(mt5): publish {manifest['dataset_id']}")
    print(json.dumps({"status":"PUBLISHED", "commit":sha, "manifest":manifest_path,
                      "rows":manifest["row_count"], "shards":len(records)}, indent=2))

if __name__ == "__main__": main()

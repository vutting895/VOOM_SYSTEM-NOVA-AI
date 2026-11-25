#!/usr/bin/env python3
"""Read immutable MT5 market-data manifests and shards from a public NOVA GitHub ref."""
from __future__ import annotations
import argparse, gzip, hashlib, json, urllib.request
from pathlib import PurePosixPath

def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent":"NOVA-MT5-Git-Data-Reader"})
    with urllib.request.urlopen(req, timeout=60) as res: return res.read()

def load_dataset(repo: str, ref: str, manifest_path: str, output_dir: str):
    if ".." in PurePosixPath(manifest_path).parts or manifest_path.startswith("/"):
        raise ValueError("Invalid manifest path")
    base = f"https://raw.githubusercontent.com/{repo}/{ref}/"
    manifest = json.loads(fetch(base + manifest_path).decode("utf-8"))
    if manifest.get("schema_version") != 1: raise ValueError("Unsupported dataset schema")
    root = __import__("pathlib").Path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    written = []
    for shard in manifest.get("shards", []):
        rel = shard["path"]
        if ".." in PurePosixPath(rel).parts or rel.startswith("/"): raise ValueError("Unsafe shard path")
        compressed = fetch(base + rel)
        digest = hashlib.sha256(compressed).hexdigest()
        if digest != shard["sha256"]: raise ValueError(f"SHA-256 mismatch: {rel}")
        data = gzip.decompress(compressed)
        target = root / PurePosixPath(rel).name.replace(".gz", "")
        target.write_bytes(data)
        written.append({"path":str(target), "bytes":len(data), "sha256":hashlib.sha256(data).hexdigest()})
    return {"dataset_id":manifest["dataset_id"], "rows":manifest["row_count"], "files":written}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--repo",default="vutting895/VOOM_SYSTEM-NOVA-AI")
    ap.add_argument("--ref",default="main")
    ap.add_argument("--manifest",required=True)
    ap.add_argument("--out",default="nova_market_data")
    a=ap.parse_args()
    print(json.dumps(load_dataset(a.repo,a.ref,a.manifest,a.out),indent=2))

if __name__=="__main__": main()

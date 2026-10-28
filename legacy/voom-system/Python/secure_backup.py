from __future__ import annotations
import hashlib
import os
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
BACKUPS = ROOT / "Backups"
EXCLUDE_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv"}
EXCLUDE_SUFFIXES = {".pyc", ".pyo", ".ex5", ".ex4", ".pkl", ".log", ".db", ".sqlite", ".sqlite3"}
SECRET_NAMES = {".env", ".env.local", ".env.production", ".api_token", ".bridge_http_token", ".env.txt"}
ALLOW_ROOTS = [
    "Backtest", "Dashboard", "Docs", "EA", "Python", "Research",
    "Security_Dashboard", "Source1_Extracted", "Supabase", "Worker",
]
ALLOW_FILES = ["README.md"]
def is_safe(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDE_DIRS for part in rel.parts):
        return False
    name = path.name.lower()
    if name in SECRET_NAMES or name.startswith(".env.") and name not in {".env.example", ".env.example.txt"}:
        return False
    if name.endswith((".pem", ".key", ".pfx", ".p12", ".token", ".secret", ".credentials")):
        return False
    if path.suffix.lower() in EXCLUDE_SUFFIXES:
        return False
    if "logs" in {part.lower() for part in rel.parts}:
        return False
    return path.is_file()
def main() -> int:
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive = BACKUPS / f"Voom_system_safe_source_backup_{stamp}.zip"
    files = []
    for item in ALLOW_FILES:
        p = ROOT / item
        if p.is_file() and is_safe(p):
            files.append(p)
    for root_name in ALLOW_ROOTS:
        folder = ROOT / root_name
        if folder.exists():
            files.extend(p for p in folder.rglob("*") if is_safe(p))
    files = sorted(set(files))
    if not files:
        print("ERROR: no eligible source files found; no archive created")
        return 2
    manifest = []
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as zf:
        for path in files:
            arcname = path.relative_to(ROOT).as_posix()
            zf.write(path, arcname)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            manifest.append(f"{digest}  {arcname}")
        zf.writestr("BACKUP_MANIFEST_SHA256.txt", "\n".join(manifest) + "\n")
        zf.writestr("BACKUP_SCOPE.txt",
            "Source/documentation backup only. Excludes live secrets, tokens, logs, databases, "
            "compiled EA/model binaries, caches and virtual environments. Not an encryption "
            "mechanism. Store the archive in an access-controlled location and test restore.\n")
    with ZipFile(archive, "r") as check:
        bad = check.testzip()
        if bad:
            print("ERROR: archive verification failed at " + bad)
            return 3
        names = check.namelist()
    print("BACKUP_CREATED=" + str(archive))
    print("FILES_INCLUDED=" + str(len(files)))
    print("ZIP_INTEGRITY=PASS")
    print("MANIFEST=BACKUP_MANIFEST_SHA256.txt")
    print("SECRETS_INCLUDED=NO (excluded by policy)")
    print("DATABASES_AND_LOGS_INCLUDED=NO (excluded by policy)")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())

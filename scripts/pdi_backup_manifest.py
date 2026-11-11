#!/usr/bin/env python3
"""Create and verify a SHA-256 manifest for existing PostgreSQL backup exports.

This utility is intentionally offline: it does not connect to a database, execute SQL,
upload archives, delete files, or claim that a restore/archive has been tested.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

MANIFEST_VERSION = 1
REQUIRED_ARTIFACTS = ("roles", "schema", "data")
OPTIONAL_ARTIFACTS = ("migration_history_schema", "migration_history_data")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_artifact(root: Path, raw: str) -> tuple[str, Path]:
    rel = PurePosixPath(raw)
    if rel.is_absolute() or not rel.parts or any(part in ("", ".", "..") for part in rel.parts):
        raise ValueError(f"Unsafe artifact path: {raw!r}")
    candidate = root.joinpath(*rel.parts)
    if candidate.is_symlink():
        raise ValueError(f"Symlinks are not allowed: {raw}")
    resolved_root = root.resolve(strict=True)
    resolved = candidate.resolve(strict=True)
    if resolved_root not in resolved.parents or not resolved.is_file():
        raise ValueError(f"Artifact must be a regular file inside backup directory: {raw}")
    return rel.as_posix(), resolved


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def create_manifest(args: argparse.Namespace) -> int:
    root = Path(args.backup_dir).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("backup-dir must be a directory")
    artifacts: dict[str, dict[str, Any]] = {}
    for kind in REQUIRED_ARTIFACTS + OPTIONAL_ARTIFACTS:
        raw = getattr(args, kind, None)
        if not raw:
            continue
        rel, path = safe_artifact(root, raw)
        size = path.stat().st_size
        if size <= 0:
            raise ValueError(f"Backup artifact is empty: {rel}")
        artifacts[kind] = {"path": rel, "size_bytes": size, "sha256": sha256_file(path)}
    history_present = [kind in artifacts for kind in OPTIONAL_ARTIFACTS]
    if any(history_present) and not all(history_present):
        raise ValueError("Migration history schema and data artifacts must be supplied together")

    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "project": args.project,
        "project_ref": args.project_ref,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "backup_kind": "logical_postgresql",
        "tool": "pdi_backup_manifest.py",
        "artifacts": artifacts,
        "restore_test": {"status": "not_run", "environment": None, "tested_at": None},
        "archive": {"status": "not_archived", "location": None, "immutability": "unverified"},
    }
    output = root / "manifest.json"
    if output.exists() and not args.overwrite:
        raise FileExistsError("manifest.json already exists; use --overwrite only for an intentional manifest refresh")
    atomic_write(output, (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode())
    print(f"MANIFEST_CREATED {output}")
    for kind, item in artifacts.items():
        print(f"{kind}: {item['size_bytes']} bytes sha256={item['sha256']}")
    return 0


def verify_manifest(args: argparse.Namespace) -> int:
    root = Path(args.backup_dir).expanduser().resolve(strict=True)
    manifest_path = root / "manifest.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if data.get("manifest_version") != MANIFEST_VERSION:
        raise ValueError("Unsupported manifest_version")
    identity_errors: list[str] = []
    if args.project and data.get("project") != args.project:
        identity_errors.append("Project name mismatch")
    if args.project_ref and data.get("project_ref") != args.project_ref:
        identity_errors.append("Project ref mismatch")
    if identity_errors:
        for error in identity_errors:
            print(f"FAIL {error}", file=sys.stderr)
        return 2
    artifacts = data.get("artifacts")
    allowed = set(REQUIRED_ARTIFACTS + OPTIONAL_ARTIFACTS)
    if not isinstance(artifacts, dict) or not set(REQUIRED_ARTIFACTS).issubset(artifacts) or not set(artifacts).issubset(allowed):
        raise ValueError("Manifest must contain roles, schema, data, and only supported optional artifacts")
    history_present = [kind in artifacts for kind in OPTIONAL_ARTIFACTS]
    if any(history_present) and not all(history_present):
        raise ValueError("Migration history schema and data artifacts must be present together")

    errors: list[str] = []
    for kind in artifacts:
        item = artifacts[kind]
        try:
            _, path = safe_artifact(root, item["path"])
            actual_size = path.stat().st_size
            actual_hash = sha256_file(path)
            if actual_size != item.get("size_bytes"):
                errors.append(f"{kind}: size mismatch")
            if actual_hash != item.get("sha256"):
                errors.append(f"{kind}: SHA-256 mismatch")
            if actual_size <= 0:
                errors.append(f"{kind}: empty artifact")
        except Exception as exc:
            errors.append(f"{kind}: {exc}")
    if errors:
        for error in errors:
            print(f"FAIL {error}", file=sys.stderr)
        return 2
    print("BACKUP_INTEGRITY_PASS")
    print(f"project={data.get('project')} project_ref={data.get('project_ref')}")
    print(f"restore_test={data.get('restore_test', {}).get('status', 'unknown')}")
    print(f"archive={data.get('archive', {}).get('status', 'unknown')}")
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="Create a manifest for existing backup files")
    create.add_argument("--project", required=True)
    create.add_argument("--project-ref", required=True)
    create.add_argument("--backup-dir", required=True)
    create.add_argument("--roles", default="roles.sql")
    create.add_argument("--schema", default="schema.sql")
    create.add_argument("--data", default="data.sql")
    create.add_argument("--migration-history-schema")
    create.add_argument("--migration-history-data")
    create.add_argument("--overwrite", action="store_true")
    create.set_defaults(func=create_manifest)
    verify = commands.add_parser("verify", help="Verify all manifest artifact sizes and SHA-256 hashes")
    verify.add_argument("--backup-dir", required=True)
    verify.add_argument("--project")
    verify.add_argument("--project-ref")
    verify.set_defaults(func=verify_manifest)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return args.func(args)
    except Exception as exc:
        print(f"ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

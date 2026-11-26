#!/usr/bin/env python3
"""Run the Quant Engine foundation checks in a native CPython build environment.

This runner intentionally has no broker, network, database, or deployment access.
It mirrors the checks currently executed by quant-engine-foundation-ci.yml.
"""
from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "artifacts" / "quant-engine-ci-report.json"


def git_revision() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return os.environ.get("GITHUB_SHA") or os.environ.get("CF_BUILD_COMMIT_SHA")


def run_check(name: str, command: list[str], env: dict[str, str]) -> dict[str, Any]:
    print(f"\n=== {name} ===", flush=True)
    print("$ " + " ".join(command), flush=True)
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=15 * 60,
            check=False,
        )
        if result.stdout:
            print(result.stdout, end="" if result.stdout.endswith("\n") else "\n", flush=True)
        if result.stderr:
            print(result.stderr, end="" if result.stderr.endswith("\n") else "\n", file=sys.stderr, flush=True)
        return {
            "name": name,
            "command": command,
            "exit_code": result.returncode,
            "status": "passed" if result.returncode == 0 else "failed",
        }
    except subprocess.TimeoutExpired:
        print(f"FAILED: {name} exceeded 15 minutes", file=sys.stderr, flush=True)
        return {
            "name": name,
            "command": command,
            "exit_code": 124,
            "status": "timeout",
        }
    except OSError as exc:
        print(f"FAILED: unable to execute {name}: {exc}", file=sys.stderr, flush=True)
        return {
            "name": name,
            "command": command,
            "exit_code": 127,
            "status": "error",
        }


def main() -> int:
    if not (ROOT / "workers" / "quant_engine").is_dir():
        print("ERROR: Quant Engine package was not found from repository root.", file=sys.stderr)
        return 2

    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH")
    env["PYTHONPATH"] = str(ROOT) + (os.pathsep + existing_pythonpath if existing_pythonpath else "")

    checks = [
        run_check(
            "compile-quant-engine",
            [
                sys.executable,
                "-m",
                "compileall",
                "-q",
                "workers/quant_engine",
                "tests/test_quant_engine.py",
                "tests/test_quant_experiment_contract.py",
            ],
            env,
        ),
        run_check(
            "quant-engine-contract-tests",
            [
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                "tests",
                "-p",
                "test_quant*.py",
                "-v",
            ],
            env,
        ),
    ]

    report = {
        "schema_version": "nova.quant-engine-ci-report.v1",
        "suite": "quant-engine-foundation",
        "status": "passed" if all(item["status"] == "passed" for item in checks) else "failed",
        "commit_sha": git_revision(),
        "python_version": platform.python_version(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
    }

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("\n=== NOVA QUANT ENGINE CI REPORT ===", flush=True)
    print(json.dumps(report, indent=2), flush=True)

    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Python-owned CI orchestration for NOVA's Python and frontend checks.

Python controls sequencing, command execution, failure propagation, and logs.
Node.js remains a required toolchain for Vite, Node tests, and Wrangler.
"""
from __future__ import annotations

import argparse
import glob
import os
import subprocess
import sys
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[2]


class CiFailure(RuntimeError):
    pass


def run(label: str, command: Sequence[str], *, cwd: Path = ROOT) -> None:
    printable = " ".join(command)
    print(f"\n=== {label} ===\n$ {printable}", flush=True)
    completed = subprocess.run(
        list(command),
        cwd=cwd,
        env=os.environ.copy(),
        check=False,
    )
    if completed.returncode != 0:
        raise CiFailure(
            f"{label} failed with exit code {completed.returncode}: {printable}"
        )


def expand(pattern: str) -> list[str]:
    matches = sorted(glob.glob(str(ROOT / pattern)))
    if not matches:
        raise CiFailure(f"Required test pattern matched no files: {pattern}")
    return matches


def run_quant() -> None:
    run(
        "Compile Quant Engine and research tests",
        [
            sys.executable, "-m", "compileall", "-q",
            "workers/quant_engine",
            "tests/test_quant_engine.py",
            "tests/test_quant_experiment_contract.py",
            "tests/test_mtraders_native_hybrid.py",
            "tests/test_mtraders_backtest.py",
        ],
    )
    run(
        "Quant Engine contract tests",
        [sys.executable, "-m", "unittest", "discover", "-s", "tests",
         "-p", "test_quant*.py", "-v"],
    )
    run(
        "MTRADERS native and hybrid strategy tests",
        [sys.executable, "-m", "unittest", "discover", "-s", "tests",
         "-p", "test_mtraders_native_hybrid.py", "-v"],
    )
    run(
        "MTRADERS cost-aware backtest tests",
        [sys.executable, "-m", "unittest", "discover", "-s", "tests",
         "-p", "test_mtraders_backtest.py", "-v"],
    )


def run_frontend() -> None:
    # Python orchestrates the pipeline; Vite/Node/Wrangler still require Node.js.
    run("Install root Vite dependencies",
        ["npm", "install", "--no-package-lock", "--include=dev"])

    node_test_groups = [
        ("NOVA Demo-only read-only execution guard",
         ["tests/nova-trading-readonly-guard.test.mjs"]),
        ("Supabase Marketplace security migration contract",
         ["tests/supabase-marketplace-security-migration.test.mjs"]),
        ("Supabase Vault readiness and local secret boundaries",
         ["tests/secret-vault-readiness.test.mjs"]),
        ("NOVA durable approval lifecycle contracts",
         ["tests/nova-approval-migration.test.mjs"]),
        ("NOVA AI Worker authentication and safety contract",
         expand("integrations/nova-ai-worker/*.test.mjs")),
        ("NOVA System Integration Hub authorization and tenant boundaries",
         expand("integrations/system-hub/tests/*.test.mjs")),
        ("Remote MCP Exness MT5 read-only tools",
         expand("integrations/remote-mcp-worker/tests/*.test.mjs")),
        ("Tenant-isolated MT5 Bridge relay and proxy",
         ["integrations/mt5-bridge-relay/worker.test.mjs",
          "integrations/mt5-readonly-proxy/worker.test.mjs"]),
    ]
    for label, files in node_test_groups:
        run(label, ["node", "--test", *files])

    run("Syntax-check staging customer isolation harness",
        ["node", "--check", "tests/staging-customer-isolation.mjs"])
    run("Compile MT5 Bridge and outbound relay client",
        [sys.executable, "-m", "py_compile",
         "integrations/mt5-readonly-bridge/bridge.py",
         "integrations/mt5-readonly-bridge/bridge_relay_client.py"])
    run("Test MT5 tenant guard contract",
        [sys.executable, "-m", "unittest", "discover", "-s",
         "integrations/mt5-readonly-bridge", "-p", "test_*.py"])
    run("Install pinned Wrangler without changing lockfiles",
        ["npm", "install", "--no-save", "--package-lock=false",
         "wrangler@4.156.0"])
    run("Validate tenant relay Durable Object configuration",
        ["npx", "wrangler", "deploy", "--dry-run", "--config",
         "integrations/mt5-bridge-relay/wrangler.jsonc"])
    run("Validate NOVA System Integration Hub Worker bundle",
        ["npx", "wrangler", "deploy", "--dry-run", "--config",
         "integrations/system-hub/wrangler.jsonc"])
    run("Build root Vite frontend", ["npm", "run", "build"])


def main() -> int:
    parser = argparse.ArgumentParser(description="NOVA Python CI controller")
    parser.add_argument("--suite", choices=("quant", "frontend"), required=True)
    args = parser.parse_args()
    print(f"NOVA CI controller | suite={args.suite} | python={sys.version.split()[0]}",
          flush=True)
    try:
        run_quant() if args.suite == "quant" else run_frontend()
    except CiFailure as exc:
        print(f"\nCI FAILURE: {exc}", file=sys.stderr, flush=True)
        return 1
    print(f"\nCI PASS: {args.suite}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '%s\n' "[1/3] Read-only environment defaults"
LIVE_TRADING_ENABLED=false \
BROKER_WRITES_ENABLED=false \
NOVA_APPROVALS_ENABLED=false \
NEXT_PUBLIC_NOVA_APPROVALS_ENABLED=false \
  bash scripts/provision-secrets-check.sh

printf '%s\n' "[2/3] Python syntax"
python -m compileall -q workers integrations/notifications integrations/mt5-relay

printf '%s\n' "[3/3] Focused tests (if pytest is installed)"
if python -c "import pytest" >/dev/null 2>&1; then
  python -m pytest -q integrations/mt5-readonly-bridge/test_tenant_guard.py
else
  printf '%s\n' "pytest unavailable; install workers/requirements.txt to run tests"
fi
printf '%s\n' "Local release-gate commands completed; this is not a deployment claim."

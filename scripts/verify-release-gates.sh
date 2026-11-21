#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '%s\n' "[1/4] Read-only environment defaults"
LIVE_TRADING_ENABLED=false \
BROKER_WRITES_ENABLED=false \
NOVA_APPROVALS_ENABLED=false \
NEXT_PUBLIC_NOVA_APPROVALS_ENABLED=false \
  bash scripts/provision-secrets-check.sh

printf '%s\n' "[2/4] Python syntax"
python -m compileall -q workers integrations/notifications integrations/mt5-relay tests/test_readonly_starter.py

printf '%s\n' "[3/4] Python read-only/security tests"
python -m pytest -q tests/test_readonly_starter.py integrations/mt5-readonly-bridge/test_tenant_guard.py

printf '%s\n' "[4/4] Existing durable approval and MT5 proxy contracts"
if command -v node >/dev/null 2>&1; then
  node --test \
    tests/nova-approval-contract.test.mjs \
    tests/nova-approval-api.test.mjs \
    tests/nova-approval-migration.test.mjs \
    tests/nova-trading-readonly-guard.test.mjs \
    integrations/mt5-readonly-proxy/worker.test.mjs
else
  printf '%s\n' "Node.js unavailable; JavaScript contract tests not run"
  exit 1
fi

printf '%s\n' "Local checks completed. No deployment was performed."

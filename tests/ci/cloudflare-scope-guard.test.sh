#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(git rev-parse --show-toplevel)"
source "$ROOT_DIR/scripts/ci/cloudflare-scope-guard.sh"

for path in \
  "integrations/nova-ai-mcp-full-clean/mcp-server/Dockerfile" \
  "infra/docker-compose.yaml" \
  "integrations/mt5-readonly-bridge/run-bridge.ps1" \
  "scripts/windows/provision.psm1" \
  "supabase/migrations/20261115000100_test.sql" \
  "package-lock.json"; do
  if ! is_unsupported_path "$path"; then
    printf 'FAIL: expected unsupported path to be blocked: %s\n' "$path" >&2
    exit 1
  fi
done

for path in "frontend/src/components/button.tsx" "docs/architecture/overview.md" "workers/quant_engine/engine.py" "tests/test_quant_engine.py"; do
  if is_unsupported_path "$path"; then
    printf 'FAIL: portable path was incorrectly blocked: %s\n' "$path" >&2
    exit 1
  fi
done

printf '%s\n' "PASS: Cloudflare CI scope-guard regression cases"

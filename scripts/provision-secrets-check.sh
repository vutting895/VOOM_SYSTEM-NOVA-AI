#!/usr/bin/env bash
set -euo pipefail

# Presence-only check. Never print values, lengths, or tenant route mappings.
required_flags=(
  LIVE_TRADING_ENABLED
  BROKER_WRITES_ENABLED
  NOVA_APPROVALS_ENABLED
  NEXT_PUBLIC_NOVA_APPROVALS_ENABLED
)
failed=0
for name in "${required_flags[@]}"; do
  value="${!name-}"
  if [[ "$value" != "false" ]]; then
    printf '%s: REQUIRED_DISABLED (value hidden)\n' "$name"
    failed=1
  else
    printf '%s: disabled (value hidden)\n' "$name"
  fi
done

for name in MT5_TENANT_ROUTES MT5_BRIDGE_TOKEN NOVA_TELEGRAM_BOT_TOKEN; do
  if [[ -n "${!name-}" ]]; then
    printf '%s: configured (value hidden)\n' "$name"
  else
    printf '%s: not configured (value hidden)\n' "$name"
  fi
done
exit "$failed"

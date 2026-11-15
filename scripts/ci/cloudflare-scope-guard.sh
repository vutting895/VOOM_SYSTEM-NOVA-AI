#!/usr/bin/env bash
# Return success when a changed path requires a gate unavailable in Workers Builds.
is_unsupported_path() {
  local path="$1"
  case "$path" in
    # PostgreSQL/Supabase migration and Auth/PostgREST integration gates.
    supabase/migrations/*|supabase/config.toml|tests/sql/*|frontend/app/api/agent/*|frontend/app/api/agent/**|frontend/lib/agent-approval-server.js|frontend/scripts/nova-approval-local-supabase.integration.mjs|frontend/package-lock.json|.github/workflows/nova-approval-migration-ci.yml|.github/workflows/nova-video-migration-ci.yml)
      return 0
      ;;
    # Docker-backed Quant/SMC gates: catch Dockerfiles and Compose files at any depth.
    Dockerfile|*Dockerfile*|*docker-compose*.yml|*docker-compose*.yaml|*compose*.yml|*compose*.yaml|workers/requirements.txt|workers/feature/smc_wave/*|workers/feature/smc_wave/**|workers/feature/elliott_wave/*|workers/feature/elliott_wave/**|workers/backtest/*|workers/backtest/**|workers/alerts/*|workers/alerts/**|workers/risk/*|workers/risk/**|workers/runtime.py|workers/quant_engine/*|workers/quant_engine/**|tests/test_quant*.py|docs/INTERNAL-QUANT-ENGINE-ARCHITECTURE.md|tests/test_smc_strategy.py|tests/test_smc_pytest.py|tests/test_telegram_alerts.py|tests/test_runtime_api.py|tests/test_research_pipeline.py|tests/fixtures/btcusdt_1h_binance_sample.json|package.json|server.ts|package-lock.json|integrations/remote-mcp-worker/src/index.js|integrations/remote-mcp-worker/tests/*|integrations/remote-mcp-worker/tests/**|integrations/remote-mcp-worker/package.json|.github/workflows/smc-research-ci.yml|.github/workflows/quant-engine-foundation-ci.yml)
      return 0
      ;;
    # Windows-hosted PowerShell/runtime acceptance gates.
    tools/windows/*|tools/windows/**|integrations/mt5-readonly-bridge/*|integrations/mt5-readonly-bridge/**|*.ps1|*.psm1|*.psd1|README.md|.github/workflows/windows-runtime-ci.yml)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

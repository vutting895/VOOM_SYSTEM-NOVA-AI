#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/ci/cloudflare-scope-guard.sh"

log() { printf '\n[NOVA-CF-CI] %s\n' "$*"; }
run() { log "RUN: $*"; "$@"; }

export PYTHONPATH="$ROOT_DIR${PYTHONPATH:+:$PYTHONPATH}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-ci-placeholder-not-a-secret}"
export NEXT_PUBLIC_SYSTEM_HUB_URL="${NEXT_PUBLIC_SYSTEM_HUB_URL:-https://example.invalid}"
export NEXT_PUBLIC_TURNSTILE_SITE_KEY="${NEXT_PUBLIC_TURNSTILE_SITE_KEY:-0x4AAAAAAFlosj98ci8iYugG}"
export NEXT_TELEMETRY_DISABLED=1

log "NOVA portable CI starting"
node --version
python --version

# Workers Builds provides Linux, Node.js and Python, but not a Docker daemon
# or a Windows host. Fail closed when a change requires those unsupported gates.
: "${WORKERS_CI_BRANCH:?WORKERS_CI_BRANCH must identify the Cloudflare build branch}"
: "${WORKERS_CI_COMMIT_SHA:?WORKERS_CI_COMMIT_SHA must identify the exact checkout commit}"
head_sha="$WORKERS_CI_COMMIT_SHA"
actual_head="$(git rev-parse HEAD)"
if [[ "$head_sha" != "$actual_head" ]]; then
  log "BLOCKED: requested commit $head_sha does not match checked-out HEAD $actual_head"
  exit 2
fi
log "Verified checkout SHA: $actual_head"
log "Checking changed-file scope for branch ${WORKERS_CI_BRANCH}"
git fetch --no-tags origin main
if [[ "${WORKERS_CI_BRANCH}" == "main" ]]; then
  base_sha="$(git rev-parse "${head_sha}^")"
else
  base_sha="$(git merge-base origin/main "$head_sha")"
fi
changed_files="$(git diff --name-only "$base_sha" "$head_sha")"
unsupported=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  if is_unsupported_path "$path"; then unsupported+=("$path"); fi
done <<< "$changed_files"
if (( ${#unsupported[@]} > 0 )); then
  printf '\n[NOVA-CF-CI] BLOCKED: this change requires gates not available in Workers Builds:\n'
  printf '  - %s\n' "${unsupported[@]}"
  printf '%s\n' "Required separate gates: PostgreSQL/Supabase integration, Docker builds, and/or Windows PowerShell runtime checks."
  exit 2
fi

run bash tests/ci/cloudflare-scope-guard.test.sh
run npm install --no-package-lock --include=dev

# Frontend, API, Worker, authentication, tenant-isolation and read-only safety tests.
run node --test tests/nova-trading-readonly-guard.test.mjs
run node --test tests/supabase-marketplace-security-migration.test.mjs
run node --test tests/secret-vault-readiness.test.mjs
run node --test tests/nova-approval-migration.test.mjs
run node --check tests/staging-customer-isolation.mjs
run node --test integrations/nova-ai-worker/*.test.mjs
run node --test integrations/system-hub/tests/*.test.mjs
run node --test integrations/remote-mcp-worker/tests/*.test.mjs
run node --test integrations/mt5-bridge-relay/worker.test.mjs integrations/mt5-readonly-proxy/worker.test.mjs

# Python bridge, Quant, SMC research and CI-inspector suites.
run python -m pip install --disable-pip-version-check -r workers/requirements.txt
run python -m py_compile integrations/mt5-readonly-bridge/bridge.py integrations/mt5-readonly-bridge/bridge_relay_client.py
run python -m unittest discover -s integrations/mt5-readonly-bridge -p "test_*.py" -v
run python -m compileall -q workers/quant_engine tests/test_quant_engine.py tests/test_quant_experiment_contract.py
run python -m unittest discover -s tests -p "test_quant*.py" -v
run python -m py_compile workers/feature/smc_wave/smc_strategy.py
run python -m unittest discover -s tests -p "test_smc_strategy.py" -v
run python -m pytest tests/test_smc_pytest.py tests/test_telegram_alerts.py tests/test_runtime_api.py tests/test_research_pipeline.py -q
run python -m py_compile tools/ci-inspector/inspect.py tools/ci-inspector/test_inspect.py
run python -m unittest discover -s tools/ci-inspector -p "test_*.py" -v

# Validate Cloudflare Worker bundles without deploying product Workers.
run npm install --no-save --package-lock=false wrangler@4.156.0
run npx wrangler deploy --dry-run --config integrations/mt5-bridge-relay/wrangler.jsonc
run npx wrangler deploy --dry-run --config integrations/system-hub/wrangler.jsonc
run npm run build

# Preserve the existing production Netlify smoke test on main pushes.
if [[ "${WORKERS_CI_BRANCH:-}" == "main" ]]; then
  body="$(mktemp)"
  trap 'rm -f "$body"' EXIT
  for path in / /login /settings/broker; do
    healthy=false
    for attempt in $(seq 1 12); do
      code="$(curl --silent --show-error --location --max-time 20 -o "$body" -w '%{http_code}' "https://voomsystem.netlify.app$path" || true)"
      if [[ "$code" == "200" ]]; then healthy=true; break; fi
      log "Netlify $path returned HTTP $code; retry $attempt/12"
      sleep 10
    done
    [[ "$healthy" == "true" ]] || { log "Netlify production smoke test failed for $path"; exit 1; }
  done
  grep -Eq 'Exness Demo|Exness MT5' "$body" || { log "Broker settings page content check failed"; exit 1; }
fi

log "PASS: all portable Node/Python/build checks completed"
log "NOT INCLUDED: Docker image/Compose tests, local PostgreSQL/Supabase Auth integration, and Windows PowerShell host tests."
log "These gates are explicitly blocked by scope detection when their source files change; this check must not be represented as the full NOVA CI suite."

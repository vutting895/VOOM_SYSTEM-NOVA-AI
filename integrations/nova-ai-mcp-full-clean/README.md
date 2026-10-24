# NOVA AI MCP FULL CLEAN — imported source archive

Original Meta AI shared artifact: https://www.meta.ai/share/a/d783951e-bc9e-49f0-9a05-b4f4539597fb
Archive filename: NOVA-AI-MCP-FULL-CLEAN.zip
Imported on 2026-10-24.

## Status
This directory preserves the archive's Python prototype. It is not production-ready and must not be deployed as-is. The original server's backtest/tuning metrics are random mock data; the feature workers are partial examples; state is in-memory.

## Safety review
- `workers/execution/ccxt_exec.py` can submit real exchange orders if called with live credentials. Keep it disabled and do not configure live keys.
- The original `docker-compose.yml` contains a hard-coded database password and should not be used. Use secret-managed credentials and private networking instead.
- Do not expose the FastAPI server publicly without authentication, rate limiting, and request validation.
- Do not treat the source's random score/60% quality gate as a validated backtest.
- The deployed Cloudflare adapter is separate from the Python source. It is paper/test only and explicitly disables execution.

## Python prototype
- `mcp-server/server.py`: FastAPI prototype with generate/strategies/allocate routes.
- `mcp-server/requirements.txt`: source dependencies.
- `mcp-server/Dockerfile`: container recipe for local testing only.
- `workers/`: sample ingestion, features, learning, tuning, backtest, risk and execution modules.

## Cloudflare adapter
The paper-only adapter is at `cloudflare-worker/src/index.js`. Its deployment is tracked independently from this repository. The current Cloudflare account API accepted the Worker upload, but the workers.dev subdomain remains disabled for this script, so the public endpoint has not passed HTTP verification. Do not claim it is publicly available until the subdomain is enabled and /health returns HTTP 200.

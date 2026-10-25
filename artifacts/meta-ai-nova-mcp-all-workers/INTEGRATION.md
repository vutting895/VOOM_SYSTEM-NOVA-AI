# Meta AI artifact integration record

- Artifact: `Nova Mcp All Workers`
- Source: https://www.meta.ai/share/a/7ea11340-ea96-46c6-b209-21c1141f516c
- Local archive: `nova-mcp-all-workers.zip` (20,469 bytes; ZIP integrity checked locally)
- Companion archive: `nova-mcp-complete.zip` (15,391 bytes; text/container export)
- Extracted source is retained on the Windows machine under `C:\\Program Files\\voom_system\\artifacts\\meta-ai-nova-mcp-all-workers\\extracted\\nova-mcp-package\\`.
- Prototype workers in the active project use `_prototype.py` suffixes and are not wired into the active pipeline.
- `workers/execution/ccxt_exec.py` in the active project blocks order attempts. The upstream direct-CCXT order-submission source is intentionally not copied into the active execution path.
- The upstream Docker Compose file contains a hard-coded database password and is intentionally not activated or copied as deployment configuration.

## Validation warnings

The source artifact contains randomized/mock backtest and tuning logic, synthetic ML features, hard-coded sample risk values, and a prototype FastAPI server with in-memory storage. These are not production performance results. Its FastAPI server and Docker Compose were not activated or substituted for the existing stdio MCP server. No live broker connection or live order execution was enabled.

## Tests recorded on Windows

- Python compileall for NOVA MCP and workers: passed.
- Execution guard unit check: passed (order attempt raises `ExecutionDisabledError`).
- Portfolio allocation checks: 10% accepted; 21% and 0% rejected under the configured 20% limit.
- Frontend HTTP smoke check: 200 OK.

## Not yet verified

Real market data ingestion, ML model dependencies and training, point-in-time leakage, realistic backtest fills/fees/slippage, production MCP-to-worker integration, Git synchronization from Windows, and deployment.

## Repository upload note

This record and the manifest are uploaded to GitHub. Binary ZIP archives are not embedded in this commit; the original archives remain on the Windows machine at the path above. The extracted files are reference prototypes only and must not be reported as production-validated.

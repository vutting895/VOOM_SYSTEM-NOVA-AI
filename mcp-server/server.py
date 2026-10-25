"""Deprecated compatibility notice.

The old FastAPI implementation generated random mock backtest/tuning results.
It is preserved unchanged in server_legacy_mock.py for audit only.
Use app.py as the single canonical MCP stdio server.
This module intentionally starts no HTTP service.
"""

if __name__ == "__main__":
    raise SystemExit(
        "Deprecated mock API disabled. Start the canonical MCP server with: "
        "python mcp-server/app.py"
    )

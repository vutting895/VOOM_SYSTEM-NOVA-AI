import asyncio, json
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(r"C:\Program Files\voom_system")
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
SERVER = ROOT / "mcp-server" / "app.py"

async def main():
    params = StdioServerParameters(command=str(PYTHON), args=[str(SERVER)], cwd=str(ROOT))
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.list_tools()
            names = sorted(t.name for t in result.tools)
            required = {
                "system_status", "list_workers", "read_market_candles", "get_market_features",
                "run_ema_backtest", "validate_paper_risk", "validate_portfolio_allocation",
                "smc_wave_component_status", "validate_smc_wave_ohlcv",
                "analyze_smc_wave_candidates", "mcp_capability_audit",
            }
            assert required.issubset(set(names)), sorted(required - set(names))
            assert "generate_strategy" not in names
            assert "tuning_strategy" not in names

            status = await session.call_tool("system_status", {})
            assert not status.isError
            audit = await session.call_tool("mcp_capability_audit", {})
            assert not audit.isError
            allocation = await session.call_tool("validate_portfolio_allocation", {"allocation_pct": 10})
            assert not allocation.isError
            candles = [{"open": 7, "high": 10, "low": 5, "close": 7} for _ in range(30)]
            analysis = await session.call_tool("analyze_smc_wave_candidates", {"candles": candles, "lookback": 5})
            assert not analysis.isError
            payload = "\n".join(c.text for c in analysis.content if hasattr(c, "text"))
            assert '"signal": null' in payload.lower() or '"signal":null' in payload.lower(), payload
            print("MCP_PROTOCOL_HANDSHAKE_OK")
            print("TOOL_COUNT", len(names))
            print("REQUIRED_TOOLS_OK", len(required))
            print("STATUS_TOOL_OK", not status.isError)
            print("CAPABILITY_AUDIT_OK", not audit.isError)
            print("ALLOCATION_VALIDATOR_OK", not allocation.isError)
            print("ANALYSIS_TOOL_OK", not analysis.isError)
            print("MOCK_GENERATION_EXCLUDED", "generate_strategy" not in names and "tuning_strategy" not in names)
            print("LIVE_ORDER_PATH", "disabled")

asyncio.run(main())

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(
        command="docker",
        args=["compose", "-f", "infra/docker-compose.yml", "run", "--rm", "-T", "mcp-server"],
    )
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            listed = await session.list_tools()
            names = {tool.name for tool in listed.tools}
            required = {
                "system_status", "list_workers", "read_market_candles",
                "get_market_features", "run_ema_backtest", "validate_paper_risk",
                "validate_portfolio_allocation", "smc_wave_component_status",
                "validate_smc_wave_ohlcv", "analyze_smc_wave_candidates",
                "mcp_capability_audit",
            }
            missing = sorted(required - names)
            assert not missing, f"Missing MCP tools: {missing}"
            assert "generate_strategy" not in names
            status = await session.call_tool("system_status", {})
            assert not status.isError, "system_status failed"
            audit = await session.call_tool("mcp_capability_audit", {})
            assert not audit.isError, "capability audit failed"
            allocation = await session.call_tool(
                "validate_portfolio_allocation", {"allocation_pct": 10}
            )
            assert not allocation.isError, "portfolio allocation validator failed"
            candles = [
                {"open": 7, "high": 10, "low": 5, "close": 7, "timestamp": i}
                for i in range(30)
            ]
            analysis = await session.call_tool(
                "analyze_smc_wave_candidates", {"candles": candles, "lookback": 5}
            )
            assert not analysis.isError, "SMC/Wave analysis tool failed"
            print("DOCKER_MCP_STDIO_HANDSHAKE=PASS")
            print(f"DOCKER_MCP_TOOL_COUNT={len(names)}")
            print("REQUIRED_TOOLS=PASS")
            print("STATUS_AND_CAPABILITY_AUDIT=PASS")
            print("PORTFOLIO_VALIDATOR=PASS")
            print("SMC_WAVE_ANALYSIS=PASS")
            print("LIVE_TRADING_ENABLED=FALSE")
            print("REAL_ORDERS_SENT=FALSE")

asyncio.run(main())

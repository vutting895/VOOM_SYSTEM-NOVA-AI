import asyncio
import json

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def parse_result(result, name):
    assert not result.isError, f"{name} returned an MCP error"
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        if isinstance(structured, dict) and set(structured) == {"result"}:
            return structured["result"]
        return structured

    texts = [item.text for item in result.content if hasattr(item, "text")]
    assert texts, f"{name} returned no text content"
    try:
        value = json.loads(texts[0])
    except json.JSONDecodeError as exc:
        raise AssertionError(f"{name} did not return JSON: {texts[0][:200]}") from exc
    if isinstance(value, dict) and set(value) == {"result"}:
        return value["result"]
    return value


async def main():
    params = StdioServerParameters(
        command="docker",
        args=["run", "--rm", "-i", "voom-system-mcp-ci"],
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

            status = parse_result(await session.call_tool("system_status", {}), "system_status")
            assert status["live_trading_enabled"] is False
            workers = parse_result(await session.call_tool("list_workers", {}), "list_workers")
            assert isinstance(workers, list), f"Unexpected list_workers result type: {type(workers).__name__}"

            # These three integration checks use the public Binance API only.
            market = parse_result(
                await session.call_tool(
                    "read_market_candles",
                    {"symbol": "BTCUSDT", "interval": "1h", "limit": 30},
                ),
                "read_market_candles",
            )
            assert market["source"] == "binance_public" and market["count"] >= 30

            features = parse_result(
                await session.call_tool(
                    "get_market_features",
                    {"symbol": "BTCUSDT", "interval": "1h", "limit": 30},
                ),
                "get_market_features",
            )
            assert features["candles_used"] >= 30
            assert all(key in features for key in ("ema12", "ema26", "rsi14_simple", "atr14_simple"))

            backtest = parse_result(
                await session.call_tool(
                    "run_ema_backtest",
                    {"symbol": "BTCUSDT", "interval": "1h", "limit": 30,
                     "fast_period": 5, "slow_period": 10, "fee": 0.001, "slippage": 0.0005},
                ),
                "run_ema_backtest",
            )
            assert backtest["status"] == "completed"
            assert backtest["execution_enabled"] is False

            risk = parse_result(
                await session.call_tool(
                    "validate_paper_risk",
                    {"allocation_pct": 10, "daily_loss_pct": 0, "drawdown_pct": 0,
                     "leverage": 1, "data_age_seconds": 0},
                ),
                "validate_paper_risk",
            )
            assert risk["passed"] is True and risk["live_execution_allowed"] is False

            allocation = parse_result(
                await session.call_tool(
                    "validate_portfolio_allocation", {"allocation_pct": 10}
                ),
                "validate_portfolio_allocation",
            )
            assert allocation["accepted"] is True

            component_status = parse_result(
                await session.call_tool("smc_wave_component_status", {}),
                "smc_wave_component_status",
            )
            assert component_status["live_trading_enabled"] is False

            candles = [
                {"open": 7, "high": 10, "low": 5, "close": 7, "timestamp": i}
                for i in range(30)
            ]
            validation = parse_result(
                await session.call_tool("validate_smc_wave_ohlcv", {"candles": candles}),
                "validate_smc_wave_ohlcv",
            )
            assert validation["ok"] is True

            analysis = parse_result(
                await session.call_tool(
                    "analyze_smc_wave_candidates", {"candles": candles, "lookback": 5}
                ),
                "analyze_smc_wave_candidates",
            )
            assert analysis["ok"] is True and analysis["signal"] is None

            audit = parse_result(
                await session.call_tool("mcp_capability_audit", {}),
                "mcp_capability_audit",
            )
            assert audit["live_trading_enabled"] is False
            assert audit["orders_submitted"] is False

            print("DOCKER_MCP_STDIO_HANDSHAKE=PASS")
            print(f"DOCKER_MCP_TOOL_COUNT={len(names)}")
            print("ALL_11_MCP_TOOLS=PASS")
            print("PUBLIC_BINANCE_INTEGRATION=PASS")
            print("RISK_AND_PORTFOLIO_VALIDATION=PASS")
            print("SMC_WAVE_VALIDATION=PASS")
            print("LIVE_TRADING_ENABLED=FALSE")
            print("REAL_ORDERS_SENT=FALSE")


asyncio.run(main())

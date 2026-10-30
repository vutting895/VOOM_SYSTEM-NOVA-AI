"""Container-level MCP stdio handshake and safe-tool smoke tests."""
import asyncio
import json

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def parse_result(result, name):
    if result.isError:
        details = [item.text for item in result.content if hasattr(item, "text")]
        raise AssertionError(f"{name} returned an MCP error: {details[:1]}")
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        if isinstance(structured, dict) and set(structured) == {"result"}:
            return structured["result"]
        return structured

    texts = [item.text for item in result.content if hasattr(item, "text")]
    assert texts, f"{name} returned no content"
    try:
        value = json.loads(texts[0])
    except json.JSONDecodeError as exc:
        raise AssertionError(f"{name} did not return JSON: {texts[0][:200]}") from exc
    if isinstance(value, dict) and set(value) == {"result"}:
        return value["result"]
    return value


def sample_candles():
    closes = [10, 9, 8, 9, 11, 10, 9, 12, 13, 11, 10, 14, 15, 13, 12, 16, 17, 15, 14, 18]
    result = []
    for index, close in enumerate(closes):
        open_price = close - 0.4 if index % 2 else close + 0.4
        result.append({
            "open": open_price,
            "high": max(open_price, close) + 0.5,
            "low": min(open_price, close) - 0.5,
            "close": close,
            "volume": 1000.0,
            "timestamp": f"2026-01-{index + 1:02d}T00:00:00Z",
        })
    return result


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
                "validate_portfolio_allocation", "smc_engine_status",
                "analyze_smc_market_structure", "run_smc_research_backtest",
                "mcp_capability_audit",
            }
            missing = sorted(required - names)
            assert not missing, f"Missing MCP tools: {missing}"
            assert "generate_strategy" not in names
            assert "tuning_strategy" not in names

            status = parse_result(await session.call_tool("system_status", {}), "system_status")
            assert status["live_trading_enabled"] is False
            assert status["execution_enabled"] is False
            assert status["modules_present"]["workers"] is True

            workers = parse_result(await session.call_tool("list_workers", {}), "list_workers")
            assert isinstance(workers, list) and workers

            risk = parse_result(await session.call_tool(
                "validate_paper_risk",
                {"allocation_pct": 10, "daily_loss_pct": 0, "drawdown_pct": 0,
                 "leverage": 1, "data_age_seconds": 0},
            ), "validate_paper_risk")
            assert risk["passed"] is True
            assert risk["live_execution_allowed"] is False

            rejected_risk = parse_result(await session.call_tool(
                "validate_paper_risk",
                {"allocation_pct": 99, "daily_loss_pct": 0, "drawdown_pct": 0,
                 "leverage": 1, "data_age_seconds": 0},
            ), "validate_paper_risk")
            assert rejected_risk["passed"] is False
            assert rejected_risk["live_execution_allowed"] is False

            allocation = parse_result(await session.call_tool(
                "validate_portfolio_allocation", {"allocation_pct": 10}
            ), "validate_portfolio_allocation")
            assert allocation["accepted"] is True
            assert allocation["execution_enabled"] is False

            bars = sample_candles()
            smc_status = parse_result(await session.call_tool("smc_engine_status", {}), "smc_engine_status")
            assert smc_status["live_trading_enabled"] is False

            analysis = parse_result(await session.call_tool(
                "analyze_smc_market_structure", {"candles": bars}
            ), "analyze_smc_market_structure")
            assert analysis["ok"] is True
            assert analysis["live_trading_enabled"] is False
            assert analysis["orders_submitted"] is False
            assert analysis["signal"] is None

            backtest = parse_result(await session.call_tool(
                "run_smc_research_backtest", {"candles": bars}
            ), "run_smc_research_backtest")
            assert backtest["ok"] is True
            assert backtest["live_trading_enabled"] is False
            assert backtest["orders_submitted"] is False

            audit = parse_result(await session.call_tool("mcp_capability_audit", {}), "mcp_capability_audit")
            assert audit["live_trading_enabled"] is False
            assert audit["orders_submitted"] is False
            assert "read_market_candles" in audit["tools_in_this_server"]

            invalid = await session.call_tool(
                "analyze_smc_market_structure", {"candles": bars[:5]}
            )
            assert invalid.isError, "SMC engine must reject short/invalid OHLC input"

            print("DOCKER_MCP_STDIO_HANDSHAKE=PASS")
            print(f"MCP_TOOL_COUNT={len(names)}")
            print("PAPER_RISK_ALLOW_AND_DENY=PASS")
            print("PORTFOLIO_VALIDATION=PASS")
            print("CANONICAL_SMC_ANALYSIS_AND_BACKTEST=PASS")
            print("INVALID_INPUT_REJECTION=PASS")
            print("LIVE_TRADING_ENABLED=FALSE")
            print("REAL_ORDERS_SENT=FALSE")


asyncio.run(main())

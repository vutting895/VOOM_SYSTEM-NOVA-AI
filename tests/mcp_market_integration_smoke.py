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
            market = await session.call_tool("read_market_candles", {"symbol": "BTCUSDT", "interval": "1h", "limit": 100})
            assert not market.isError, market
            payload = json.loads("\n".join(c.text for c in market.content if hasattr(c, "text")))
            assert payload["source"] == "binance_public" and payload["count"] >= 30
            assert all({"timestamp","open","high","low","close","volume"}.issubset(row) for row in payload["candles"])
            print("PUBLIC_MARKET_DATA_OK", payload["source"], payload["symbol"], payload["interval"], payload["count"])
            print("DATA_RANGE_UTC", payload["candles"][0]["timestamp"], payload["candles"][-1]["timestamp"])

            features = await session.call_tool("get_market_features", {"symbol": "BTCUSDT", "interval": "1h", "limit": 100})
            assert not features.isError, features
            f = json.loads("\n".join(c.text for c in features.content if hasattr(c, "text")))
            assert f["source"] == "binance_public" and f["signal"] is None
            assert all(isinstance(f[k], (int, float)) for k in ("last_close","ema12","ema26","rsi14_simple","atr14_simple"))
            print("FEATURE_CALCULATION_OK", "EMA12/26 RSI14 ATR14")
            print("LATEST_CLOSE", f["last_close"], "RSI14", round(f["rsi14_simple"], 3))

            bt = await session.call_tool("run_ema_backtest", {
                "symbol":"BTCUSDT","interval":"1h","limit":100,
                "fast_period":12,"slow_period":26,"fee":0.001,"slippage":0.0005
            })
            assert not bt.isError, bt
            b = json.loads("\n".join(c.text for c in bt.content if hasattr(c, "text")))
            assert b["source"] == "historical_ohlcv" and b["execution_enabled"] is False
            print("HISTORICAL_BACKTEST_OK", b["candles"], "candles", b["total_trades"], "trades")
            print("BACKTEST_METRICS", "return_pct=", b["total_return_pct"], "max_drawdown_pct=", b["max_drawdown_pct"], "profit_factor=", b["profit_factor"])
            print("LIVE_ORDERS", "disabled")

asyncio.run(main())

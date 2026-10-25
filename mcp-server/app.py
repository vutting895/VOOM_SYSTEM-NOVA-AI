"""VOOM_SYSTEM NOVA MCP server. Stdio-only; tools are read-only/research-only."""
from pathlib import Path
from datetime import datetime, timezone
import json
from mcp.server.fastmcp import FastMCP

mcp=FastMCP("voom-system")
ROOT=Path(__file__).resolve().parents[1]
LIVE_TRADING_ENABLED=False

@mcp.tool()
def system_status() -> dict:
    """Return project identity, module presence and safe execution posture."""
    modules={name:(ROOT/name).is_dir() for name in ("frontend","mcp-server","workers","infra","shared")}
    return {"project":"voom_system","architecture":"nova","status":"local_scaffold",
            "modules_present":modules,"all_top_level_modules_present":all(modules.values()),
            "live_trading_enabled":False,"execution_enabled":False,"checked_at":datetime.now(timezone.utc).isoformat()}

@mcp.tool()
def list_workers() -> list[dict]:
    """List worker files and clearly label prototype files."""
    base=ROOT/"workers"; result=[]
    if not base.exists(): return result
    for folder in sorted(p for p in base.iterdir() if p.is_dir()):
        py=sorted(p.name for p in folder.glob("*.py"))
        result.append({"worker":folder.name,"python_files":py,
                       "status":"prototype_or_local_module" if py else "scaffold_only",
                       "live_execution_enabled":False})
    return result

@mcp.tool()
def read_market_candles(symbol: str="BTCUSDT", interval: str="1h", limit: int=100) -> dict:
    """Fetch public market OHLCV candles. No API key and no orders are used."""
    import sys
    sys.path.insert(0,str(ROOT/"workers"/"data-ingestion"))
    from main_prototype import fetch_ohlcv
    candles=fetch_ohlcv(symbol,interval,limit)
    return {"source":"binance_public","symbol":symbol.upper(),"interval":interval,
            "count":len(candles),"candles":candles,"execution_enabled":False}

@mcp.tool()
def run_ema_backtest(symbol: str="BTCUSDT", interval: str="1h", limit: int=500,
                     fast_period: int=12, slow_period: int=26) -> dict:
    """Run deterministic EMA crossover backtest on public historical OHLCV. Research only."""
    import sys
    sys.path.insert(0,str(ROOT/"workers"/"data-ingestion"))
    sys.path.insert(0,str(ROOT/"workers"/"backtest"))
    from main_prototype import fetch_ohlcv
    from engine_prototype import BacktestWorker
    candles=fetch_ohlcv(symbol,interval,limit)
    return BacktestWorker().run({"name":"EMA crossover","fast_period":fast_period,"slow_period":slow_period},candles)

@mcp.tool()
def validate_paper_risk(allocation_pct: float, daily_loss_pct: float, drawdown_pct: float,
                        leverage: float=1.0, data_age_seconds: float=0.0) -> dict:
    """Evaluate local fail-closed paper risk limits; never authorizes live trading."""
    import sys
    sys.path.insert(0,str(ROOT/"workers"/"risk"))
    from manager_prototype import RiskWorker
    return RiskWorker().check(allocation_pct=allocation_pct,daily_loss_pct=daily_loss_pct,
                              drawdown_pct=drawdown_pct,leverage=leverage,
                              data_age_seconds=data_age_seconds,paper_mode=True)

@mcp.tool()
def smc_wave_component_status() -> dict:
    """Report readiness of preserved Elliott Wave, Harmonic Patterns and Liquidity Sweeps sources."""
    import sys
    component_dir = ROOT / "workers" / "feature" / "smc_wave"
    sys.path.insert(0, str(component_dir))
    from adapter import component_status
    return component_status()

@mcp.tool()
def validate_smc_wave_ohlcv(candles: list[dict]) -> dict:
    """Validate OHLC candle structure for future SMC/Wave analysis; does not create signals or orders."""
    import sys
    component_dir = ROOT / "workers" / "feature" / "smc_wave"
    sys.path.insert(0, str(component_dir))
    from adapter import analyze_ohlcv
    return analyze_ohlcv(candles)

@mcp.tool()
def analyze_smc_wave_candidates(candles: list[dict], lookback: int = 20) -> dict:
    """Run research-only Elliott swing, harmonic-ready and liquidity-sweep candidate analysis; never submits orders."""
    import sys
    component_dir = ROOT / "workers" / "feature" / "smc_wave"
    sys.path.insert(0, str(component_dir))
    from adapter import analyze_smc_wave
    return analyze_smc_wave(candles, lookback=lookback)

if __name__=="__main__":
    mcp.run()
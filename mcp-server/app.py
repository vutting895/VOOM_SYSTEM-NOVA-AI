"""Canonical VOOM_SYSTEM MCP server. Stdio-only; research and validation tools only."""
from pathlib import Path
from datetime import datetime, timezone
from math import isfinite
import sys
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("voom-system")
ROOT = Path(__file__).resolve().parents[1]
LIVE_TRADING_ENABLED = False


def _worker_path(name: str) -> Path:
    path = ROOT / "workers" / name
    if not path.exists():
        raise RuntimeError(f"Required worker module is missing: workers/{name}")
    return path


@mcp.tool()
def system_status() -> dict:
    """Report project modules and the fail-closed execution posture."""
    modules = {name: (ROOT / name).is_dir() for name in ("frontend", "mcp-server", "workers", "infra", "shared")}
    return {
        "project": "voom_system", "architecture": "nova", "mcp_entrypoint": "mcp-server/app.py",
        "status": "local_scaffold", "modules_present": modules,
        "all_top_level_modules_present": all(modules.values()),
        "live_trading_enabled": False, "execution_enabled": False,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@mcp.tool()
def list_workers() -> list[dict]:
    """Inventory worker modules and explicitly flag prototypes and mock implementations."""
    base = ROOT / "workers"
    result = []
    if not base.exists():
        return result
    for folder in sorted(p for p in base.iterdir() if p.is_dir()):
        files = sorted(p.name for p in folder.glob("*.py"))
        joined = " ".join(files).lower()
        flagged = any(token in joined for token in ("prototype", "mock", "synthetic"))
        result.append({
            "worker": folder.name, "python_files": files,
            "status": "contains_prototype_or_mock_files" if flagged else ("local_module_unverified" if files else "scaffold_only"),
            "live_execution_enabled": False,
        })
    return result


@mcp.tool()
def read_market_candles(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 100) -> dict:
    """Fetch public Binance OHLCV data; no API credentials or order actions are used."""
    _worker_path("data-ingestion")
    sys.path.insert(0, str(ROOT / "workers" / "data-ingestion"))
    from main_prototype import fetch_ohlcv
    candles = fetch_ohlcv(symbol, interval, limit)
    return {
        "source": "binance_public", "symbol": symbol.upper(), "interval": interval,
        "count": len(candles), "candles": candles,
        "execution_enabled": False, "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@mcp.tool()
def get_market_features(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 100) -> dict:
    """Fetch real public OHLCV and calculate deterministic EMA12/EMA26, RSI14 and ATR14 features."""
    if limit < 30 or limit > 1000:
        raise ValueError("limit must be between 30 and 1000 candles")
    market = read_market_candles(symbol=symbol, interval=interval, limit=limit)
    candles = market["candles"]
    closes = [float(c["close"]) for c in candles]
    highs = [float(c["high"]) for c in candles]
    lows = [float(c["low"]) for c in candles]
    if any(not isfinite(v) for v in closes + highs + lows) or any(v <= 0 for v in closes):
        raise ValueError("Market data contains non-finite or invalid prices")

    def ema(values: list[float], period: int) -> float:
        alpha = 2.0 / (period + 1)
        current = values[0]
        for value in values[1:]:
            current = alpha * value + (1 - alpha) * current
        return current

    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    recent = changes[-14:]
    gains = sum(max(v, 0.0) for v in recent) / len(recent)
    losses = sum(max(-v, 0.0) for v in recent) / len(recent)
    rsi = 100.0 if losses == 0 and gains > 0 else (50.0 if losses == 0 else 100 - 100 / (1 + gains / losses))
    true_ranges = []
    for i in range(1, len(candles)):
        true_ranges.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
    atr = sum(true_ranges[-14:]) / min(14, len(true_ranges))
    return {
        "source": market["source"], "symbol": market["symbol"], "interval": interval,
        "candles_used": len(candles), "latest_timestamp": candles[-1]["timestamp"],
        "last_close": closes[-1], "ema12": ema(closes, 12), "ema26": ema(closes, 26),
        "rsi14_simple": rsi, "atr14_simple": atr,
        "calculation_note": "EMA uses the full returned series; RSI14 and ATR14 use simple rolling averages, not Wilder smoothing.",
        "signal": None, "execution_enabled": False,
        "warning": "Market features only; not a trading signal or investment recommendation.",
    }


@mcp.tool()
def run_ema_backtest(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 500,
                     fast_period: int = 12, slow_period: int = 26,
                     fee: float = 0.001, slippage: float = 0.0005) -> dict:
    """Backtest EMA crossover using fetched public historical candles and explicit costs; research only."""
    if not 30 <= limit <= 1000:
        raise ValueError("limit must be between 30 and 1000 candles")
    if not 2 <= fast_period < slow_period <= limit:
        raise ValueError("Require 2 <= fast_period < slow_period <= limit")
    if not 0 <= fee < 0.1 or not 0 <= slippage < 0.1:
        raise ValueError("fee and slippage must be in [0, 0.1)")
    _worker_path("data-ingestion")
    _worker_path("backtest")
    sys.path.insert(0, str(ROOT / "workers" / "data-ingestion"))
    sys.path.insert(0, str(ROOT / "workers" / "backtest"))
    from main_prototype import fetch_ohlcv
    from engine_prototype import BacktestWorker
    candles = fetch_ohlcv(symbol, interval, limit)
    result = BacktestWorker(fee=fee, slippage=slippage).run(
        {"name": "EMA crossover", "fast_period": fast_period, "slow_period": slow_period}, candles
    )
    result.update({"symbol": symbol.upper(), "interval": interval, "data_source": "binance_public",
                   "data_start": candles[0]["timestamp"], "data_end": candles[-1]["timestamp"]})
    return result


@mcp.tool()
def validate_paper_risk(allocation_pct: float, daily_loss_pct: float, drawdown_pct: float,
                        leverage: float = 1.0, data_age_seconds: float = 0.0) -> dict:
    """Evaluate fail-closed paper-risk limits; never authorizes live trading."""
    _worker_path("risk")
    sys.path.insert(0, str(ROOT / "workers" / "risk"))
    from manager_prototype import RiskWorker
    return RiskWorker().check(allocation_pct=allocation_pct, daily_loss_pct=daily_loss_pct,
                              drawdown_pct=drawdown_pct, leverage=leverage,
                              data_age_seconds=data_age_seconds, paper_mode=True)


@mcp.tool()
def validate_portfolio_allocation(allocation_pct: float, max_strategy_allocation_pct: float = 20.0) -> dict:
    """Validate allocation against a deterministic local limit; this does not allocate or trade."""
    _worker_path("portfolio")
    sys.path.insert(0, str(ROOT / "workers" / "portfolio"))
    from allocator import PortfolioAllocator
    decision = PortfolioAllocator(max_strategy_allocation_pct).validate(allocation_pct)
    return {"accepted": decision.accepted, "allocation_pct": decision.allocation_pct,
            "reason": decision.reason, "execution_enabled": False}


@mcp.tool()
def smc_wave_component_status() -> dict:
    """Report provenance and research-only status of the SMC/Wave components."""
    component_dir = ROOT / "workers" / "feature" / "smc_wave"
    sys.path.insert(0, str(component_dir))
    from adapter import component_status
    return component_status()


@mcp.tool()
def validate_smc_wave_ohlcv(candles: list[dict]) -> dict:
    """Validate OHLC candle structure; does not create signals or orders."""
    component_dir = ROOT / "workers" / "feature" / "smc_wave"
    sys.path.insert(0, str(component_dir))
    from adapter import analyze_ohlcv
    return analyze_ohlcv(candles)


@mcp.tool()
def analyze_smc_wave_candidates(candles: list[dict], lookback: int = 20) -> dict:
    """Run research-only Elliott swing and liquidity-sweep candidate analysis; never submits orders."""
    component_dir = ROOT / "workers" / "feature" / "smc_wave"
    sys.path.insert(0, str(component_dir))
    from adapter import analyze_smc_wave
    return analyze_smc_wave(candles, lookback=lookback)


@mcp.tool()
def mcp_capability_audit() -> dict:
    """Explain which legacy MCP-like functions are intentionally excluded because they fabricate results."""
    return {
        "canonical_server": "mcp-server/app.py",
        "protocol": "MCP stdio",
        "tools_in_this_server": [
            "system_status", "list_workers", "read_market_candles", "get_market_features",
            "run_ema_backtest", "validate_paper_risk", "validate_portfolio_allocation",
            "smc_wave_component_status", "validate_smc_wave_ohlcv",
            "analyze_smc_wave_candidates", "mcp_capability_audit",
        ],
        "excluded_legacy_functions": {
            "generate_strategy": "legacy server used random/mock backtest values; not exposed as production tool",
            "backtest_strategy": "legacy server fabricated metrics; use run_ema_backtest with fetched public OHLCV",
            "tuning_strategy": "legacy server randomized trial scores; not exposed as validated tuning",
            "get_market_features": "legacy endpoint was only a description; canonical MCP now calculates features from public OHLCV",
        },
        "live_trading_enabled": False,
        "orders_submitted": False,
        "note": "Passing tool tests proves software behavior only, not strategy profitability.",
    }


if __name__ == "__main__":
    mcp.run()

[executed on device: 10_3_6_9 (85294689-03d5-431e-abd5-9e27d4c94814)]
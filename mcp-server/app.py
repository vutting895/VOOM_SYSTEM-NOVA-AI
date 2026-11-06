"""Canonical local NOVA MCP server.

Transport is stdio only. Tools are bounded to public market research,
deterministic analysis, and paper-risk validation. No broker credentials,
order submission, or live-trading capability is exposed.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from pathlib import Path
import sys
from typing import Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("voom-system-nova")
ROOT = Path(__file__).resolve().parents[1]
LIVE_TRADING_ENABLED = False


def _worker_path(name: str) -> Path:
    path = ROOT / "workers" / name
    if not path.is_dir():
        raise RuntimeError(f"Required worker module is missing: workers/{name}")
    return path


def _load_worker(folder: str, module_name: str, symbol: str) -> Any:
    path = _worker_path(folder)
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)
    module = __import__(module_name, fromlist=[symbol])
    try:
        return getattr(module, symbol)
    except AttributeError as exc:
        raise RuntimeError(f"Worker contract is missing {module_name}.{symbol}") from exc


def _load_smc() -> tuple[Any, Any]:
    path = ROOT / "workers" / "feature" / "smc_wave"
    if not path.is_dir():
        raise RuntimeError("Required SMC module is missing: workers/feature/smc_wave")
    path_text = str(path)
    if path_text not in sys.path:
        sys.path.insert(0, path_text)
    from smc_strategy import analyze_smc, run_smc_backtest
    return analyze_smc, run_smc_backtest


@mcp.tool()
def system_status() -> dict[str, Any]:
    """Report local module presence and the fail-closed execution posture."""
    modules = {
        name: (ROOT / name).is_dir()
        for name in ("frontend", "mcp-server", "workers", "infra", "shared", "integrations")
    }
    return {
        "project": "VOOM_SYSTEM-NOVA-AI",
        "status": "local_mcp_ready" if modules["mcp-server"] and modules["workers"] else "local_scaffold",
        "mcp_entrypoint": "mcp-server/app.py",
        "transport": "stdio",
        "modules_present": modules,
        "live_trading_enabled": False,
        "execution_enabled": False,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@mcp.tool()
def list_workers() -> list[dict[str, Any]]:
    """Inventory Python worker folders and flag prototype/mock source files."""
    base = ROOT / "workers"
    result: list[dict[str, Any]] = []
    if not base.is_dir():
        return result
    for folder in sorted(path for path in base.iterdir() if path.is_dir()):
        files = sorted(path.name for path in folder.glob("*.py"))
        names = " ".join(files).lower()
        flagged = any(token in names for token in ("prototype", "mock", "synthetic"))
        result.append({
            "worker": folder.name,
            "python_files": files,
            "status": "contains_prototype_or_mock_files" if flagged else (
                "local_module_unverified" if files else "scaffold_only"
            ),
            "live_execution_enabled": False,
        })
    return result


@mcp.tool()
def read_market_candles(
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    limit: int = 100,
) -> dict[str, Any]:
    """Fetch public Binance OHLCV candles; no API credentials or order actions."""
    fetch_ohlcv = _load_worker("data-ingestion", "main_prototype", "fetch_ohlcv")
    candles = fetch_ohlcv(symbol=symbol, interval=interval, limit=limit)
    if not candles:
        raise RuntimeError("Market data provider returned no candles")
    return {
        "source": "binance_public",
        "symbol": symbol.upper(),
        "interval": interval,
        "count": len(candles),
        "candles": candles,
        "execution_enabled": False,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def _ema(values: list[float], period: int) -> float:
    if not values or period < 1:
        raise ValueError("EMA requires non-empty values and a positive period")
    alpha = 2.0 / (period + 1)
    current = values[0]
    for value in values[1:]:
        current = alpha * value + (1 - alpha) * current
    return current


def _features_from_candles(candles: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(candles, list) or len(candles) < 30:
        raise ValueError("At least 30 OHLCV candles are required")
    closes = [float(candle["close"]) for candle in candles]
    highs = [float(candle["high"]) for candle in candles]
    lows = [float(candle["low"]) for candle in candles]
    if any(not isfinite(value) for value in closes + highs + lows):
        raise ValueError("Market data contains non-finite prices")
    if any(value <= 0 for value in closes):
        raise ValueError("Close prices must be positive")

    changes = [closes[index] - closes[index - 1] for index in range(1, len(closes))]
    recent = changes[-14:]
    gains = sum(max(value, 0.0) for value in recent) / len(recent)
    losses = sum(max(-value, 0.0) for value in recent) / len(recent)
    rsi = 100.0 if losses == 0 and gains > 0 else (
        50.0 if losses == 0 else 100.0 - 100.0 / (1.0 + gains / losses)
    )

    true_ranges = [
        max(
            highs[index] - lows[index],
            abs(highs[index] - closes[index - 1]),
            abs(lows[index] - closes[index - 1]),
        )
        for index in range(1, len(candles))
    ]
    atr_values = true_ranges[-14:]
    return {
        "candles_used": len(candles),
        "latest_timestamp": candles[-1].get("timestamp"),
        "last_close": closes[-1],
        "ema12": _ema(closes, 12),
        "ema26": _ema(closes, 26),
        "rsi14_simple": rsi,
        "atr14_simple": sum(atr_values) / len(atr_values),
        "calculation_note": (
            "EMA uses the full returned series; RSI14 and ATR14 use simple rolling "
            "averages, not Wilder smoothing."
        ),
        "signal": None,
        "execution_enabled": False,
        "warning": "Research features only; not a trading signal or investment recommendation.",
    }


@mcp.tool()
def get_market_features(
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    limit: int = 100,
) -> dict[str, Any]:
    """Calculate deterministic EMA12/EMA26, simple RSI14 and simple ATR14."""
    if limit < 30 or limit > 1000:
        raise ValueError("limit must be between 30 and 1000 candles")
    market = read_market_candles(symbol=symbol, interval=interval, limit=limit)
    features = _features_from_candles(market["candles"])
    return {
        "source": market["source"],
        "symbol": market["symbol"],
        "interval": interval,
        **features,
    }


@mcp.tool()
def run_ema_backtest(
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    limit: int = 500,
    fast_period: int = 12,
    slow_period: int = 26,
    fee: float = 0.001,
    slippage: float = 0.0005,
) -> dict[str, Any]:
    """Run deterministic EMA crossover research backtest over public OHLCV."""
    if not 30 <= limit <= 1000:
        raise ValueError("limit must be between 30 and 1000 candles")
    if not 2 <= fast_period < slow_period <= limit:
        raise ValueError("Require 2 <= fast_period < slow_period <= limit")
    if not isfinite(fee) or not isfinite(slippage) or not 0 <= fee < 0.1 or not 0 <= slippage < 0.1:
        raise ValueError("fee and slippage must be finite and in [0, 0.1)")

    market = read_market_candles(symbol=symbol, interval=interval, limit=limit)
    BacktestWorker = _load_worker("backtest", "engine_prototype", "BacktestWorker")
    result = BacktestWorker(fee=fee, slippage=slippage).run(
        {"name": "EMA crossover", "fast_period": fast_period, "slow_period": slow_period},
        market["candles"],
    )
    result.update({
        "symbol": market["symbol"],
        "interval": interval,
        "data_source": market["source"],
        "data_start": market["candles"][0]["timestamp"],
        "data_end": market["candles"][-1]["timestamp"],
        "execution_enabled": False,
    })
    return result


@mcp.tool()
def validate_paper_risk(
    allocation_pct: float,
    daily_loss_pct: float,
    drawdown_pct: float,
    leverage: float = 1.0,
    data_age_seconds: float = 0.0,
) -> dict[str, Any]:
    """Evaluate the existing fail-closed paper-risk policy; never authorizes live trading."""
    RiskWorker = _load_worker("risk", "manager_prototype", "RiskWorker")
    return RiskWorker().check(
        allocation_pct=allocation_pct,
        daily_loss_pct=daily_loss_pct,
        drawdown_pct=drawdown_pct,
        leverage=leverage,
        data_age_seconds=data_age_seconds,
        paper_mode=True,
    )


@mcp.tool()
def validate_portfolio_allocation(
    allocation_pct: float,
    max_strategy_allocation_pct: float = 20.0,
) -> dict[str, Any]:
    """Validate a proposed paper allocation; does not persist or allocate funds."""
    if not isfinite(allocation_pct) or not isfinite(max_strategy_allocation_pct):
        raise ValueError("Allocation inputs must be finite")
    PortfolioAllocator = _load_worker("portfolio", "allocator", "PortfolioAllocator")
    decision = PortfolioAllocator(max_strategy_allocation_pct).validate(allocation_pct)
    return {
        "accepted": decision.accepted,
        "allocation_pct": decision.allocation_pct,
        "reason": decision.reason,
        "execution_enabled": False,
    }


@mcp.tool()
def smc_engine_status() -> dict[str, Any]:
    """Report the canonical SMC engine and its research-only operating limits."""
    _load_smc()
    return {
        "engine": "workers/feature/smc_wave/smc_strategy.py",
        "status": "research_only",
        "capabilities": ["BOS", "CHoCH", "FVG", "order_blocks", "liquidity_sweeps", "research_backtest"],
        "live_trading_enabled": False,
        "orders_submitted": False,
        "signals_authorized": False,
    }


@mcp.tool()
def analyze_smc_market_structure(
    candles: list[dict[str, Any]],
    swing_left: int = 2,
    swing_right: int = 2,
    include_full_history: bool = False,
) -> dict[str, Any]:
    """Run the repository's canonical SMC structure analysis on supplied OHLC candles."""
    analyze_smc, _ = _load_smc()
    result = analyze_smc(
        candles,
        swing_left=swing_left,
        swing_right=swing_right,
        include_full_history=include_full_history,
    )
    result["live_trading_enabled"] = False
    result["orders_submitted"] = False
    return result


@mcp.tool()
def run_smc_research_backtest(
    candles: list[dict[str, Any]],
    reward_risk: float = 2.0,
    fee_rate: float = 0.001,
    slippage_rate: float = 0.0005,
    initial_equity: float = 10000.0,
) -> dict[str, Any]:
    """Run the canonical SMC structure-break baseline; research only, no orders."""
    _, run_smc_backtest = _load_smc()
    result = run_smc_backtest(
        candles,
        reward_risk=reward_risk,
        fee_rate=fee_rate,
        slippage_rate=slippage_rate,
        initial_equity=initial_equity,
    )
    result["live_trading_enabled"] = False
    result["orders_submitted"] = False
    return result


@mcp.tool()
def mcp_capability_audit() -> dict[str, Any]:
    """Describe the allow-listed tools and explicitly excluded mock/live capabilities."""
    return {
        "canonical_server": "mcp-server/app.py",
        "protocol": "MCP stdio",
        "tools_in_this_server": [
            "system_status",
            "list_workers",
            "read_market_candles",
            "get_market_features",
            "run_ema_backtest",
            "validate_paper_risk",
            "validate_portfolio_allocation",
            "smc_engine_status",
            "analyze_smc_market_structure",
            "run_smc_research_backtest",
            "mcp_capability_audit",
        ],
        "excluded_capabilities": {
            "random_strategy_generation": "The retained FastAPI archive fabricates strategy/backtest/tuning metrics.",
            "randomized_parameter_tuning": "No validated deterministic tuning pipeline is currently exposed.",
            "broker_order_submission": "Not exposed by this local MCP server.",
            "live_trading": "Disabled by design.",
        },
        "live_trading_enabled": False,
        "orders_submitted": False,
        "note": "Passing tool tests proves software behavior only, not strategy profitability.",
    }


if __name__ == "__main__":
    mcp.run()

"""Safe entry point for the VOOM SMC/Wave MCP feature package."""
from __future__ import annotations
from typing import Any
from harmonic_patterns import detect_xabcd
from elliott_wave import find_pivots, five_swing_candidate
from liquidity_sweeps import detect_liquidity_sweeps

COMPONENTS = {
    "elliott_wave": {"source": "source_notebooks/elliott_wave_source.ipynb", "implementation": "heuristic pivot/swing candidate", "status": "research_only"},
    "harmonic_patterns": {"source": "source_notebooks/harmonic_patterns_source.ipynb", "implementation": "new XABCD ratio checker; source notebook code not reused due to defects", "status": "research_only"},
    "liquidity_sweeps": {"source": "source_notebooks/liquidity_sweeps_source.ipynb", "implementation": "new close-back-inside baseline because source notebook is empty", "status": "research_only"},
}

def component_status() -> dict[str, Any]:
    return {"module": "smc_wave", "status": "research_scaffold", "components": COMPONENTS,
            "live_trading_enabled": False, "orders_submitted": False, "signals_ready": False,
            "reason": "Research candidates only; require domain review, walk-forward validation and backtesting."}

def analyze_ohlcv(candles: list[dict[str, Any]]) -> dict[str, Any]:
    required = {"open", "high", "low", "close"}
    if not isinstance(candles, list) or not candles:
        return {"ok": False, "error": "candles must be a non-empty list", **component_status()}
    for i, candle in enumerate(candles):
        if not isinstance(candle, dict) or not required.issubset(candle):
            return {"ok": False, "error": f"candle {i} missing required OHLC fields", **component_status()}
        try:
            o, h, l, c = (float(candle[k]) for k in ("open", "high", "low", "close"))
        except (TypeError, ValueError):
            return {"ok": False, "error": f"candle {i} has non-numeric OHLC fields", **component_status()}
        if not all(__import__("math").isfinite(v) for v in (o,h,l,c)) or h < l or not (l <= o <= h and l <= c <= h):
            return {"ok": False, "error": f"candle {i} has invalid OHLC bounds", **component_status()}
    return {"ok": True, "candles_validated": len(candles), "signal": None,
            "note": "OHLC validated; call component-specific analysis for research candidates.",
            **component_status()}

def analyze_smc_wave(candles: list[dict[str, Any]], lookback: int = 20) -> dict[str, Any]:
    """Run research-only candidate detectors over validated OHLC candles."""
    validation = analyze_ohlcv(candles)
    if not validation["ok"]:
        return validation
    pivots = find_pivots(candles)
    sweeps = detect_liquidity_sweeps(candles, lookback=lookback)
    return {"ok": True, "candles_validated": len(candles), "pivot_count": len(pivots),
            "elliott_wave_candidate": five_swing_candidate(pivots),
            "liquidity_sweeps": sweeps,
            "harmonic_patterns": {"available": True, "usage": "pass five confirmed pivots to detect_xabcd(points)"},
            "signal": None, "live_trading_enabled": False, "orders_submitted": False,
            "warning": "These are research candidates, not trade signals or validated strategy outputs."}

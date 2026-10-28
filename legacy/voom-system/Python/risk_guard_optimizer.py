"""
Voom_system Risk Guard + Auto Optimization safety layer.
Optimizes Source 1 parameters only from supplied REAL backtest metrics.
Never disables risk guards. Paper-trading by default.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from pathlib import Path
import json, math, os, tempfile
from typing import Any

@dataclass(frozen=True)
class RiskLimits:
    max_risk_pct: float = 0.01       # hard cap: 1% equity per trade
    max_daily_loss_pct: float = 0.03 # hard cap: 3% daily loss
    max_drawdown_pct: float = 0.07   # hard cap: 7% peak-to-trough
    min_trades: int = 100
    min_profit_factor: float = 1.10
    min_oos_profit_factor: float = 1.00
    paper_trading: bool = True

DEFAULT_PARAMS = {
    "CONFLUENCE_MIN": 4, "DL_WEIGHT": 0.25, "DIST_ATR_MULT": 1.8,
    "Z_SCORE_THRESH": 2.2, "RISK_PCT": 0.005, "RR_TP1": 1.5,
    "RR_TP2": 3.1, "VOLATILITY_ATR_MIN": 0.4, "FVG_MIN_SIZE_ATR": 0.3,
}
BOUNDS = {
    "CONFLUENCE_MIN": (4, 5), "DL_WEIGHT": (0.15, 0.35),
    "DIST_ATR_MULT": (1.2, 2.5), "Z_SCORE_THRESH": (1.8, 2.8),
    "RISK_PCT": (0.001, 0.01), "RR_TP1": (1.2, 1.8),
    "RR_TP2": (2.8, 3.5), "VOLATILITY_ATR_MIN": (0.4, 3.5),
    "FVG_MIN_SIZE_ATR": (0.2, 0.5),
}

def validate_metrics(m: dict[str, Any], limits: RiskLimits = RiskLimits()) -> tuple[bool, str]:
    required = ("trades", "profit_factor", "max_drawdown_pct", "oos_profit_factor")
    if not isinstance(m, dict) or any(k not in m for k in required):
        return False, "Missing required REAL backtest metrics"
    try:
        trades = int(m["trades"])
        pf, dd, oos = (float(m[k]) for k in ("profit_factor", "max_drawdown_pct", "oos_profit_factor"))
    except (ValueError, TypeError, OverflowError):
        return False, "Invalid metric types"
    if not all(math.isfinite(x) for x in (pf, dd, oos)):
        return False, "Non-finite metrics"
    if trades < limits.min_trades: return False, "Insufficient trades"
    if pf < limits.min_profit_factor: return False, "In-sample profit factor below threshold"
    if oos < limits.min_oos_profit_factor: return False, "Out-of-sample profit factor below threshold"
    if dd < 0 or dd > limits.max_drawdown_pct * 100: return False, "Drawdown exceeds hard limit"
    return True, "Metrics passed"

def clamp_params(candidate: dict[str, Any], limits: RiskLimits = RiskLimits()) -> dict[str, Any]:
    out = dict(DEFAULT_PARAMS)
    for key, bounds in BOUNDS.items():
        if key not in candidate: continue
        try: value = float(candidate[key])
        except (ValueError, TypeError): continue
        if not math.isfinite(value): continue
        lo, hi = bounds
        value = max(lo, min(hi, value))
        if key == "CONFLUENCE_MIN": value = int(round(value))
        out[key] = value
    # hard risk caps are applied after optimization
    out["RISK_PCT"] = min(float(out["RISK_PCT"]), limits.max_risk_pct)
    return out

def atomic_save(candidate: dict[str, Any], metrics: dict[str, Any], path="best_config.json",
                limits: RiskLimits = RiskLimits()) -> dict[str, Any]:
    ok, reason = validate_metrics(metrics, limits)
    if not ok:
        return {"applied": False, "reason": reason}
    payload = {
        "params": clamp_params(candidate, limits),
        "metrics": metrics,
        "risk_limits": asdict(limits),
        "paper_trading": True,
        "live_trading_enabled": False,
        "approved_by_validation": True,
    }
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=target.name, suffix=".tmp", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
    return {"applied": True, "reason": "Validated and saved; paper trading only", "path": str(target)}

def can_open_trade(daily_loss_pct: float, current_drawdown_pct: float,
                   requested_risk_pct: float, limits: RiskLimits = RiskLimits()) -> tuple[bool, str]:
    vals = (daily_loss_pct, current_drawdown_pct, requested_risk_pct)
    if not all(math.isfinite(float(v)) for v in vals): return False, "Invalid risk values"
    if daily_loss_pct >= limits.max_daily_loss_pct * 100: return False, "Daily loss limit reached"
    if current_drawdown_pct >= round(limits.max_drawdown_pct * 100, 6): return False, "Drawdown limit reached"
    if requested_risk_pct <= 0 or requested_risk_pct > limits.max_risk_pct * 100:
        return False, "Risk per trade outside hard limit"
    return True, "Risk checks passed"

if __name__ == "__main__":
    print("Voom_system optimizer guard self-test")
    assert not validate_metrics({"trades": 99, "profit_factor": 2, "max_drawdown_pct": 1, "oos_profit_factor": 2})[0]
    assert clamp_params({"RISK_PCT": 0.99})["RISK_PCT"] <= 0.01
    assert not can_open_trade(3, 1, 0.5)[0]
    assert not can_open_trade(0, 7, 0.5)[0]
    assert not can_open_trade(0, 1, 2)[0]
    assert can_open_trade(0, 1, 0.5)[0]
    print("PASS: hard risk caps, loss/drawdown guards, and invalid-metric rejection")


"""Deterministic Smart Money Concepts (SMC) research engine.

Uses completed OHLC candles only. Outputs structure/events and setup candidates,
never broker orders. Pivot confirmation uses left/right bars to avoid treating
unconfirmed extremes as established structure.
"""
from __future__ import annotations

from math import isfinite
from typing import Any

OHLC = ("open", "high", "low", "close")


def _validate(candles: list[dict[str, Any]]) -> None:
    if not isinstance(candles, list) or len(candles) < 10:
        raise ValueError("candles must contain at least 10 OHLC bars")
    for i, row in enumerate(candles):
        if not isinstance(row, dict) or not all(k in row for k in OHLC):
            raise ValueError(f"candle {i} must include open/high/low/close")
        try:
            o, h, l, c = (float(row[k]) for k in OHLC)
        except (TypeError, ValueError):
            raise ValueError(f"candle {i} has non-numeric OHLC values") from None
        if not all(isfinite(v) for v in (o, h, l, c)) or h < l or not (l <= o <= h and l <= c <= h):
            raise ValueError(f"candle {i} has invalid OHLC bounds")


def _pivots(candles: list[dict[str, Any]], left: int, right: int) -> list[dict[str, Any]]:
    pivots = []
    for i in range(left, len(candles) - right):
        hi = float(candles[i]["high"])
        lo = float(candles[i]["low"])
        window = candles[i-left:i+right+1]
        highs = [float(x["high"]) for x in window]
        lows = [float(x["low"]) for x in window]
        if hi == max(highs) and highs.count(hi) == 1:
            pivots.append({"index": i, "confirmed_at": i + right, "kind": "high", "price": hi})
        if lo == min(lows) and lows.count(lo) == 1:
            pivots.append({"index": i, "confirmed_at": i + right, "kind": "low", "price": lo})
    pivots.sort(key=lambda p: (p["index"], p["kind"]))
    # Compress consecutive same-kind pivots to the more extreme one.
    compressed = []
    for p in pivots:
        if compressed and compressed[-1]["kind"] == p["kind"]:
            prev = compressed[-1]
            more_extreme = p["price"] > prev["price"] if p["kind"] == "high" else p["price"] < prev["price"]
            if more_extreme:
                compressed[-1] = p
        else:
            compressed.append(p)
    return compressed


def analyze_smc(candles: list[dict[str, Any]], swing_left: int = 2,
                swing_right: int = 2, displacement_atr_multiple: float = 1.0,
                ob_search_bars: int = 8, include_full_history: bool = False) -> dict[str, Any]:
    """Return auditable BOS/CHoCH, FVG, order-block and liquidity-sweep candidates."""
    _validate(candles)
    if not (1 <= swing_left <= 10 and 1 <= swing_right <= 10):
        raise ValueError("swing_left and swing_right must be between 1 and 10")
    if not (0.1 <= displacement_atr_multiple <= 5.0):
        raise ValueError("displacement_atr_multiple must be between 0.1 and 5")
    if not (1 <= ob_search_bars <= 30):
        raise ValueError("ob_search_bars must be between 1 and 30")

    n = len(candles)
    opens = [float(c["open"]) for c in candles]
    highs = [float(c["high"]) for c in candles]
    lows = [float(c["low"]) for c in candles]
    closes = [float(c["close"]) for c in candles]
    tr = []
    for i in range(n):
        prev = closes[i-1] if i else closes[i]
        tr.append(max(highs[i] - lows[i], abs(highs[i] - prev), abs(lows[i] - prev)))
    atr_period = min(14, n)
    atr = sum(tr[-atr_period:]) / atr_period
    pivots = _pivots(candles, swing_left, swing_right)
    confirmed = [p for p in pivots if p["confirmed_at"] < n]
    events: list[dict[str, Any]] = []
    structure_bias = "neutral"
    last_broken: set[tuple[str, int]] = set()
    latest_structure = None

    # Process bars in chronological order, only using pivots already confirmed at that bar.
    for i in range(max(swing_left + swing_right + 1, 1), n):
        available = [p for p in confirmed if p["confirmed_at"] < i]
        prior_highs = [p for p in available if p["kind"] == "high" and p["index"] < i]
        prior_lows = [p for p in available if p["kind"] == "low" and p["index"] < i]
        close = closes[i]
        for kind, collection, direction in (("high", prior_highs, "bullish"), ("low", prior_lows, "bearish")):
            if not collection:
                continue
            level = collection[-1]
            key = (kind, level["index"])
            broke = close > level["price"] if kind == "high" else close < level["price"]
            if broke and key not in last_broken:
                last_broken.add(key)
                event_type = ("CHoCH" if structure_bias not in ("neutral", direction) else "BOS")
                events.append({"type": event_type, "direction": direction, "index": i,
                               "level": level["price"], "swing_index": level["index"],
                               "close": close, "confirmed_pivot_only": True})
                structure_bias = direction
                latest_structure = events[-1]

    fvgs = []
    for i in range(2, n):
        # Three-candle imbalance, detected when the third candle closes.
        if lows[i] > highs[i-2]:
            fvgs.append({"type": "bullish_fvg", "index": i, "lower": highs[i-2], "upper": lows[i],
                         "midpoint": (highs[i-2] + lows[i]) / 2, "mitigated": any(lows[j] <= lows[i] for j in range(i+1, n))})
        if highs[i] < lows[i-2]:
            fvgs.append({"type": "bearish_fvg", "index": i, "lower": highs[i], "upper": lows[i-2],
                         "midpoint": (highs[i] + lows[i-2]) / 2, "mitigated": any(highs[j] >= highs[i] for j in range(i+1, n))})

    order_blocks = []
    for event in events:
        i = event["index"]
        bullish = event["direction"] == "bullish"
        # Candidate OB is the nearest opposite-color candle before a structural break.
        start = max(0, i - ob_search_bars)
        candidates = [j for j in range(start, i) if (closes[j] < opens[j] if bullish else closes[j] > opens[j])]
        if not candidates:
            continue
        j = candidates[-1]
        displacement = abs(closes[i] - opens[i])
        if atr > 0 and displacement < atr * displacement_atr_multiple:
            continue
        order_blocks.append({"type": "bullish_order_block" if bullish else "bearish_order_block",
                             "index": j, "confirmed_at": i, "lower": lows[j], "upper": highs[j],
                             "structure_event": event["type"], "displacement": displacement,
                             "atr_at_analysis": atr, "mitigated_after_confirmation": any(
                                 (lows[k] <= lows[j] if bullish else highs[k] >= highs[j]) for k in range(i+1, n))})

    sweeps = []
    # Sweep requires a wick beyond a previously confirmed swing and a close back inside.
    for i in range(1, n):
        available = [p for p in confirmed if p["confirmed_at"] < i]
        for kind in ("high", "low"):
            candidates = [p for p in available if p["kind"] == kind]
            if not candidates:
                continue
            p = candidates[-1]
            if kind == "high" and highs[i] > p["price"] and closes[i] < p["price"]:
                sweeps.append({"type": "buy_side_liquidity_sweep", "index": i, "level": p["price"], "swing_index": p["index"]})
            elif kind == "low" and lows[i] < p["price"] and closes[i] > p["price"]:
                sweeps.append({"type": "sell_side_liquidity_sweep", "index": i, "level": p["price"], "swing_index": p["index"]})

    latest_fvg = next((x for x in reversed(fvgs) if not x["mitigated"]), None)
    latest_ob = next((x for x in reversed(order_blocks) if not x["mitigated_after_confirmation"]), None)
    latest_sweep = sweeps[-1] if sweeps else None
    confluence = 0
    if latest_structure:
        confluence += 1
    if latest_fvg and ((structure_bias == "bullish" and latest_fvg["type"] == "bullish_fvg") or
                       (structure_bias == "bearish" and latest_fvg["type"] == "bearish_fvg")):
        confluence += 1
    if latest_ob and ((structure_bias == "bullish" and latest_ob["type"] == "bullish_order_block") or
                      (structure_bias == "bearish" and latest_ob["type"] == "bearish_order_block")):
        confluence += 1
    if latest_sweep and ((structure_bias == "bullish" and latest_sweep["type"] == "sell_side_liquidity_sweep") or
                         (structure_bias == "bearish" and latest_sweep["type"] == "buy_side_liquidity_sweep")):
        confluence += 1

    return {
        "ok": True, "strategy": "SMC", "version": "1.0.0-research",
        "bars_analyzed": n, "last_close": closes[-1], "atr14_simple": atr,
        "structure_bias": structure_bias, "latest_structure_event": latest_structure,
        "swing_points": confirmed if include_full_history else confirmed[-30:],
        "structure_events": events if include_full_history else events[-30:],
        "fair_value_gaps": fvgs if include_full_history else fvgs[-30:],
        "order_blocks": order_blocks if include_full_history else order_blocks[-30:],
        "liquidity_sweeps": sweeps if include_full_history else sweeps[-30:],
        "latest_unmitigated_fvg": latest_fvg, "latest_unmitigated_order_block": latest_ob,
        "latest_liquidity_sweep": latest_sweep, "confluence_count": confluence,
        "setup_candidate": bool(latest_structure and confluence >= 2),
        "signal": None, "orders_submitted": False, "live_trading_enabled": False,
        "limitations": ["Research candidate only; no profitability claim.",
                        "OB/FVG definitions are explicit heuristic baselines requiring review.",
                        "Backtest, walk-forward and out-of-sample validation required before signal use."]
    }


def run_smc_backtest(candles: list[dict[str, Any]], reward_risk: float = 2.0,
                     fee_rate: float = 0.001, slippage_rate: float = 0.0005,
                     initial_equity: float = 10000.0,
                     swing_left: int = 2, swing_right: int = 2) -> dict[str, Any]:
    """Conservative structure-break baseline backtest; next-bar entry, fixed RR, no orders."""
    if not isfinite(float(reward_risk)) or not 0.5 <= float(reward_risk) <= 5:
        raise ValueError("reward_risk must be between 0.5 and 5")
    if not (0 <= float(fee_rate) < 0.05 and 0 <= float(slippage_rate) < 0.05):
        raise ValueError("fee_rate and slippage_rate must be in [0, 0.05)")
    if not isfinite(float(initial_equity)) or float(initial_equity) <= 0:
        raise ValueError("initial_equity must be positive and finite")
    analysis = analyze_smc(candles, swing_left=swing_left, swing_right=swing_right, include_full_history=True)
    opens = [float(c["open"]) for c in candles]
    highs = [float(c["high"]) for c in candles]
    lows = [float(c["low"]) for c in candles]
    closes = [float(c["close"]) for c in candles]
    pivots = analysis["swing_points"]
    events = analysis["structure_events"]
    trades = []
    busy_until = -1
    equity = peak = float(initial_equity)
    max_drawdown = 0.0
    for event in events:
        i = int(event["index"])
        entry_i = i + 1
        if entry_i >= len(candles) or entry_i <= busy_until:
            continue
        bullish = event["direction"] == "bullish"
        relevant = [p for p in pivots if p["index"] < i and p["kind"] == ("low" if bullish else "high")]
        if not relevant:
            continue
        stop = float(relevant[-1]["price"])
        entry = opens[entry_i]
        risk = entry - stop if bullish else stop - entry
        if not isfinite(risk) or risk <= 0:
            continue
        target = entry + risk * reward_risk if bullish else entry - risk * reward_risk
        exit_i = None
        exit_price = None
        exit_reason = None
        for j in range(entry_i, len(candles)):
            stop_hit = lows[j] <= stop if bullish else highs[j] >= stop
            target_hit = highs[j] >= target if bullish else lows[j] <= target
            # Conservative ordering: if both touch in one bar, assume stop was hit first.
            if stop_hit:
                exit_i, exit_price, exit_reason = j, stop, "stop_loss"
                break
            if target_hit:
                exit_i, exit_price, exit_reason = j, target, "take_profit"
                break
        if exit_i is None:
            exit_i, exit_price, exit_reason = len(candles) - 1, closes[-1], "end_of_data"
        gross = (exit_price - entry) if bullish else (entry - exit_price)
        costs = (abs(entry) + abs(exit_price)) * (float(fee_rate) + float(slippage_rate))
        net = gross - costs
        r_multiple = net / risk
        equity += net
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity) / peak)
        trades.append({"direction": "long" if bullish else "short", "structure_event": event["type"],
                       "signal_index": i, "entry_index": entry_i, "entry_price": entry,
                       "stop_price": stop, "target_price": target, "exit_index": exit_i,
                       "exit_price": exit_price, "exit_reason": exit_reason,
                       "gross_pnl_per_unit": gross, "estimated_cost_per_unit": costs,
                       "net_pnl_per_unit": net, "r_multiple": r_multiple})
        busy_until = exit_i
    wins = sum(t["net_pnl_per_unit"] > 0 for t in trades)
    total_net = sum(t["net_pnl_per_unit"] for t in trades)
    return {
        "ok": True, "strategy": "SMC_structure_break_baseline", "mode": "research_backtest_only",
        "bars_analyzed": len(candles), "trade_count": len(trades),
        "win_rate_pct": round(wins / len(trades) * 100, 4) if trades else 0.0,
        "total_net_pnl_per_unit": round(total_net, 8),
        "mean_r_multiple": round(sum(t["r_multiple"] for t in trades) / len(trades), 6) if trades else 0.0,
        "max_drawdown_pct": round(max_drawdown * 100, 4),
        "initial_equity_reference": float(initial_equity),
        "cost_assumptions": {"fee_rate_per_side": float(fee_rate), "slippage_rate_per_side": float(slippage_rate)},
        "fill_assumptions": ["signal only after structure-break candle closes",
                             "entry at next candle open", "if stop and target both touched, stop is assumed first"],
        "trades": trades, "orders_submitted": False, "live_trading_enabled": False,
        "warning": "Research baseline only; per-unit PnL is not portfolio sizing. Validate spread, contract sizing, funding/swap, and out-of-sample performance."
    }
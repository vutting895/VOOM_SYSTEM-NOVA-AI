"""Causal SMC Mean Rejection strategy plugin.

Research-only replacement for the legacy Wave3 strategy path. Candle timestamps
are UTC close-times (the instant at which each OHLC bar becomes observable).
The module never fetches data, connects to a broker, or submits orders.
"""
from __future__ import annotations

from datetime import datetime
from math import isfinite
from typing import Any, Iterable

STRATEGY_ID = "smc-mean-rejection"
STRATEGY_VERSION = "2.0.0-research"
OHLCV = ("open", "high", "low", "close", "volume")


class StrategyInputError(ValueError):
    """Invalid market data or strategy configuration."""


def _timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str):
        raise StrategyInputError(f"{label} must be an ISO-8601 UTC timestamp string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise StrategyInputError(f"{label} must be a valid ISO-8601 timestamp") from None
    if parsed.tzinfo is None or parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise StrategyInputError(f"{label} must be a UTC timestamp")
    return parsed


def _validate_bars(bars: list[dict[str, Any]], label: str, minimum: int = 10) -> None:
    if not isinstance(bars, list) or len(bars) < minimum:
        raise StrategyInputError(f"{label} must contain at least {minimum} bars")
    previous = None
    for index, bar in enumerate(bars):
        if not isinstance(bar, dict) or not all(key in bar for key in (*OHLCV, "timestamp")):
            raise StrategyInputError(f"{label}[{index}] requires timestamp and OHLCV")
        ts = _timestamp(bar["timestamp"], f"{label}[{index}].timestamp")
        if previous is not None and ts <= previous:
            raise StrategyInputError(f"{label} timestamps must be strictly increasing")
        previous = ts
        values = []
        for key in OHLCV:
            value = bar[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(float(value)):
                raise StrategyInputError(f"{label}[{index}].{key} must be finite numeric")
            values.append(float(value))
        o, h, low, close, volume = values
        if low <= 0 or h < low or not (low <= o <= h and low <= close <= h) or volume < 0:
            raise StrategyInputError(f"{label}[{index}] has invalid OHLCV bounds")


def _pivots(bars: list[dict[str, Any]], left: int, right: int) -> list[dict[str, Any]]:
    result = []
    for index in range(left, len(bars) - right):
        window = bars[index-left:index+right+1]
        highs = [float(row["high"]) for row in window]
        lows = [float(row["low"]) for row in window]
        high = float(bars[index]["high"])
        low = float(bars[index]["low"])
        if highs.count(high) == 1 and high == max(highs):
            result.append({"kind": "high", "index": index, "price": high,
                           "confirmed_at": index + right,
                           "available_at": bars[index + right]["timestamp"]})
        if lows.count(low) == 1 and low == min(lows):
            result.append({"kind": "low", "index": index, "price": low,
                           "confirmed_at": index + right,
                           "available_at": bars[index + right]["timestamp"]})
    return sorted(result, key=lambda row: (row["confirmed_at"], row["index"], row["kind"]))


def _rejection(bar: dict[str, Any], direction: str) -> bool:
    o, h, low, close = (float(bar[k]) for k in ("open", "high", "low", "close"))
    span = h - low
    if span <= 0:
        return False
    body = abs(close - o)
    upper = h - max(o, close)
    lower = min(o, close) - low
    if body / span >= 0.40:
        return False
    if direction == "long":
        return lower >= 2 * body and close > (h + low) / 2
    return upper >= 2 * body and close < (h + low) / 2


def _engulfing(previous: dict[str, Any], current: dict[str, Any], direction: str) -> bool:
    po, pc = float(previous["open"]), float(previous["close"])
    co, cc = float(current["open"]), float(current["close"])
    if direction == "long":
        return cc > co and pc < po and cc > po and co < pc
    return cc < co and pc > po and cc < po and co > pc


def _zone_contains(price: float, zones: Iterable[dict[str, Any]], direction: str) -> bool:
    return any(z["direction"] == direction and z["lower"] <= price <= z["upper"] for z in zones)


def _build_4h_context(bars: list[dict[str, Any]], swing_left: int, swing_right: int,
                      ob_search_bars: int) -> list[dict[str, Any]]:
    """Create point-in-time context snapshots; no pivot/zone is visible before confirmation."""
    pivots = _pivots(bars, swing_left, swing_right)
    snapshots = []
    active_pivots: dict[str, dict[str, Any] | None] = {"high": None, "low": None}
    active_zones: list[dict[str, Any]] = []
    bias = "neutral"
    broken: set[tuple[str, int]] = set()
    pivot_cursor = 0

    for index, bar in enumerate(bars):
        while pivot_cursor < len(pivots) and pivots[pivot_cursor]["confirmed_at"] <= index:
            pivot = pivots[pivot_cursor]
            active_pivots[pivot["kind"]] = pivot
            pivot_cursor += 1

        close = float(bar["close"])
        event = None
        for kind, direction in (("high", "bullish"), ("low", "bearish")):
            pivot = active_pivots[kind]
            if pivot is None:
                continue
            key = (kind, pivot["index"])
            crossed = close > pivot["price"] if kind == "high" else close < pivot["price"]
            if crossed and key not in broken:
                broken.add(key)
                event = {"type": "CHoCH" if bias not in ("neutral", direction) else "BOS",
                         "direction": direction, "index": index,
                         "level": pivot["price"], "swing_index": pivot["index"]}
                bias = direction
                start = max(0, index - ob_search_bars)
                opposite = [j for j in range(start, index)
                            if (float(bars[j]["close"]) < float(bars[j]["open"])
                                if direction == "bullish"
                                else float(bars[j]["close"]) > float(bars[j]["open"]))]
                if opposite:
                    j = opposite[-1]
                    active_zones.append({
                        "kind": "OB", "direction": direction,
                        "lower": float(bars[j]["low"]), "upper": float(bars[j]["high"]),
                        "created_at": bar["timestamp"], "source_index": j,
                    })
                break

        # Three-candle FVG becomes observable only after the third candle closes.
        if index >= 2:
            older, current = bars[index - 2], bar
            if float(current["low"]) > float(older["high"]):
                active_zones.append({
                    "kind": "FVG", "direction": "bullish",
                    "lower": float(older["high"]), "upper": float(current["low"]),
                    "created_at": bar["timestamp"], "source_index": index,
                })
            if float(current["high"]) < float(older["low"]):
                active_zones.append({
                    "kind": "FVG", "direction": "bearish",
                    "lower": float(current["high"]), "upper": float(older["low"]),
                    "created_at": bar["timestamp"], "source_index": index,
                })

        # Mitigation is applied only from this bar onward; invalidated zones are removed.
        survivors = []
        for zone in active_zones:
            touched = float(bar["low"]) <= zone["upper"] and float(bar["high"]) >= zone["lower"]
            if zone["created_at"] != bar["timestamp"] and touched:
                continue
            survivors.append(zone)
        active_zones = survivors

        high_pivot, low_pivot = active_pivots["high"], active_pivots["low"]
        eq = None
        if high_pivot and low_pivot and high_pivot["price"] > low_pivot["price"]:
            eq = (high_pivot["price"] + low_pivot["price"]) / 2
        snapshots.append({
            "available_at": bar["timestamp"], "bias": bias, "event": event,
            "swing_high": high_pivot, "swing_low": low_pivot, "equilibrium": eq,
            "zones": [dict(zone) for zone in active_zones],
        })
    return snapshots


def analyze_smc_mean_rejection(
    h4_bars: list[dict[str, Any]],
    m5_bars: list[dict[str, Any]],
    *,
    swing_left: int = 2,
    swing_right: int = 2,
    ob_search_bars: int = 8,
    minimum_rr: float = 2.5,
    target_rr: float = 3.0,
    risk_pct: float = 0.01,
    point_value: float = 1.0,
    session_start_utc: int | None = None,
    session_end_utc: int | None = None,
) -> dict[str, Any]:
    """Generate causal next-bar entry candidates from completed 4H and 5M candles."""
    _validate_bars(h4_bars, "h4_bars")
    _validate_bars(m5_bars, "m5_bars")
    if not (1 <= swing_left <= 10 and 1 <= swing_right <= 10):
        raise StrategyInputError("swing_left and swing_right must be in [1, 10]")
    if not (1.0 <= minimum_rr <= 5.0 and minimum_rr <= target_rr <= 5.0):
        raise StrategyInputError("RR must satisfy 1 <= minimum_rr <= target_rr <= 5")
    if isinstance(risk_pct, bool) or not isinstance(risk_pct, (int, float)) or not (0 < risk_pct <= 0.01):
        raise StrategyInputError("risk_pct must be greater than 0 and no more than 1%")
    if isinstance(point_value, bool) or not isinstance(point_value, (int, float)) or not isfinite(float(point_value)) or point_value <= 0:
        raise StrategyInputError("point_value must be positive and finite")
    if (session_start_utc is None) != (session_end_utc is None):
        raise StrategyInputError("both session boundaries must be provided together")
    if session_start_utc is not None and not (0 <= session_start_utc < 24 and 0 <= session_end_utc <= 24 and session_start_utc < session_end_utc):
        raise StrategyInputError("session hours must satisfy 0 <= start < end <= 24")

    contexts = _build_4h_context(h4_bars, swing_left, swing_right, ob_search_bars)
    context_cursor = -1
    signals = []
    pivots5 = _pivots(m5_bars, 2, 2)
    latest5: dict[str, dict[str, Any] | None] = {"high": None, "low": None}
    pivot5_cursor = 0

    for i in range(2, len(m5_bars) - 1):
        now = _timestamp(m5_bars[i]["timestamp"], f"m5_bars[{i}].timestamp")
        while context_cursor + 1 < len(contexts) and _timestamp(contexts[context_cursor + 1]["available_at"], "h4 available_at") <= now:
            context_cursor += 1
        while pivot5_cursor < len(pivots5) and pivots5[pivot5_cursor]["confirmed_at"] <= i:
            p = pivots5[pivot5_cursor]
            latest5[p["kind"]] = p
            pivot5_cursor += 1
        if context_cursor < 0:
            continue
        ctx = contexts[context_cursor]
        direction = "long" if ctx["bias"] == "bullish" else "short" if ctx["bias"] == "bearish" else None
        if direction is None or ctx["equilibrium"] is None:
            continue
        if session_start_utc is not None and not (session_start_utc <= now.hour < session_end_utc):
            continue

        price = float(m5_bars[i]["close"])
        eq = float(ctx["equilibrium"])
        if (direction == "long" and price >= eq) or (direction == "short" and price <= eq):
            continue
        if not _zone_contains(price, ctx["zones"], direction):
            continue

        previous, current = m5_bars[i - 1], m5_bars[i]
        rejection = _rejection(current, direction)
        engulf = _engulfing(previous, current, direction)
        pivot = latest5["low" if direction == "long" else "high"]
        if pivot is None:
            continue
        swept = (float(current["low"]) < pivot["price"] and price > pivot["price"]) if direction == "long" else (
            float(current["high"]) > pivot["price"] and price < pivot["price"])
        micro_bos = price > float(previous["high"]) if direction == "long" else price < float(previous["low"])
        if not swept or not (rejection or engulf) or not micro_bos:
            continue

        stop = float(current["low"]) if direction == "long" else float(current["high"])
        entry = float(m5_bars[i + 1]["open"])
        distance = entry - stop if direction == "long" else stop - entry
        if not isfinite(distance) or distance <= 0:
            continue
        rr = (eq - entry) / distance if direction == "long" else (entry - eq) / distance
        if rr < minimum_rr:
            continue
        signals.append({
            "strategy_id": STRATEGY_ID, "strategy_version": STRATEGY_VERSION,
            "direction": direction, "signal_index": i, "signal_timestamp": current["timestamp"],
            "entry_index": i + 1, "entry_timestamp": m5_bars[i + 1]["timestamp"],
            "entry_price": entry, "stop_price": stop,
            "target_1": entry + distance * minimum_rr if direction == "long" else entry - distance * minimum_rr,
            "target_2": entry + distance * target_rr if direction == "long" else entry - distance * target_rr,
            "risk_distance": distance, "rr_to_equilibrium": rr,
            "risk_pct": float(risk_pct), "point_value": float(point_value),
            "equilibrium": eq, "context_timestamp": ctx["available_at"],
            "structure_bias": ctx["bias"], "zone_types": sorted({z["kind"] for z in ctx["zones"] if z["direction"] == ("bullish" if direction == "long" else "bearish")}),
            "liquidity_sweep": True, "rejection_candle": rejection,
            "engulfing": engulf, "micro_bos": True,
        })
    return {
        "ok": True, "strategy_id": STRATEGY_ID, "strategy_version": STRATEGY_VERSION,
        "mode": "research_only", "signal_count": len(signals), "signals": signals,
        "orders_submitted": False, "execution_enabled": False, "live_trading_enabled": False,
        "data_contract": {"timestamps": "timezone-aware UTC candle close-times",
                          "timeframes": {"bias": "4H", "entry": "5M"},
                          "entry_fill": "next 5M candle open"},
    }


def simulate_smc_mean_rejection(
    signals: list[dict[str, Any]],
    m5_bars: list[dict[str, Any]],
    *,
    initial_equity: float = 10000.0,
    risk_pct: float = 0.01,
    point_value: float = 1.0,
    fee_rate_per_side: float = 0.0,
    slippage_per_unit: float = 0.0,
) -> dict[str, Any]:
    """Single-position, cost-aware simulator; 50% at TP1, then BE/TP2 for the remainder."""
    _validate_bars(m5_bars, "m5_bars")
    for name, value in (("initial_equity", initial_equity), ("risk_pct", risk_pct),
                        ("point_value", point_value), ("fee_rate_per_side", fee_rate_per_side),
                        ("slippage_per_unit", slippage_per_unit)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(float(value)):
            raise StrategyInputError(f"{name} must be finite numeric")
    if initial_equity <= 0 or not (0 < risk_pct <= 0.01) or point_value <= 0:
        raise StrategyInputError("equity/point_value must be positive and risk_pct must be <= 1%")
    if not (0 <= fee_rate_per_side < 0.05 and 0 <= slippage_per_unit < 1):
        raise StrategyInputError("invalid cost assumptions")

    equity = float(initial_equity)
    peak = equity
    max_dd = 0.0
    trades = []
    busy_until = -1
    for signal in signals:
        entry_i = int(signal["entry_index"])
        if entry_i <= busy_until or entry_i >= len(m5_bars):
            continue
        direction = signal["direction"]
        entry = float(signal["entry_price"])
        stop = float(signal["stop_price"])
        tp1, tp2 = float(signal["target_1"]), float(signal["target_2"])
        distance = abs(entry - stop)
        quantity = equity * risk_pct / (distance * point_value)
        if quantity <= 0 or not isfinite(quantity):
            continue
        remaining = quantity
        realized = 0.0
        partial = False
        exit_i = None
        exit_reason = None
        for j in range(entry_i, len(m5_bars)):
            bar = m5_bars[j]
            high, low = float(bar["high"]), float(bar["low"])
            if not partial:
                stop_hit = low <= stop if direction == "long" else high >= stop
                tp1_hit = high >= tp1 if direction == "long" else low <= tp1
                if stop_hit:  # conservative when stop and TP1 both touch in one OHLC bar
                    exit_i, exit_reason = j, "stop_loss_before_tp1"
                    realized += remaining * ((stop - entry) if direction == "long" else (entry - stop)) * point_value
                    remaining = 0.0
                    break
                if tp1_hit:
                    closed = quantity * 0.5
                    realized += closed * ((tp1 - entry) if direction == "long" else (entry - tp1)) * point_value
                    remaining -= closed
                    partial = True
                    # Do not assume an intrabar path from TP1 to TP2. The remainder
                    # is conservatively closed at breakeven if TP2 is also touched.
                    tp2_hit_same_bar = high >= tp2 if direction == "long" else low <= tp2
                    if tp2_hit_same_bar:
                        exit_i, exit_reason = j, "tp1_then_ambiguous_tp2_remainder_at_be"
                        realized += 0.0
                        remaining = 0.0
                        break
            else:
                be_hit = low <= entry if direction == "long" else high >= entry
                tp2_hit = high >= tp2 if direction == "long" else low <= tp2
                if be_hit:  # conservative if BE and TP2 are both touched in the same bar
                    exit_i, exit_reason = j, "breakeven_before_tp2"
                    remaining = 0.0
                    break
                if tp2_hit:
                    realized += remaining * ((tp2 - entry) if direction == "long" else (entry - tp2)) * point_value
                    remaining = 0.0
                    exit_i, exit_reason = j, "tp2"
                    break
        if exit_i is None:
            exit_i = len(m5_bars) - 1
            last = float(m5_bars[exit_i]["close"])
            realized += remaining * ((last - entry) if direction == "long" else (entry - last)) * point_value
            remaining = 0.0
            exit_reason = "end_of_data"
        turnover = quantity * point_value * (abs(entry) + abs(float(m5_bars[exit_i]["close"])))
        costs = turnover * fee_rate_per_side + quantity * point_value * slippage_per_unit * 2
        net = realized - costs
        equity += net
        peak = max(peak, equity)
        max_dd = max(max_dd, (peak - equity) / peak if peak > 0 else 0.0)
        trades.append({
            "direction": direction, "entry_index": entry_i, "exit_index": exit_i,
            "entry_price": entry, "stop_price": stop, "target_1": tp1, "target_2": tp2,
            "quantity": quantity, "partial_tp1": partial, "gross_pnl": realized,
            "estimated_costs": costs, "net_pnl": net, "equity_after": equity,
            "exit_reason": exit_reason,
        })
        busy_until = exit_i

    wins = sum(1 for trade in trades if trade["net_pnl"] > 0)
    losses = sum(1 for trade in trades if trade["net_pnl"] < 0)
    gross_profit = sum(t["net_pnl"] for t in trades if t["net_pnl"] > 0)
    gross_loss = -sum(t["net_pnl"] for t in trades if t["net_pnl"] < 0)
    return {
        "ok": True, "strategy_id": STRATEGY_ID, "strategy_version": STRATEGY_VERSION,
        "mode": "research_backtest_only", "trade_count": len(trades),
        "win_rate_pct": round(wins / len(trades) * 100, 4) if trades else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 6) if gross_loss > 0 else None,
        "net_profit": round(sum(t["net_pnl"] for t in trades), 8),
        "ending_equity": round(equity, 8), "max_drawdown_pct": round(max_dd * 100, 4),
        "trades": trades,
        "cost_assumptions": {"fee_rate_per_side": fee_rate_per_side,
                             "slippage_per_unit_per_side": slippage_per_unit},
        "fill_assumptions": ["signal only after completed 5M close",
                             "entry at next 5M open",
                             "same-bar stop/target ambiguity resolved conservatively",
                             "TP1 closes 50%; remainder moves to breakeven"],
        "orders_submitted": False, "execution_enabled": False, "live_trading_enabled": False,
    }

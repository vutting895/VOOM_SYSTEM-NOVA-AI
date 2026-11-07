"""Rule-based Elliott impulse-wave candidate detector.

This is a heuristic research annotation, not an authoritative wave count.
Pivots are emitted only after their right-side confirmation bars have closed.
"""

from __future__ import annotations
from typing import Any


def _pivot_points(bars: list[dict[str, Any]], left_bars: int, right_bars: int) -> list[dict[str, Any]]:
    pivots: list[dict[str, Any]] = []
    for i in range(left_bars, len(bars) - right_bars):
        neighbors = bars[i - left_bars:i] + bars[i + 1:i + right_bars + 1]
        high = float(bars[i]["high"])
        low = float(bars[i]["low"])
        is_high = all(high >= float(row["high"]) for row in neighbors) and any(high > float(row["high"]) for row in neighbors)
        is_low = all(low <= float(row["low"]) for row in neighbors) and any(low < float(row["low"]) for row in neighbors)
        if is_high == is_low:
            continue
        kind = "HIGH" if is_high else "LOW"
        point = {"index": i, "timestamp": bars[i]["timestamp"], "type": kind,
                 "price": high if is_high else low, "confirmed_at_index": i + right_bars}
        if pivots and pivots[-1]["type"] == kind:
            previous = pivots[-1]
            more_extreme = (kind == "HIGH" and point["price"] > previous["price"]) or (kind == "LOW" and point["price"] < previous["price"])
            if more_extreme:
                pivots[-1] = point
        else:
            pivots.append(point)
    return pivots


def _impulse_candidate(points: list[dict[str, Any]], direction: str) -> dict[str, Any] | None:
    expected = ["LOW", "HIGH", "LOW", "HIGH", "LOW", "HIGH"] if direction == "BULLISH" else ["HIGH", "LOW", "HIGH", "LOW", "HIGH", "LOW"]
    if [p["type"] for p in points] != expected:
        return None
    prices = [float(p["price"]) for p in points]
    if direction == "BULLISH":
        w1, w2, w3, w4, w5 = prices[1]-prices[0], prices[1]-prices[2], prices[3]-prices[2], prices[3]-prices[4], prices[5]-prices[4]
        if min(w1, w3, w5) <= 0 or prices[2] <= prices[0] or prices[4] <= prices[1]:
            return None
    else:
        w1, w2, w3, w4, w5 = prices[0]-prices[1], prices[2]-prices[1], prices[2]-prices[3], prices[4]-prices[3], prices[4]-prices[5]
        if min(w1, w3, w5) <= 0 or prices[2] >= prices[0] or prices[4] >= prices[1]:
            return None
    wave2_retracement = w2 / w1
    wave4_retracement = w4 / w3
    if not (0 < wave2_retracement < 1 and 0 < wave4_retracement < 1):
        return None
    if w3 < min(w1, w5):
        return None
    return {
        "type": f"{direction}_IMPULSE_CANDIDATE", "status": "HEURISTIC_CANDIDATE",
        "start_index": points[0]["index"], "end_index": points[-1]["index"],
        "confirmed_at_index": points[-1]["confirmed_at_index"],
        "points": [{"wave": f"W{i}", **point} for i, point in enumerate(points)],
        "ratios": {"wave2_retracement": round(wave2_retracement, 4),
                   "wave3_vs_wave1": round(w3 / w1, 4),
                   "wave4_retracement": round(wave4_retracement, 4),
                   "wave5_vs_wave1": round(w5 / w1, 4)},
        "rules_checked": ["wave_2_does_not_exceed_wave_1_origin", "wave_3_is_not_the_shortest_impulse_wave",
                          "wave_4_does_not_overlap_wave_1_price_territory", "alternating_confirmed_swing_pivots"],
        "limitations": "Heuristic candidate only; alternate counts and higher-timeframe context are not resolved.",
    }


def detect_elliott_impulses(bars: list[dict[str, Any]], left_bars: int = 2, right_bars: int = 2, max_patterns: int = 10) -> dict[str, Any]:
    if left_bars < 1 or right_bars < 1:
        raise ValueError("left_bars and right_bars must be positive")
    if max_patterns < 1 or max_patterns > 50:
        raise ValueError("max_patterns must be between 1 and 50")
    pivots = _pivot_points(bars, left_bars, right_bars)
    patterns = []
    first_start = max(0, len(pivots) - 50)
    last_start = max(0, len(pivots) - 5)
    for start in range(first_start, last_start):
        points = pivots[start:start + 6]
        if len(points) != 6:
            continue
        direction = "BULLISH" if points[0]["type"] == "LOW" else "BEARISH"
        candidate = _impulse_candidate(points, direction)
        if candidate:
            patterns.append(candidate)
    patterns.sort(key=lambda item: (item["confirmed_at_index"], item["end_index"]))
    patterns = patterns[-max_patterns:]
    return {"pivot_count": len(pivots), "pivot_left_bars": left_bars, "pivot_right_bars": right_bars,
            "patterns": patterns, "latest_pattern": patterns[-1] if patterns else None,
            "method": "confirmed_pivot_impulse_rules_v1"}

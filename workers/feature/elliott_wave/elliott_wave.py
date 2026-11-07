"""Heuristic Elliott-wave labeling over confirmed swing pivots.

This module emits candidate counts for research only. It does not claim a unique
or authoritative Elliott-wave interpretation and never emits trade orders.
"""
from __future__ import annotations
from typing import Any
from workers.feature.smc_wave.smc_strategy import _pivots, _validate


def analyze_elliott_wave(candles: list[dict[str, Any]], left: int = 2, right: int = 2) -> dict[str, Any]:
    _validate(candles)
    if not (1 <= left <= 10 and 1 <= right <= 10):
        raise ValueError("left and right must be between 1 and 10")
    pivots = _pivots(candles, left, right)
    # Keep alternating extrema; same-kind consecutive pivots retain the more
    # extreme value without moving its confirmation time backwards.
    swings: list[dict[str, Any]] = []
    for p in pivots:
        if swings and swings[-1]["kind"] == p["kind"]:
            better = p["price"] > swings[-1]["price"] if p["kind"] == "high" else p["price"] < swings[-1]["price"]
            if better:
                swings[-1] = p
        else:
            swings.append(p)
    labels = ["1", "2", "3", "4", "5", "A", "B", "C"]
    candidates = []
    for start in range(max(0, len(swings) - 16), max(0, len(swings) - 7)):
        seq = swings[start:start + 8]
        if len(seq) != 8:
            continue
        direction = "bullish" if seq[0]["kind"] == "low" else "bearish"
        candidates.append({
            "direction": direction,
            "labels": [{"wave": labels[i], "pivot_index": p["index"], "confirmed_at": p["confirmed_at"],
                        "kind": p["kind"], "price": p["price"]} for i, p in enumerate(seq)],
            "confirmation_index": max(p["confirmed_at"] for p in seq),
            "heuristic": True,
        })
    latest = candidates[-1] if candidates else None
    return {
        "ok": True, "strategy": "ElliottWave", "version": "0.1.0-heuristic",
        "pivot_count": len(swings), "latest_candidate": latest,
        "candidate_count": len(candidates), "orders_submitted": False,
        "live_trading_enabled": False,
        "limitations": ["Heuristic alternating-pivot count, not a validated wave classifier.",
                        "Wave degree and alternative counts are not resolved.",
                        "Use only completed candles and out-of-sample validation."]
    }

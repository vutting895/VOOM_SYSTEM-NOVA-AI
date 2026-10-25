"""Deterministic XABCD harmonic-pattern candidate detector.

This is a newly authored, testable implementation. It does not copy the broken
find_pattern() function in the source notebook and is not financial advice.
"""
from __future__ import annotations
from typing import Any

PATTERNS = {
    # ratios: AB/XA, BC/AB range, CD/BC range, AD/XA
    "gartley": {"ab_xa": (0.618, 0.06), "bc_ab": (0.382, 0.886), "cd_bc": (1.272, 1.618), "ad_xa": (0.786, 0.08)},
    "bat": {"ab_xa": (0.382, 0.500), "bc_ab": (0.382, 0.886), "cd_bc": (1.618, 2.618), "ad_xa": (0.886, 0.08)},
    "butterfly": {"ab_xa": (0.786, 0.06), "bc_ab": (0.382, 0.886), "cd_bc": (1.618, 2.240), "ad_xa": (1.270, 1.618)},
    "crab": {"ab_xa": (0.382, 0.618), "bc_ab": (0.382, 0.886), "cd_bc": (2.240, 3.618), "ad_xa": (1.618, 0.08)},
}

def _within(value: float, rule: tuple[float, float], *, center_tolerance: bool = False) -> bool:
    if center_tolerance:
        return abs(value - rule[0]) <= rule[1]
    return rule[0] <= value <= rule[1]

def detect_xabcd(points: list[dict[str, Any]]) -> dict[str, Any]:
    """Check five ordered pivots [{label, price}, ...] for a harmonic candidate."""
    if not isinstance(points, list) or len(points) != 5:
        return {"ok": False, "pattern": None, "reason": "exactly five pivots X,A,B,C,D are required"}
    try:
        prices = [float(p["price"]) for p in points]
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "pattern": None, "reason": "each pivot needs a numeric price"}
    if any(not __import__("math").isfinite(x) for x in prices):
        return {"ok": False, "pattern": None, "reason": "pivot prices must be finite"}
    x, a, b, c, d = prices
    xa, ab, bc, cd, ad = abs(a-x), abs(b-a), abs(c-b), abs(d-c), abs(d-a)
    if min(xa, ab, bc, cd) <= 0:
        return {"ok": True, "pattern": None, "reason": "degenerate pivots", "ratios": {}}
    ratios = {"ab_xa": ab/xa, "bc_ab": bc/ab, "cd_bc": cd/bc, "ad_xa": ad/xa}
    found = []
    for name, rule in PATTERNS.items():
        if name == "gartley":
            matches = _within(ratios["ab_xa"], rule["ab_xa"], center_tolerance=True) and _within(ratios["ad_xa"], rule["ad_xa"], center_tolerance=True)
        elif name == "bat":
            matches = _within(ratios["ab_xa"], rule["ab_xa"]) and _within(ratios["ad_xa"], rule["ad_xa"], center_tolerance=True)
        elif name == "butterfly":
            matches = _within(ratios["ab_xa"], rule["ab_xa"], center_tolerance=True) and _within(ratios["ad_xa"], rule["ad_xa"])
        else:
            matches = _within(ratios["ab_xa"], rule["ab_xa"]) and _within(ratios["ad_xa"], rule["ad_xa"], center_tolerance=True)
        matches = matches and _within(ratios["bc_ab"], rule["bc_ab"]) and _within(ratios["cd_bc"], rule["cd_bc"])
        if matches:
            found.append(name)
    direction = "bullish_candidate" if (x > a and b > a and d < c) else "bearish_candidate" if (x < a and b < a and d > c) else "undetermined"
    return {"ok": True, "pattern": found[0] if found else None, "candidates": found,
            "direction": direction if found else None, "ratios": {k: round(v, 6) for k, v in ratios.items()},
            "reason": "ratio match only; pivots and pattern context require confirmation" if found else "no supported ratio combination"}

"""Deterministic entry-risk gates for Exness Demo commands.

All monetary values must be normalized to the account currency by the caller.
The 10% daily-loss threshold is an entry lock only; it never liquidates positions.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from adapter import PolicyRejected


@dataclass(frozen=True)
class RiskSnapshot:
    equity: float
    broker_day_start_equity: float
    aggregate_open_risk: float
    open_orders_and_positions_count: int
    proposed_trade_risk: float


@dataclass(frozen=True)
class RiskDecision:
    approved: bool
    reason: str
    daily_loss_pct: float
    projected_open_risk_pct: float
    projected_orders_and_positions_count: int


def evaluate_entry_risk(snapshot: RiskSnapshot, *,
                        max_daily_loss_pct: float = 10.0,
                        max_aggregate_open_risk_pct: float = 9.0,
                        max_open_orders_and_positions: int = 5) -> RiskDecision:
    values = (
        snapshot.equity, snapshot.broker_day_start_equity,
        snapshot.aggregate_open_risk, snapshot.proposed_trade_risk,
    )
    if not all(math.isfinite(v) for v in values):
        raise PolicyRejected("Risk snapshot contains non-finite values")
    if snapshot.equity <= 0 or snapshot.broker_day_start_equity <= 0:
        raise PolicyRejected("Equity values must be positive")
    if snapshot.aggregate_open_risk < 0 or snapshot.proposed_trade_risk <= 0:
        raise PolicyRejected("Risk values are invalid")
    if type(snapshot.open_orders_and_positions_count) is not int or snapshot.open_orders_and_positions_count < 0:
        raise PolicyRejected("Open order/position count is invalid")
    if not (0 < max_daily_loss_pct <= 100 and
            0 < max_aggregate_open_risk_pct <= 100 and max_open_orders_and_positions >= 1):
        raise PolicyRejected("Risk policy configuration is invalid")

    daily_loss_pct = max(
        0.0,
        (snapshot.broker_day_start_equity - snapshot.equity)
        / snapshot.broker_day_start_equity * 100.0,
    )
    projected_risk_pct = (
        snapshot.aggregate_open_risk + snapshot.proposed_trade_risk
    ) / snapshot.equity * 100.0
    projected_count = snapshot.open_orders_and_positions_count + 1

    # Entry-only lock. Existing positions remain untouched by this decision.
    if daily_loss_pct >= max_daily_loss_pct:
        return RiskDecision(False, "daily_loss_entry_lock", daily_loss_pct,
                            projected_risk_pct, projected_count)
    if projected_risk_pct > max_aggregate_open_risk_pct:
        return RiskDecision(False, "aggregate_open_risk_limit", daily_loss_pct,
                            projected_risk_pct, projected_count)
    if projected_count > max_open_orders_and_positions:
        return RiskDecision(False, "max_open_orders_and_positions", daily_loss_pct,
                            projected_risk_pct, projected_count)
    return RiskDecision(True, "approved", daily_loss_pct,
                        projected_risk_pct, projected_count)

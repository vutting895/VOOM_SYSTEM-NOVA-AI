"""Fail-closed risk policy. Validation only; never places orders."""
from __future__ import annotations
from datetime import datetime, timezone
from math import isfinite
from uuid import uuid4

class RiskWorker:
    def __init__(self, max_alloc_pct: float = 20.0, max_daily_loss_pct: float = 3.0,
                 max_drawdown_pct: float = 7.0, max_leverage: float = 1.0,
                 max_data_age_seconds: int = 60):
        if not (0 < max_alloc_pct <= 100 and 0 < max_daily_loss_pct <= 100 and
                0 < max_drawdown_pct <= 100 and max_leverage >= 1 and max_data_age_seconds > 0):
            raise ValueError("Invalid risk policy")
        self.max_alloc_pct=max_alloc_pct; self.max_daily_loss_pct=max_daily_loss_pct
        self.max_drawdown_pct=max_drawdown_pct; self.max_leverage=max_leverage
        self.max_data_age_seconds=max_data_age_seconds

    def check(self, *, allocation_pct: float, daily_loss_pct: float, drawdown_pct: float,
              leverage: float = 1.0, data_age_seconds: float = 0.0,
              paper_mode: bool = True, market_open: bool = True) -> dict:
        reasons=[]
        values=(allocation_pct,daily_loss_pct,drawdown_pct,leverage,data_age_seconds)
        if any(isinstance(v, bool) or not isinstance(v,(int,float)) for v in values): reasons.append("invalid_numeric_input")
        elif any(not isfinite(v) for v in values): reasons.append("non_finite_input")
        else:
            if not 0 < allocation_pct <= self.max_alloc_pct: reasons.append("allocation_limit")
            if daily_loss_pct >= self.max_daily_loss_pct: reasons.append("daily_loss_limit")
            if drawdown_pct >= self.max_drawdown_pct: reasons.append("drawdown_limit")
            if leverage < 1 or leverage > self.max_leverage: reasons.append("leverage_limit")
            if data_age_seconds < 0 or data_age_seconds > self.max_data_age_seconds: reasons.append("stale_market_data")
        if not market_open: reasons.append("market_closed")
        if not paper_mode: reasons.append("live_mode_not_authorized")
        return {"decision_id":str(uuid4()),"status":"allow_paper" if not reasons else "reject",
                "passed":not reasons,"reason_codes":reasons,"evaluated_at":datetime.now(timezone.utc).isoformat(),
                "policy_version":"nova-risk-1.0","live_execution_allowed":False,
                "message":"Paper simulation only; this is not broker authorization."}

if __name__ == "__main__":
    print(RiskWorker().check(allocation_pct=10,daily_loss_pct=0,drawdown_pct=0,paper_mode=True))
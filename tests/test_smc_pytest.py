from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "workers" / "feature" / "smc_wave"))
from smc_strategy import analyze_smc, run_smc_backtest


def candles():
    closes = [10,9,8,9,11,10,9,12,13,11,10,14,15,13,12,16,17,15,14,18,19,17,16,20,21,19,18,22,23,21]
    out=[]
    for i,c in enumerate(closes):
        o=c-0.4 if i%2 else c+0.4
        out.append({"open":o,"high":max(o,c)+0.5,"low":min(o,c)-0.5,"close":c})
    return out


def test_fvg_bounds_and_midpoint_are_consistent():
    result=analyze_smc(candles(), include_full_history=True)
    for zone in result["fair_value_gaps"]:
        assert zone["lower"] < zone["upper"]
        assert zone["midpoint"] == (zone["lower"] + zone["upper"]) / 2
        assert zone["type"] in {"bullish_fvg", "bearish_fvg"}


def test_backtest_metrics_are_bounded_and_research_only():
    result=run_smc_backtest(candles(), fee_rate=0.001, slippage_rate=0.0005)
    assert 0 <= result["win_rate_pct"] <= 100
    assert result["trade_count"] == len(result["trades"])
    assert result["orders_submitted"] is False
    assert result["live_trading_enabled"] is False


def test_costs_reduce_or_preserve_each_trade_net_pnl():
    no_cost=run_smc_backtest(candles(), fee_rate=0, slippage_rate=0)
    with_cost=run_smc_backtest(candles(), fee_rate=0.001, slippage_rate=0.0005)
    assert len(no_cost["trades"]) == len(with_cost["trades"])
    for gross, net in zip(no_cost["trades"], with_cost["trades"]):
        assert net["net_pnl_per_unit"] <= gross["net_pnl_per_unit"]


def test_invalid_risk_reward_is_rejected():
    import pytest
    with pytest.raises(ValueError):
        run_smc_backtest(candles(), reward_risk=0)

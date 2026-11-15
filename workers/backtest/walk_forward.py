"""Rolling walk-forward evaluation for the fixed SMC research baseline."""
from __future__ import annotations
from typing import Any
from workers.feature.smc_wave.smc_strategy import analyze_smc, run_smc_backtest


def run_walk_forward(candles: list[dict[str, Any]], train_bars: int = 60,
                     test_bars: int = 30, step_bars: int | None = None,
                     warmup_bars: int = 30, reward_risk: float = 2.0,
                     fee_rate: float = 0.001, slippage_rate: float = 0.0005) -> dict[str, Any]:
    if train_bars < 20 or test_bars < 10 or warmup_bars < 10:
        raise ValueError("train_bars >= 20, test_bars >= 10 and warmup_bars >= 10 required")
    step = test_bars if step_bars is None else step_bars
    if step < 1:
        raise ValueError("step_bars must be positive")
    if len(candles) < train_bars + test_bars:
        raise ValueError("insufficient candles for at least one train/test fold")
    folds = []
    cursor = train_bars
    fold_no = 1
    while cursor + test_bars <= len(candles):
        train = candles[:cursor]
        test_end = min(cursor + test_bars, len(candles))
        test = candles[cursor:test_end]
        # Context bars allow confirmed swings to exist at the test boundary.
        context_start = max(0, cursor - warmup_bars)
        segment = candles[context_start:test_end]
        context_len = cursor - context_start
        train_analysis = analyze_smc(train)
        result = run_smc_backtest(segment, reward_risk=reward_risk,
                                  fee_rate=fee_rate, slippage_rate=slippage_rate)
        # Count only trades whose signal/entry belongs to the held-out window.
        oos = [t for t in result["trades"] if t["entry_index"] >= context_len]
        wins = sum(t["net_pnl_per_unit"] > 0 for t in oos)
        pnl = sum(t["net_pnl_per_unit"] for t in oos)
        folds.append({
            "fold": fold_no, "train_start": 0, "train_end_exclusive": cursor,
            "test_start": cursor, "test_end_exclusive": test_end,
            "training_bias": train_analysis["structure_bias"],
            "oos_trade_count": len(oos),
            "oos_win_rate_pct": round(100 * wins / len(oos), 4) if oos else 0.0,
            "oos_net_pnl_per_unit": round(pnl, 8),
            "oos_mean_r": round(sum(t["r_multiple"] for t in oos) / len(oos), 6) if oos else 0.0,
            "oos_trades": oos,
        })
        cursor += step
        fold_no += 1
    trades = [t for f in folds for t in f["oos_trades"]]
    total_wins = sum(t["net_pnl_per_unit"] > 0 for t in trades)
    total_pnl = sum(t["net_pnl_per_unit"] for t in trades)
    return {
        "ok": True, "mode": "walk_forward_out_of_sample_research_only",
        "train_bars": train_bars, "test_bars": test_bars, "step_bars": step,
        "warmup_bars": warmup_bars, "fold_count": len(folds),
        "oos_trade_count": len(trades),
        "oos_win_rate_pct": round(100 * total_wins / len(trades), 4) if trades else 0.0,
        "oos_net_pnl_per_unit": round(total_pnl, 8),
        "folds": folds, "orders_submitted": False, "live_trading_enabled": False,
        "warning": "Fixed-rule rolling evaluation; no parameter fitting or portfolio sizing. Not a return forecast."
    }

"""Leakage-aware expanding walk-forward evaluation for the EMA research baseline."""
from __future__ import annotations

from math import prod
import re
from typing import Any

from workers.quant_engine.quality import canonical_dataset_sha256, validate_ohlcv
from workers.quant_engine.splits import walk_forward_windows
from workers.backtest.engine import BacktestWorker
from workers.tuning.engine import TuningWorker


class WalkForwardEvaluationError(ValueError):
    """Raised when the walk-forward evaluation plan or data is invalid."""


def run_ema_walk_forward(
    candles: list[dict[str, Any]],
    *,
    code_revision: str,
    train_bars: int = 120,
    test_bars: int = 30,
    step_bars: int | None = None,
    purge_bars: int,
    warmup_bars: int = 51,
    max_trials: int = 30,
    minimum_oos_trades: int = 30,
    fee: float = 0.001,
    slippage: float = 0.0005,
    initial_cash: float = 10_000,
) -> dict[str, Any]:
    """Tune each fold on its training slice, then evaluate only on later bars.

    The final untouched holdout must be reserved by the caller and must not be
    included in candles supplied here if it is being used for final promotion.
    Purge bars are excluded from tuning; they may be used as pre-test market
    context for indicators because those observations are known before test start.
    """
    if not isinstance(code_revision, str) or not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", code_revision):
        raise WalkForwardEvaluationError("code_revision must be a full Git SHA")
    if isinstance(train_bars, bool) or not isinstance(train_bars, int) or train_bars < 60:
        raise WalkForwardEvaluationError("train_bars must be an integer >= 60 for the configured EMA grid")
    if isinstance(test_bars, bool) or not isinstance(test_bars, int) or test_bars < 30:
        raise WalkForwardEvaluationError("test_bars must be an integer >= 30")
    if isinstance(warmup_bars, bool) or not isinstance(warmup_bars, int) or warmup_bars < 51:
        raise WalkForwardEvaluationError("warmup_bars must be >= 51 to warm the longest EMA and pre-test signal")
    if isinstance(minimum_oos_trades, bool) or not isinstance(minimum_oos_trades, int) or minimum_oos_trades < 1:
        raise WalkForwardEvaluationError("minimum_oos_trades must be a positive integer")

    try:
        quality = validate_ohlcv(candles)
        windows = walk_forward_windows(
            len(candles),
            train_bars=train_bars,
            test_bars=test_bars,
            step_bars=step_bars,
            purge_bars=purge_bars,
            expanding=True,
        )
    except (ValueError, TypeError) as exc:
        raise WalkForwardEvaluationError(str(exc)) from exc

    dataset_sha = canonical_dataset_sha256(candles)
    backtest = BacktestWorker(fee=fee, slippage=slippage, initial_cash=initial_cash)
    tuner = TuningWorker(max_trials=max_trials)
    folds: list[dict[str, Any]] = []

    for window in windows:
        train = candles[window.train_start:window.train_end]
        test = candles[window.test_start:window.test_end]
        context_start = max(0, window.test_start - warmup_bars)
        context_segment = candles[context_start:window.test_end]
        trade_start_index = window.test_start - context_start

        tuning = tuner.tune(train, backtest.run, objective="sharpe_per_period")
        oos = backtest.run(
            {"name": "EMA crossover", **tuning["best_params"]},
            context_segment,
            trade_start_index=trade_start_index,
        )
        test_start_ts = test[0]["timestamp"]
        test_end_ts = test[-1]["timestamp"]
        ledger = oos["trade_ledger"]
        if any(item["entry_timestamp"] < test_start_ts for item in ledger):
            raise RuntimeError("OOS evaluator detected a trade opened before the held-out window")

        folds.append({
            "fold": window.fold,
            "train_start": window.train_start,
            "train_end_exclusive": window.train_end,
            "purge_bars": window.test_start - window.train_end,
            "test_start": window.test_start,
            "test_end_exclusive": window.test_end,
            "train_dataset_sha256": canonical_dataset_sha256(train),
            "test_dataset_sha256": canonical_dataset_sha256(test),
            "test_start_timestamp": test_start_ts,
            "test_end_timestamp": test_end_ts,
            "objective": tuning["objective"],
            "tuning_trials": tuning["trials"],
            "best_params": tuning["best_params"],
            "oos_total_return_pct": oos["total_return_pct"],
            "oos_max_drawdown_pct": oos["max_drawdown_pct"],
            "oos_sharpe_per_period": oos["sharpe_per_period"],
            "oos_trade_count": oos["total_trades"],
            "oos_winrate_pct": oos["winrate_pct"],
            "oos_profit_factor": oos["profit_factor"],
            "oos_trade_ledger": ledger,
        })

    all_trades = [trade for fold in folds for trade in fold["oos_trade_ledger"]]
    trade_returns = [float(trade["net_return_pct"]) / 100 for trade in all_trades]
    wins = sum(value > 0 for value in trade_returns)
    gains = sum(value for value in trade_returns if value > 0)
    losses = abs(sum(value for value in trade_returns if value < 0))
    profit_factor = gains / losses if losses else (None if not gains else "undefined_no_losses")

    fold_equity = [initial_cash]
    for fold in folds:
        fold_equity.append(fold_equity[-1] * (1 + fold["oos_total_return_pct"] / 100))
    peak = fold_equity[0]
    max_drawdown = 0.0
    for value in fold_equity:
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, (peak - value) / peak if peak else 0.0)

    return {
        "schema_version": "nova.ema-walk-forward.v1",
        "status": "completed",
        "evaluation_mode": "expanding_walk_forward_oos",
        "dataset_sha256": dataset_sha,
        "dataset_start": quality.start_timestamp,
        "dataset_end": quality.end_timestamp,
        "dataset_rows": quality.row_count,
        "code_revision": code_revision,
        "train_bars": train_bars,
        "test_bars": test_bars,
        "step_bars": test_bars if step_bars is None else step_bars,
        "purge_bars": purge_bars,
        "warmup_bars": warmup_bars,
        "fold_count": len(folds),
        "oos_trade_count": len(all_trades),
        "minimum_oos_trades": minimum_oos_trades,
        "oos_trade_count_gate": "met" if len(all_trades) >= minimum_oos_trades else "not_met",
        "oos_winrate_pct": round(100 * wins / len(all_trades), 4) if all_trades else 0.0,
        "oos_profit_factor": round(profit_factor, 6) if isinstance(profit_factor, float) else profit_factor,
        "oos_compounded_return_pct": round((prod(1 + fold["oos_total_return_pct"] / 100 for fold in folds) - 1) * 100, 6),
        "oos_fold_equity_max_drawdown_pct": round(max_drawdown * 100, 6),
        "folds": folds,
        "orders_submitted": False,
        "execution_enabled": False,
        "live_trading_enabled": False,
        "warning": "Rolling OOS folds tune only on each fold's earlier training slice. This is not the reserved final untouched OOS test; reserve that period separately and do not tune on it. Metrics are OHLCV bar simulations, not tick-accurate fills or return forecasts.",
    }

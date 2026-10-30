"""Causal, cost-aware OHLCV backtest evaluator.

Research-only linear long/flat evaluator. Signals are produced only after a
completed bar is available to the research process and are filled no earlier
than the first subsequent bar open. This module never connects to a broker.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from hashlib import sha256
import json
from math import isfinite, sqrt
import re
from typing import Any

from workers.quant_engine import (
    build_run_fingerprint,
    canonical_dataset_sha256,
    validate_ohlcv,
)

EVALUATOR_VERSION = "nova.ohlcv-ema-evaluator.v1"
STRATEGY_ID = "ema-crossover-long-flat"
STRATEGY_VERSION = "1.0.0"
_SHA = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")


class BacktestInputError(ValueError):
    """Raised when market data or experiment assumptions are unsafe."""


def _number(value: Any, label: str, *, minimum: float = 0.0, maximum: float | None = None) -> float:
    if isinstance(value, bool):
        raise BacktestInputError(f"{label} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        raise BacktestInputError(f"{label} must be a finite number") from None
    if not isfinite(result) or result < minimum or (maximum is not None and result > maximum):
        raise BacktestInputError(f"{label} is outside the permitted range")
    return result


def _positive_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise BacktestInputError(f"{label} must be a positive integer")
    return value


def _timestamp(value: Any, label: str, index: int) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            raise BacktestInputError(f"candle {index}: {label} must be ISO-8601") from None
    else:
        raise BacktestInputError(f"candle {index}: {label} must be an ISO-8601 timestamp")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise BacktestInputError(f"candle {index}: {label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _required_text(mapping: Mapping[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 128:
        raise BacktestInputError(f"{key} must be a non-empty string of at most 128 characters")
    return value.strip()


def _validate_market(market: Any) -> dict[str, Any]:
    required = {
        "source", "symbol", "timeframe", "price_basis", "quote_currency",
        "account_currency", "contract_multiplier", "quote_to_account_rate",
        "expected_interval_seconds", "periods_per_year", "reject_gaps",
    }
    if not isinstance(market, Mapping):
        raise BacktestInputError("market metadata is required")
    unknown = set(market) - required
    missing = required - set(market)
    if unknown or missing:
        raise BacktestInputError(
            f"market metadata fields invalid; missing={sorted(missing)}, unknown={sorted(unknown)}"
        )
    result = {key: _required_text(market, key) for key in (
        "source", "symbol", "timeframe", "quote_currency", "account_currency"
    )}
    price_basis = _required_text(market, "price_basis").lower()
    if price_basis not in {"mid", "last"}:
        raise BacktestInputError("price_basis must be 'mid' or 'last' for this evaluator")
    result["price_basis"] = price_basis
    result["contract_multiplier"] = _number(market["contract_multiplier"], "contract_multiplier", minimum=1e-12)
    result["quote_to_account_rate"] = _number(market["quote_to_account_rate"], "quote_to_account_rate", minimum=1e-12)
    result["expected_interval_seconds"] = _positive_int(market["expected_interval_seconds"], "expected_interval_seconds")
    result["periods_per_year"] = _number(market["periods_per_year"], "periods_per_year", minimum=1.0, maximum=10_000_000.0)
    if not isinstance(market["reject_gaps"], bool):
        raise BacktestInputError("reject_gaps must be a boolean")
    result["reject_gaps"] = market["reject_gaps"]
    return result


def _validate_cost_model(cost_model: Any) -> dict[str, float]:
    required = {
        "fee_bps_per_side", "spread_bps_full", "slippage_bps_per_side",
        "financing_bps_per_day",
    }
    if not isinstance(cost_model, Mapping):
        raise BacktestInputError("an explicit cost_model is required; zero-cost defaults are not assumed")
    missing = required - set(cost_model)
    unknown = set(cost_model) - required
    if missing or unknown:
        raise BacktestInputError(
            f"cost model fields invalid; missing={sorted(missing)}, unknown={sorted(unknown)}"
        )
    return {
        "fee_bps_per_side": _number(cost_model["fee_bps_per_side"], "fee_bps_per_side", maximum=2_000.0),
        "spread_bps_full": _number(cost_model["spread_bps_full"], "spread_bps_full", maximum=2_000.0),
        "slippage_bps_per_side": _number(cost_model["slippage_bps_per_side"], "slippage_bps_per_side", maximum=2_000.0),
        "financing_bps_per_day": _number(cost_model["financing_bps_per_day"], "financing_bps_per_day", maximum=10_000.0),
    }


def _validate_candle_lineage(
    candles: Sequence[Mapping[str, Any]],
    *,
    expected_interval_seconds: int,
    reject_gaps: bool,
) -> tuple[list[dict[str, datetime]], dict[str, Any]]:
    report = validate_ohlcv(
        candles,
        expected_interval_seconds=expected_interval_seconds,
        reject_gaps=reject_gaps,
    )
    lineage: list[dict[str, datetime]] = []
    previous_available: datetime | None = None
    for index, candle in enumerate(candles):
        if candle.get("is_closed") is not True:
            raise BacktestInputError(f"candle {index}: only explicitly completed candles are accepted")
        opened = _timestamp(candle.get("timestamp"), "timestamp", index)
        closed = _timestamp(candle.get("close_time"), "close_time", index)
        available = _timestamp(candle.get("available_at"), "available_at", index)
        ingested = _timestamp(candle.get("ingested_at"), "ingested_at", index)
        if closed <= opened:
            raise BacktestInputError(f"candle {index}: close_time must be after timestamp")
        if available < closed:
            raise BacktestInputError(f"candle {index}: available_at cannot precede close_time")
        if ingested < available:
            raise BacktestInputError(f"candle {index}: ingested_at cannot precede available_at")
        effective = max(available, ingested)
        if previous_available is not None and effective < previous_available:
            raise BacktestInputError("candle availability must be non-decreasing")
        previous_available = effective
        if index + 1 < len(candles):
            next_open = _timestamp(candles[index + 1].get("timestamp"), "timestamp", index + 1)
            if closed > next_open:
                raise BacktestInputError(f"candle {index}: bars must not overlap")
        lineage.append({
            "open": opened,
            "close": closed,
            "available": available,
            "ingested": ingested,
            "effective": effective,
        })
    quality = {
        "row_count": report.row_count,
        "start_timestamp": report.start_timestamp,
        "end_timestamp": report.end_timestamp,
        "observed_gap_count": report.observed_gap_count,
        "observed_irregular_interval_count": report.observed_irregular_interval_count,
        "warnings": list(report.warnings),
    }
    return lineage, quality


def _ema(values: Sequence[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if len(values) < period:
        return result
    current = sum(values[:period]) / period
    result[period - 1] = current
    alpha = 2.0 / (period + 1.0)
    for index in range(period, len(values)):
        current = alpha * values[index] + (1.0 - alpha) * current
        result[index] = current
    return result


def _fill_price(mid: float, side: str, costs: Mapping[str, float]) -> float:
    adverse_bps = costs["spread_bps_full"] / 2.0 + costs["slippage_bps_per_side"]
    adjustment = adverse_bps / 10_000.0
    return mid * (1.0 + adjustment if side == "buy" else 1.0 - adjustment)


def _charge_financing(
    position: dict[str, Any],
    cash: float,
    mark_price: float,
    end_time: datetime,
    market: Mapping[str, Any],
    costs: Mapping[str, float],
) -> tuple[float, float]:
    seconds = max(0.0, (end_time - position["last_financing_time"]).total_seconds())
    if seconds == 0 or costs["financing_bps_per_day"] == 0:
        position["last_financing_time"] = end_time
        return cash, 0.0
    notional = (
        position["quantity"] * mark_price
        * market["contract_multiplier"] * market["quote_to_account_rate"]
    )
    charge = notional * costs["financing_bps_per_day"] / 10_000.0 * seconds / 86_400.0
    position["financing_cost"] += charge
    position["last_financing_time"] = end_time
    return cash - charge, charge


def _close_position(
    *,
    position: dict[str, Any],
    cash: float,
    mid_price: float,
    timestamp: datetime,
    bar_index: int,
    reason: str,
    market: Mapping[str, Any],
    costs: Mapping[str, float],
) -> tuple[float, dict[str, Any]]:
    fill = _fill_price(mid_price, "sell", costs)
    conversion = market["contract_multiplier"] * market["quote_to_account_rate"]
    proceeds = position["quantity"] * fill * conversion
    exit_fee = proceeds * costs["fee_bps_per_side"] / 10_000.0
    cash += proceeds - exit_fee
    gross_pnl = position["quantity"] * (mid_price - position["entry_mid_price"]) * conversion
    execution_cost = position["quantity"] * (
        (position["entry_fill_price"] - position["entry_mid_price"])
        + (mid_price - fill)
    ) * conversion
    net_pnl = cash - position["cash_before_entry"]
    denominator = position["cash_before_entry"] if position["cash_before_entry"] > 0 else None
    trade = {
        "signal_index": position["signal_index"],
        "entry_index": position["entry_index"],
        "entry_timestamp": _iso(position["entry_timestamp"]),
        "entry_mid_price": position["entry_mid_price"],
        "entry_fill_price": position["entry_fill_price"],
        "exit_index": bar_index,
        "exit_timestamp": _iso(timestamp),
        "exit_mid_price": mid_price,
        "exit_fill_price": fill,
        "exit_reason": reason,
        "quantity": position["quantity"],
        "gross_pnl_account_currency": gross_pnl,
        "execution_cost_account_currency": execution_cost,
        "fees_account_currency": position["entry_fee"] + exit_fee,
        "financing_cost_account_currency": position["financing_cost"],
        "net_pnl_account_currency": net_pnl,
        "net_return_pct_on_pre_trade_equity": (net_pnl / denominator * 100.0) if denominator else None,
        "holding_bars": bar_index - position["entry_index"] + 1,
    }
    return cash, trade


def _benchmark_return(
    candles: Sequence[Mapping[str, Any]],
    lineage: Sequence[Mapping[str, datetime]],
    market: Mapping[str, Any],
    costs: Mapping[str, float],
    initial_cash: float,
    exposure_fraction: float,
) -> float | None:
    entry_index = next(
        (i for i in range(1, len(candles)) if lineage[0]["effective"] <= lineage[i]["open"]),
        None,
    )
    if entry_index is None:
        return None
    conversion = market["contract_multiplier"] * market["quote_to_account_rate"]
    mid_entry = float(candles[entry_index]["open"])
    fill_entry = _fill_price(mid_entry, "buy", costs)
    budget = initial_cash * exposure_fraction
    quantity = budget / (fill_entry * conversion)
    entry_notional = quantity * fill_entry * conversion
    entry_fee = entry_notional * costs["fee_bps_per_side"] / 10_000.0
    cash = initial_cash - entry_notional - entry_fee
    mid_exit = float(candles[-1]["close"])
    fill_exit = _fill_price(mid_exit, "sell", costs)
    exit_notional = quantity * fill_exit * conversion
    exit_fee = exit_notional * costs["fee_bps_per_side"] / 10_000.0
    seconds = max(0.0, (lineage[-1]["close"] - lineage[entry_index]["open"]).total_seconds())
    financing = (
        quantity * mid_exit * conversion * costs["financing_bps_per_day"]
        / 10_000.0 * seconds / 86_400.0
    )
    final_equity = cash + exit_notional - exit_fee - financing
    return (final_equity / initial_cash - 1.0) * 100.0


def run_ema_crossover_backtest(
    candles: Sequence[Mapping[str, Any]],
    *,
    strategy_parameters: Mapping[str, Any],
    market: Mapping[str, Any],
    cost_model: Mapping[str, Any],
    initial_cash: float,
    exposure_fraction: float,
    code_revision: str,
) -> dict[str, Any]:
    """Run a deterministic long/flat EMA test with point-in-time execution.

    timestamp is the bar-open time. A signal is computed only from a completed
    bar and may fill only at a later bar open at or after both available_at
    and ingested_at. The evaluator is deliberately unleveraged and long/flat.
    """
    if not isinstance(candles, Sequence) or isinstance(candles, (str, bytes)) or len(candles) < 5:
        raise BacktestInputError("at least five completed OHLCV candles are required")
    if not isinstance(strategy_parameters, Mapping):
        raise BacktestInputError("strategy_parameters must be an object")
    if set(strategy_parameters) != {"fast_period", "slow_period"}:
        raise BacktestInputError("strategy_parameters must contain only fast_period and slow_period")
    fast = _positive_int(strategy_parameters["fast_period"], "fast_period")
    slow = _positive_int(strategy_parameters["slow_period"], "slow_period")
    if not 2 <= fast < slow <= len(candles):
        raise BacktestInputError("require 2 <= fast_period < slow_period <= candle count")

    market_data = _validate_market(market)
    costs = _validate_cost_model(cost_model)
    cash_start = _number(initial_cash, "initial_cash", minimum=1e-12)
    exposure = _number(exposure_fraction, "exposure_fraction", minimum=1e-9, maximum=1.0)
    if not isinstance(code_revision, str) or not _SHA.fullmatch(code_revision):
        raise BacktestInputError("code_revision must be a full 40- or 64-character Git SHA")

    lineage, quality = _validate_candle_lineage(
        candles,
        expected_interval_seconds=market_data["expected_interval_seconds"],
        reject_gaps=market_data["reject_gaps"],
    )
    opens = [float(row["open"]) for row in candles]
    closes = [float(row["close"]) for row in candles]
    fast_ema = _ema(closes, fast)
    slow_ema = _ema(closes, slow)

    decisions: list[dict[str, Any]] = []
    target = 0
    for index in range(1, len(candles)):
        if fast_ema[index - 1] is None or slow_ema[index - 1] is None:
            continue
        if fast_ema[index] is None or slow_ema[index] is None:
            continue
        crossed_up = fast_ema[index - 1] <= slow_ema[index - 1] and fast_ema[index] > slow_ema[index]
        crossed_down = fast_ema[index - 1] >= slow_ema[index - 1] and fast_ema[index] < slow_ema[index]
        if crossed_up:
            target = 1
        elif crossed_down:
            target = 0
        else:
            continue
        decisions.append({
            "signal_index": index,
            "available_at": lineage[index]["effective"],
            "target": target,
        })

    conversion = market_data["contract_multiplier"] * market_data["quote_to_account_rate"]
    cash = cash_start
    position: dict[str, Any] | None = None
    decision_cursor = 0
    desired_position = 0
    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    peak = cash_start
    max_drawdown = 0.0
    exposed_bars = 0

    for index, candle in enumerate(candles):
        open_time = lineage[index]["open"]
        open_price = opens[index]
        if position is not None:
            cash, _ = _charge_financing(position, cash, open_price, open_time, market_data, costs)

        while decision_cursor < len(decisions) and decisions[decision_cursor]["available_at"] <= open_time:
            desired_position = decisions[decision_cursor]["target"]
            decision_cursor += 1

        if desired_position == 1 and position is None:
            mid_fill = _fill_price(open_price, "buy", costs)
            cash_before = cash
            budget = cash * exposure
            quantity = budget / (mid_fill * conversion)
            entry_notional = quantity * mid_fill * conversion
            entry_fee = entry_notional * costs["fee_bps_per_side"] / 10_000.0
            cash -= entry_notional + entry_fee
            signal_index = next(
                item["signal_index"] for item in reversed(decisions[:decision_cursor])
                if item["target"] == 1 and item["available_at"] <= open_time
            )
            position = {
                "quantity": quantity,
                "entry_mid_price": open_price,
                "entry_fill_price": mid_fill,
                "entry_fee": entry_fee,
                "cash_before_entry": cash_before,
                "entry_index": index,
                "entry_timestamp": open_time,
                "signal_index": signal_index,
                "financing_cost": 0.0,
                "last_financing_time": open_time,
            }
        elif desired_position == 0 and position is not None:
            cash, trade = _close_position(
                position=position, cash=cash, mid_price=open_price, timestamp=open_time,
                bar_index=index, reason="signal", market=market_data, costs=costs,
            )
            trades.append(trade)
            position = None

        close_time = lineage[index]["close"]
        if position is not None:
            cash, _ = _charge_financing(position, cash, closes[index], close_time, market_data, costs)
            exposed_bars += 1
        equity = cash + (
            position["quantity"] * closes[index] * conversion if position is not None else 0.0
        )
        equity_curve.append({"index": index, "timestamp": _iso(close_time), "equity": equity})
        peak = max(peak, equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - equity) / peak)

    if position is not None:
        cash, trade = _close_position(
            position=position, cash=cash, mid_price=closes[-1], timestamp=lineage[-1]["close"],
            bar_index=len(candles) - 1, reason="end_of_data", market=market_data, costs=costs,
        )
        trades.append(trade)
        equity_curve[-1]["equity"] = cash
        peak = max(peak, cash)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - cash) / peak)

    final_equity = equity_curve[-1]["equity"]
    bar_returns = [
        equity_curve[index]["equity"] / equity_curve[index - 1]["equity"] - 1.0
        for index in range(1, len(equity_curve))
        if equity_curve[index - 1]["equity"] > 0
    ]
    mean_return = sum(bar_returns) / len(bar_returns) if bar_returns else 0.0
    variance = (
        sum((value - mean_return) ** 2 for value in bar_returns) / (len(bar_returns) - 1)
        if len(bar_returns) > 1 else 0.0
    )
    std_return = sqrt(variance) if variance > 0 else 0.0
    downside = sqrt(sum(min(value, 0.0) ** 2 for value in bar_returns) / len(bar_returns)) if bar_returns else 0.0
    periods_per_year = market_data["periods_per_year"]
    sharpe = mean_return / std_return * sqrt(periods_per_year) if std_return > 0 else None
    sortino = mean_return / downside * sqrt(periods_per_year) if downside > 0 else None
    volatility_pct = std_return * sqrt(periods_per_year) * 100.0 if std_return > 0 else None

    net_trades = [trade["net_pnl_account_currency"] for trade in trades]
    gains = sum(value for value in net_trades if value > 0)
    losses = abs(sum(value for value in net_trades if value < 0))
    profit_factor = gains / losses if losses > 0 else None
    wins = sum(value > 0 for value in net_trades)
    elapsed_seconds = (lineage[-1]["close"] - lineage[0]["open"]).total_seconds()
    elapsed_years = elapsed_seconds / (365.25 * 86_400.0)
    cagr = ((final_equity / cash_start) ** (1.0 / elapsed_years) - 1.0) * 100.0 if final_equity > 0 and elapsed_years > 0 else None

    ohlcv_sha256 = canonical_dataset_sha256(candles)
    lineage_payload = {
        "schema_version": "nova.backtest-dataset.v1",
        "market": market_data,
        "ohlcv_sha256": ohlcv_sha256,
        "bar_lineage": [
            {
                "timestamp": _iso(item["open"]),
                "close_time": _iso(item["close"]),
                "available_at": _iso(item["available"]),
                "ingested_at": _iso(item["ingested"]),
                "is_closed": True,
            }
            for item in lineage
        ],
    }
    dataset_sha256 = sha256(
        json.dumps(lineage_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    parameters = {"fast_period": fast, "slow_period": slow}
    evaluation = {
        "market": market_data,
        "cost_model": costs,
        "initial_cash": cash_start,
        "exposure_fraction": exposure,
        "evaluator_version": EVALUATOR_VERSION,
    }
    run_fingerprint = build_run_fingerprint(
        dataset_sha256=dataset_sha256,
        code_revision=code_revision,
        strategy_id=STRATEGY_ID,
        strategy_version=STRATEGY_VERSION,
        parameters=parameters,
        evaluation=evaluation,
        seed=0,
    )
    return {
        "status": "completed",
        "mode": "research_backtest_only",
        "evaluator_version": EVALUATOR_VERSION,
        "strategy": {"id": STRATEGY_ID, "version": STRATEGY_VERSION, "parameters": parameters},
        "market": market_data,
        "cost_model": costs,
        "data_quality": quality,
        "dataset_sha256": dataset_sha256,
        "ohlcv_sha256": ohlcv_sha256,
        "code_revision": code_revision,
        "run_fingerprint": run_fingerprint,
        "bars_analyzed": len(candles),
        "trade_count": len(trades),
        "win_rate_pct": wins / len(trades) * 100.0 if trades else 0.0,
        "profit_factor": profit_factor,
        "profit_factor_status": "has_losses" if losses > 0 else "no_losing_trades",
        "total_return_pct": (final_equity / cash_start - 1.0) * 100.0,
        "cagr_pct": cagr,
        "max_drawdown_pct": max_drawdown * 100.0,
        "sharpe_annualized": sharpe,
        "sortino_annualized": sortino,
        "volatility_annualized_pct": volatility_pct,
        "expectancy_account_currency": sum(net_trades) / len(trades) if trades else None,
        "exposure_pct": exposed_bars / len(candles) * 100.0,
        "buy_and_hold_return_pct": _benchmark_return(
            candles, lineage, market_data, costs, cash_start, exposure
        ),
        "initial_equity": cash_start,
        "final_equity": final_equity,
        "equity_curve": equity_curve[-500:],
        "trades": trades,
        "execution_assumptions": [
            "completed candles only; no forming candle is accepted",
            "signals use EMA values through the completed bar close",
            "a decision is usable only after available_at and ingested_at",
            "orders are simulated at the first subsequent bar open after data availability",
            "spread is charged as half-spread on each side; slippage and fees are charged per side",
            "long-only, unleveraged exposure; no intrabar stop/target fills",
            "end-of-data positions are liquidated at the final close with adverse execution costs",
        ],
        "warnings": [
            "Historical simulation is not a forecast and does not establish profitability.",
            "The evaluator is a linear long/flat model; broker-specific margin, lot rounding, swap schedules, funding events, market impact, and variable FX conversion require a separately validated instrument adapter.",
            "financing_bps_per_day is a constant estimate, not an observed broker swap or exchange funding cashflow.",
            "Use immutable provider snapshots and session-calendar validation before interpreting gaps or comparing instruments.",
        ],
        "orders_submitted": False,
        "execution_enabled": False,
        "order_submission_enabled": False,
        "live_trading_enabled": False,
    }

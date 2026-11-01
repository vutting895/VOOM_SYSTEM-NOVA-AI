"""Deterministic, long-only OHLCV simulator for research signals.

Signals are observed at candle close and executed at the next candle open.
This module is research-only and has no broker or order-routing integration.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime
from typing import Any, Sequence


class BacktestInputError(ValueError):
    """Raised when a dataset, signal stream, or simulation config is invalid."""


def _number(value: Any, field: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise BacktestInputError(f"{field} must be numeric") from exc
    if not math.isfinite(result):
        raise BacktestInputError(f"{field} must be finite")
    return result


def _timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise BacktestInputError("timestamp must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BacktestInputError("timestamp must be valid ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise BacktestInputError("timestamp must include a timezone")
    return parsed


class StrategyBacktestEngine:
    """Execute close-derived {-1, 0, 1} signals at the following bar open.

    1 enters a long position, -1 exits, and 0 leaves the position unchanged.
    Only one long position may be open. Position sizing uses a fixed fraction
    of equity at entry. Costs are charged on both entry and exit.
    """

    def __init__(
        self,
        initial_cash: float = 10_000.0,
        allocation_fraction: float = 1.0,
        fee_bps: float = 0.0,
        spread_bps: float = 0.0,
        slippage_bps: float = 0.0,
    ) -> None:
        self.initial_cash = _number(initial_cash, "initial_cash")
        self.allocation_fraction = _number(allocation_fraction, "allocation_fraction")
        self.fee_bps = _number(fee_bps, "fee_bps")
        self.spread_bps = _number(spread_bps, "spread_bps")
        self.slippage_bps = _number(slippage_bps, "slippage_bps")
        if self.initial_cash <= 0:
            raise BacktestInputError("initial_cash must be positive")
        if not 0 < self.allocation_fraction <= 1:
            raise BacktestInputError("allocation_fraction must be in (0, 1]")
        if any(x < 0 or x > 1_000 for x in (self.fee_bps, self.spread_bps, self.slippage_bps)):
            raise BacktestInputError("cost basis points must be between 0 and 1000")

    @staticmethod
    def _validate(candles: Sequence[dict[str, Any]], signals: Sequence[int]) -> tuple[list[dict[str, float]], list[str]]:
        if not isinstance(candles, (list, tuple)) or len(candles) < 3:
            raise BacktestInputError("At least 3 OHLCV candles are required")
        if not isinstance(signals, (list, tuple)) or len(signals) != len(candles):
            raise BacktestInputError("signals length must equal candle count")

        normalized: list[dict[str, float]] = []
        timestamps: list[str] = []
        previous: datetime | None = None
        for index, row in enumerate(candles):
            if not isinstance(row, dict):
                raise BacktestInputError(f"candle {index} must be an object")
            stamp = _timestamp(row.get("timestamp"))
            if previous is not None and stamp <= previous:
                raise BacktestInputError("candles must have strictly increasing timestamps")
            previous = stamp
            candle = {key: _number(row.get(key), f"candle[{index}].{key}")
                      for key in ("open", "high", "low", "close", "volume")}
            if candle["open"] <= 0 or candle["close"] <= 0 or candle["volume"] < 0:
                raise BacktestInputError("prices must be positive and volume non-negative")
            if candle["high"] < max(candle["open"], candle["close"], candle["low"]):
                raise BacktestInputError("candle high is inconsistent with OHLC")
            if candle["low"] > min(candle["open"], candle["close"], candle["high"]):
                raise BacktestInputError("candle low is inconsistent with OHLC")
            normalized.append(candle)
            timestamps.append(stamp.isoformat())

        for index, signal in enumerate(signals):
            if isinstance(signal, bool) or signal not in (-1, 0, 1):
                raise BacktestInputError(f"signal[{index}] must be -1, 0, or 1")
        return normalized, timestamps

    def _fill_price(self, price: float, side: str) -> float:
        half_cost = (self.spread_bps / 2 + self.slippage_bps) / 10_000
        return price * (1 + half_cost if side == "buy" else 1 - half_cost)

    def run_market_data(
        self,
        payload: dict[str, Any],
        signals: Sequence[int],
        strategy_name: str = "external_signal_adapter",
    ) -> dict[str, Any]:
        """Run against a verified NOVA System Hub quote payload, excluding its active bar."""
        try:
            from market_data import normalize_mt5_quote_payload
        except ImportError:
            from .market_data import normalize_mt5_quote_payload
        market = normalize_mt5_quote_payload(payload, drop_latest_bar=True)
        result = self.run(market["candles"], signals, strategy_name)
        result["market_data"] = {
            "provider": market["provider"],
            "environment": market["environment"],
            "source": market["source"],
            "symbol": market["symbol"],
            "timeframe": market["timeframe"],
            "closed_bar_count": market["closed_bar_count"],
            "active_bar_excluded": market["active_bar_excluded"],
            "received_at": market["received_at"],
            "as_of": market["as_of"],
        }
        return result

    def run(
        self,
        candles: Sequence[dict[str, Any]],
        signals: Sequence[int],
        strategy_name: str = "external_signal_adapter",
    ) -> dict[str, Any]:
        bars, timestamps = self._validate(candles, signals)
        if not isinstance(strategy_name, str) or not strategy_name.strip() or len(strategy_name) > 100:
            raise BacktestInputError("strategy_name must be a non-empty string up to 100 chars")

        dataset_payload = json.dumps(
            [{"timestamp": timestamps[i], **bars[i]} for i in range(len(bars))],
            sort_keys=True, separators=(",", ":"), allow_nan=False,
        ).encode("utf-8")
        dataset_hash = hashlib.sha256(dataset_payload).hexdigest()

        cash = self.initial_cash
        quantity = 0.0
        entry_fill = 0.0
        entry_fee = 0.0
        entry_time = ""
        entry_signal_index = -1
        equity_curve: list[dict[str, Any]] = []
        trades: list[dict[str, Any]] = []
        total_fees = 0.0
        pending_signal_count = 0

        def commission(notional: float) -> float:
            return notional * self.fee_bps / 10_000

        def close_position(raw_price: float, timestamp: str, signal_index: int, reason: str) -> None:
            nonlocal cash, quantity, total_fees
            exit_fill = self._fill_price(raw_price, "sell")
            exit_notional = quantity * exit_fill
            exit_fee = commission(exit_notional)
            cash += exit_notional - exit_fee
            total_fees += exit_fee
            net_pnl = (exit_notional - exit_fee) - (quantity * entry_fill + entry_fee)
            entry_notional = quantity * entry_fill
            trades.append({
                "entry_time": entry_time,
                "exit_time": timestamp,
                "entry_signal_index": entry_signal_index,
                "exit_signal_index": signal_index,
                "entry_price": round(entry_fill, 8),
                "exit_price": round(exit_fill, 8),
                "quantity": round(quantity, 10),
                "net_pnl": round(net_pnl, 8),
                "return_pct": round(net_pnl / (entry_notional + entry_fee) * 100, 6),
                "fees": round(entry_fee + exit_fee, 8),
                "exit_reason": reason,
            })
            quantity = 0.0

        for index, bar in enumerate(bars):
            # Signal[i-1] was only known after the previous candle closed.
            if index > 0:
                signal = signals[index - 1]
                if quantity == 0 and signal == 1:
                    raw_price = bar["open"]
                    fill = self._fill_price(raw_price, "buy")
                    budget = cash * self.allocation_fraction
                    fee = commission(budget)
                    quantity = budget / (fill * (1 + self.fee_bps / 10_000))
                    entry_notional = quantity * fill
                    entry_fee = commission(entry_notional)
                    cash -= entry_notional + entry_fee
                    total_fees += entry_fee
                    entry_fill = fill
                    entry_time = timestamps[index]
                    entry_signal_index = index - 1
                elif quantity > 0 and signal == -1:
                    close_position(bar["open"], timestamps[index], index - 1, "signal")

            mark_to_market = cash + quantity * bar["close"]
            equity_curve.append({"timestamp": timestamps[index], "equity": round(mark_to_market, 8)})

        # Force-close at the final close so reported final equity is realized.
        if quantity > 0:
            close_position(bars[-1]["close"], timestamps[-1], len(bars) - 1, "end_of_data")
            equity_curve[-1]["equity"] = round(cash, 8)

        pending_signal_count = 1 if signals[-1] != 0 else 0
        values = [point["equity"] for point in equity_curve]
        peak = self.initial_cash
        max_drawdown = 0.0
        for value in values:
            peak = max(peak, value)
            if peak > 0:
                max_drawdown = max(max_drawdown, (peak - value) / peak)

        profits = [trade["net_pnl"] for trade in trades]
        gains = sum(value for value in profits if value > 0)
        losses = abs(sum(value for value in profits if value < 0))
        final_equity = cash
        net_profit = final_equity - self.initial_cash
        return {
            "status": "completed",
            "strategy": strategy_name,
            "execution_model": "next_bar_open",
            "signal_timing": "bar_close",
            "dataset_hash": dataset_hash,
            "candles": len(bars),
            "closed_trades": len(trades),
            "wins": sum(value > 0 for value in profits),
            "losses": sum(value < 0 for value in profits),
            "win_rate_pct": round(100 * sum(value > 0 for value in profits) / len(trades), 4) if trades else 0.0,
            "gross_profit": round(gains, 8),
            "gross_loss": round(losses, 8),
            "net_profit": round(net_profit, 8),
            "net_return_pct": round(net_profit / self.initial_cash * 100, 6),
            "profit_factor": round(gains / losses, 6) if losses else (None if not gains else "undefined_no_losses"),
            "max_drawdown_pct": round(max_drawdown * 100, 6),
            "final_equity": round(final_equity, 8),
            "total_fees": round(total_fees, 8),
            "costs_bps": {"fee": self.fee_bps, "spread": self.spread_bps, "slippage": self.slippage_bps},
            "pending_final_signal": bool(pending_signal_count),
            "equity_curve": equity_curve,
            "trades": trades,
            "execution_enabled": False,
            "live_trading_enabled": False,
            "warning": "Research simulation only. Signals must be generated without future data; validate data gaps, broker costs and fill assumptions before interpreting results.",
        }
